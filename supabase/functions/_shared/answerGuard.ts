// Server-side check that a tutor reply does not reveal the final answer.
// The model reports its verified answer in the private finalAnswer field;
// prompts alone do not reliably stop leaks (measured in the multilingual
// eval: a Level 3 French hint wrote out the full derivative).

const SUPERSCRIPTS: Record<string, string> = { "²": "^2", "³": "^3", "¹": "^1", "⁴": "^4", "⁰": "^0" };

export function normalizeMath(s: string): string {
  return s
    .replace(/\\(cdot|times|left|right|,|;|!|quad|qquad)/g, "")  // LaTeX spacing/multiplication
    .replace(/\\(?:text|mathrm|operatorname)\{([^}]*)\}/g, "$1")
    .replace(/\\([a-zA-Z]+)/g, "$1")                              // \sin -> sin, \pi -> pi
    .replace(/\$/g, "")
    .toLowerCase()
    .replace(/[²³¹⁴⁰]/g, ch => SUPERSCRIPTS[ch])
    .replace(/[\s·×*()\[\]{}]/g, "")
    .replace(/−/g, "-")
    .replace(/,(?=\d)/g, ".");
}

interface Numeric { value: string; unit: string }

// "3 A" -> {3, a}; "60 km/h" -> {60, km/h}; "11" -> {11, ""}; "2x+1" -> null
function asNumeric(answer: string): Numeric | null {
  const m = /^\s*([-+]?\d+(?:[.,]\d+)?)\s*([^\d\s=].{0,15})?\s*$/.exec(answer);
  if (!m) return null;
  const unit = (m[2] || "").trim();
  if (/[a-z]\s*[+\-^]/i.test(unit)) return null; // an expression, not a unit
  return { value: m[1].replace(",", "."), unit: unit.toLowerCase() };
}

function escapeRe(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

export function revealsAnswer(message: string, finalAnswer: string | null | undefined, studentMessages: string[] = []): boolean {
  if (!finalAnswer) return false;
  const answer = finalAnswer.includes("=") ? finalAnswer.split("=").pop()!.trim() : finalAnswer.trim();
  if (!answer) return false;

  const num = asNumeric(answer);
  if (num) {
    const v = escapeRe(num.value);
    const patterns = [new RegExp(`(=|≈|≅)\\s*${v}(?![\\d.])`)];
    if (num.unit) patterns.push(new RegExp(`(?<![\\d.])${v}\\s*${escapeRe(num.unit)}`, "i"));
    const leaked = (text: string) => patterns.some(p => p.test(text.replace(/,(?=\d)/g, ".")));
    if (!leaked(message)) return false;
    // Repeating back an answer the student already gave is a confirmation, not a leak.
    return !studentMessages.some(leaked);
  }

  const target = normalizeMath(answer);
  if (target.length < 4) return false; // too short to match reliably
  if (!normalizeMath(message).includes(target)) return false;
  return !studentMessages.some(s => normalizeMath(s).includes(target));
}
