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
    .replace(/[₀-₉]/g, ch => String(ch.charCodeAt(0) - 0x2080)) // H₂O is H2O
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
    const patterns = [new RegExp(`(=|≈|≅)\\s*${v}(?!\\d|\\.\\d)`)];   // the full stop in "x = 4." ends the sentence; 4.5 is a different number
    if (num.unit) patterns.push(new RegExp(`(?<![\\d.])${v}\\s*${escapeRe(num.unit)}(?![\\p{L}\\d/²³])`, "iu")); // "20 m" is not "20 m/s"
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

// Does a reply to a wrong attempt hand over the corrected result of the step ("should be 6x, not 3x")?
// The final-answer check above can't see this: the student was asked about one step, and its result
// is not the final answer. The student should repair the step, not copy it.
export function statesCorrection(message: string, studentText: string): boolean {
  const attempt = normalizeMath((studentText.includes("=") ? studentText.split("=").pop()! : studentText).replace(/[.;!?]+\s*$/, ""));
  if (!attempt || attempt.length > 30 || !/[\d\p{L}]/u.test(attempt)) return false;
  const text = message.replace(/\s+/g, " ");
  const same = (s: string) => normalizeMath(s.replace(/[.;!?]+\s*$/, "")) === attempt;
  const value = "([^,.;:!?()]{1,40}?)";
  const patterns: [RegExp, number, number][] = [   // [pattern, group holding the correction, group holding the student's value]
    [new RegExp(`(?:should be|should have been|should give|is actually|gives|equals|is|=|devrait être|donne|est)\\s+${value},?\\s+(?:not|rather than|instead of|et non|au lieu de|pas)\\s+${value}(?=[,.;:!?)]|$)`, "giu"), 1, 2],
    [new RegExp(`\\bnot\\s+${value}\\s+but\\s+${value}(?=[,.;:!?)]|$)`, "giu"), 2, 1],
  ];
  // "The correct derivative of 3x² is 6x": the result is announced outright, with or without the student's value beside it.
  for (const m of text.matchAll(/\b(?:the\s+)?(?:correct|right|bonne|juste)\s+(?:[\p{L}']+\s+){0,3}(?:(?:of|for|de|du)\s+[^,.;:!?]{1,25}?\s+)?(?:is|would be|should be|est|serait)\s+([^,.;:!?()]{1,40}?)(?=[,.;:!?)]|$)/giu)) {
    if (!same(m[1]) && /\d/.test(m[1]) && !/\b(?:not|pas)\b/i.test(m[1])) return true;
  }
  for (const [re, fix, theirs] of patterns) {
    for (const m of text.matchAll(re)) {
      if (same(m[theirs]) && !same(m[fix]) && /[\d=^]/.test(m[fix])) return true;
    }
  }
  return false;
}

// Does the student's own text contain the verified answer? Used before a solve
// counts toward progress, so the model's "solved" claim is never enough alone.
// Units are optional for the student ("3" matches "3 A"); expressions must appear in full.
export function matchesAnswer(studentText: string, finalAnswer: string | null | undefined): boolean {
  if (!finalAnswer || !studentText) return false;
  const answer = finalAnswer.includes("=") ? finalAnswer.split("=").pop()!.trim() : finalAnswer.trim();
  if (!answer) return false;
  const num = asNumeric(answer);
  if (num) {
    const text = studentText.replace(/,(?=\d)/g, ".").replace(/−/g, "-");
    const value = num.value.replace(/^\+/, "");
    const before = value.startsWith("-") ? "(?<![\\d.])" : "(?<![\\d.-])"; // "-3" is not "3"
    return new RegExp(`${before}${escapeRe(value)}(?![\\d]|\\.\\d)`).test(text);
  }
  const target = normalizeMath(answer);
  return target.length > 0 && normalizeMath(studentText).includes(target);
}

// Does the student's final stated result (after their last "=", or the whole
// message) equal the verified answer? Stricter than matchesAnswer, so a given
// value quoted in a wrong working ("20 × 2 = 40") does not count.
export function statesAnswer(studentText: string, finalAnswer: string | null | undefined): boolean {
  if (!studentText) return false;
  const last = studentText.includes("=") ? studentText.split("=").pop()! : studentText;
  return matchesAnswer(last, finalAnswer);
}
