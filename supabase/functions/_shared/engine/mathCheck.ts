// Checks the arithmetic a tutor reply shows, without a model.
//
// A language model can write "V_parallel = 4.29 V ... Check: I₂ + I₄ ≈ I_total" when the numbers
// do not add up (seen on the live site, 13 November 2026). This reads every chain of the form
//   a = b = c   or   a ≈ b
// in a reply, works out each side that is pure arithmetic, and reports the ones that disagree.
// Names given a value earlier in the same worked example ("I_total = ... = 4.29 A") are filled in,
// so a later line that uses them can be checked too.
//
// It is deliberately cautious: a side it cannot evaluate with certainty (an unknown, a word, a unit
// it doesn't know, trigonometry or logarithms whose convention is unclear) is skipped, never guessed.
// It checks that shown numbers are consistent; it cannot tell whether the method is the right one.
import { evaluate, parseExpression } from "./expr.ts";

export interface ArithmeticProblem { statement: string; left: string; right: string; leftValue: number; rightValue: number }
export interface ArithmeticCheck { checked: number; problems: ArithmeticProblem[] }

const PREFIX: Record<string, number> = { k: 1e3, M: 1e6, G: 1e9, m: 1e-3, "µ": 1e-6, u: 1e-6, n: 1e-9, p: 1e-12, c: 1e-2 };
// Base units and the factor that brings them to SI. Longest first so "mol" and "min" win over "m".
const BASE: Record<string, number> = {
  mol: 1, min: 60, rad: 1, ohms: 1, ohm: 1, Hz: 1, Wb: 1, Pa: 1, eV: 1,
  "Ω": 1, V: 1, A: 1, W: 1, N: 1, J: 1, s: 1, m: 1, g: 1e-3, C: 1, F: 1, H: 1, T: 1, K: 1, L: 1, h: 3600,
};
const BASES = Object.keys(BASE).sort((a, b) => b.length - a.length);
const SUP: Record<string, number> = { "²": 2, "³": 3 };

// One unit such as "mA", "kΩ", "m", "s²", "kg": its factor to SI, and how much text it used. Null if it isn't a unit.
function unitAt(text: string, at: number): { scale: number; length: number } | null {
  const tryBase = (i: number, prefix: number) => {
    for (const b of BASES) {
      if (!text.startsWith(b, i)) continue;
      let end = i + b.length, powerOf = 1;
      const pow = /^(?:\^(\d)|([²³]))/.exec(text.slice(end));
      if (pow) { powerOf = pow[1] ? Number(pow[1]) : SUP[pow[2]]; end += pow[0].length; }
      if (/[\p{L}\p{N}_]/u.test(text[end] ?? "")) continue;       // part of a longer word
      return { scale: (prefix * BASE[b]) ** powerOf, length: end - at };
    }
    return null;
  };
  // "kg" is the SI unit of mass; a bare prefix is never a unit.
  if (text.startsWith("kg", at) && !/[\p{L}\p{N}_]/u.test(text[at + 2] ?? "")) return { scale: 1, length: 2 };
  const plain = tryBase(at, 1);
  const p = PREFIX[text[at]];
  const prefixed = p === undefined ? null : tryBase(at + 1, p);
  // Prefer the reading that uses more of the text ("ms" is milliseconds, not metres followed by s).
  if (prefixed && (!plain || prefixed.length > plain.length)) return prefixed;
  return plain;
}

// Replace "12 V", "4 kΩ", "72 km/h", "30°", "45 %" with plain numbers in SI. Null when a letter is left that isn't maths.
function toArithmetic(piece: string): string | null {
  let s = piece.replace(/(\d),(\d{3})(?!\d)/g, "$1$2").replace(/(\d),(\d)/g, "$1.$2").replace(/[−–]/g, "-").replace(/[×·⋅∙]/g, "*").replace(/÷/g, "/");
  let out = "", i = 0;
  while (i < s.length) {
    const num = /^\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/.exec(s.slice(i));
    if (!num) { out += s[i++]; continue; }
    i += num[0].length;
    let value = num[0], j = i;
    while (s[j] === " ") j++;
    if (s[j] === "°") { out += `(${value}*3.141592653589793/180)`; i = j + 1; continue; }
    if (s[j] === "%") { out += `(${value}/100)`; i = j + 1; continue; }
    let unit = unitAt(s, j);
    // "2m = 10" is an equation in m, not two metres: a one-letter unit written straight after the number is not trusted.
    if (unit && j === i && unit.length === 1) unit = null;
    if (unit) {
      let scale = unit.scale, end = j + unit.length;
      // A compound unit: "m/s", "km/h", "m/s²".
      if (s[end] === "/" ) {
        const den = unitAt(s, end + 1);
        if (den) { scale /= den.scale; end += 1 + den.length; }
      }
      value = scale === 1 ? value : `(${value}*${scale})`;
      i = end;
    }
    out += value;
  }
  s = out.replace(/\bpi\b|π/g, "(3.141592653589793)").replace(/√/g, "sqrt");
  // Anything alphabetical left must be a function this checker understands.
  const letters = s.replace(/\b(?:sin|cos|tan|exp|ln|sqrt)\b|e(?=\^)/g, "");
  if (/\p{L}/u.test(letters) || /[=<>≤≥?_{}|]/.test(s)) return null;
  return s.trim();
}

function valueOf(piece: string): number | null {
  const s = toArithmetic(piece);
  if (!s || !/\d/.test(s)) return null;
  const node = parseExpression(s);
  if (!node) return null;
  const v = evaluate(node, {});
  return Number.isFinite(v) ? v : null;
}

const decimals = (piece: string) => {
  const m = /^\s*-?\d+(?:[.,](\d+))?\s*[^\d]*$/.exec(piece.trim());
  return m ? (m[1]?.length ?? 0) : null;                         // null: not a plain number, so no rounding allowance
};

// Two shown values agree if they match to 2 % (or to the rounding of whichever is written as a plain number).
function agree(a: number, b: number, aText: string, bText: string, approximate: boolean): boolean {
  const size = Math.max(Math.abs(a), Math.abs(b));
  let tolerance = size * (approximate ? 0.05 : 0.02) + 1e-9;
  for (const [t, v] of [[aText, a], [bText, b]] as [string, number][]) {
    const d = decimals(t);
    if (d == null) continue;
    // Half a unit in the last digit shown, in the units it was written in ("3 mA" is rounded to the nearest mA).
    const written = Math.abs(parseFloat(t.trim().replace(",", ".")));
    const scale = written > 0 ? Math.abs(v) / written : 1;
    tolerance = Math.max(tolerance, 0.5 * 10 ** -d * scale + 1e-12);
  }
  return Math.abs(a - b) <= tolerance;
}

const NAME = /^[\p{L}][\p{L}\p{N}_'′.₀-₉]*$/u;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function checkArithmetic(message: string): ArithmeticCheck {
  const problems: ArithmeticProblem[] = [];
  let checked = 0;
  let names = new Map<string, number>();
  // Models write "9 V" with a no-break or narrow space, Ω as the ohm sign, µ as the micro sign: one form for each.
  const text = (message ?? "").replace(/```[\s\S]*?```/g, " ").replace(/`[^`]*`/g, " ").replace(/\*\*/g, "")
    .replace(/[     ]/g, " ").replace(/Ω/g, "Ω").replace(/μ/g, "µ").replace(/[‐‑]/g, "-");
  for (const rawLine of text.split(/\n/)) {
    // A new section of a lesson is a new problem: names from the worked example must not leak into the student's own.
    if (/^\s*@@/.test(rawLine)) { names = new Map(); continue; }
    const line = rawLine.replace(/^\s*(?:\d+[.)]|[-•*])\s+/, "");
    const statements = line.split(/[.;:!?]\s+|,\s+|\s•\s|\s+(?:so|then|and|which|giving|therefore|because|donc|alors|et)\s+/i);
    for (const whole of statements) {
      // Closing punctuation and a leading "and" or "so" are not part of the arithmetic.
      const statement = whole.trim().replace(/[.,;:!?]+$/, "").replace(/^(?:and|so|then|thus|hence|therefore|check|donc|et|alors)\b[:,]?\s*/i, "");
      if (!/[=≈≅]/.test(statement)) continue;
      const parts = statement.split(/(=|≈|≅)/).map(p => p.trim());
      const pieces = parts.filter((_, i) => i % 2 === 0), signs = parts.filter((_, i) => i % 2 === 1);
      if (pieces.length < 2 || pieces.some(p => !p)) continue;
      // Fill in names defined earlier (longest first, whole names only).
      const known = [...names.keys()].sort((a, b) => b.length - a.length);
      const filled = pieces.map(p => known.reduce((acc, n) =>
        acc.replace(new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRe(n)}(?![\\p{L}\\p{N}_'′(])`, "gu"), `(${names.get(n)})`), p));
      // Functions whose convention can't be known from the text (degrees or radians, which base) are left alone.
      const unclear = /\b(?:sin|cos|tan|log|lg)\b/i.test(statement) && !/°|π|\bpi\b/.test(statement);
      const values = filled.map(valueOf);
      for (let i = 0; i + 1 < pieces.length; i++) {
        const a = values[i], b = values[i + 1];
        if (a == null || b == null) continue;
        checked++;
        if (unclear) continue;
        // Writing a number in another prefix (A to mA, Ω to kΩ) multiplies it by a power of 1000 on purpose.
        const ratio = Math.abs(a / b), conversion = /\d\s*(?:m|k|M|µ|u)(?:A|V|Ω|W|J|s|Hz|Wb|m|g)\b|\bk?m\/s/.test(statement)
          && [1e3, 1e6, 1e-3, 1e-6].some(p => Math.abs(ratio / p - 1) < 0.02);
        if (!conversion && !agree(a, b, filled[i], filled[i + 1], signs[i] !== "=")) {
          problems.push({ statement: statement.trim().slice(0, 200), left: pieces[i], right: pieces[i + 1], leftValue: a, rightValue: b });
        }
      }
      // "I_total = 10 V / 2.33 Ω ≈ 4.29 A": remember I_total for the lines that follow.
      const name = pieces[0].replace(/\s+/g, "");
      const last = values[values.length - 1];
      if (name.length >= 2 && name === pieces[0] && NAME.test(name) && last != null && !/^(?:sin|cos|tan|exp|ln|sqrt|pi|check)$/i.test(name)) names.set(name, last);
    }
  }
  return { checked, problems };
}

const show = (v: number) => String(Math.round(v * 1000) / 1000);

// One rewrite is asked for, naming the lines, so the model corrects the working rather than the wording.
export function arithmeticRequest(problems: ArithmeticProblem[]): string {
  const lines = problems.slice(0, 3).map(p => `- «${p.statement}»: "${p.left}" works out to ${show(p.leftValue)}, but it is set equal to ${show(p.rightValue)}.`);
  return `[CHECK YOUR WORKING] The server recomputed the numbers in your last reply and these lines do not hold:
${lines.join("\n")}
Find the step that is actually wrong (it may be earlier than the line that fails: a wrong quantity carried forward, the wrong voltage or the wrong formula), redo the working from there, and send the whole reply again with every number recomputed. If you include a check, compute it; never state a check you have not worked out. Same language, same sections, same JSON format. Do not mention this note.`;
}
