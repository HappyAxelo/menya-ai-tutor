// Types and helpers shared by every question template (bank.ts, bankStem.ts).
// Kept apart from the templates so the two template files can both import them.
import { evaluate, parseExpression, rng } from "./expr.ts";

export type Subject = "mathematics" | "calculus" | "physics" | "electronics" | "engineering" | "digital_logic" | "programming";

export interface Objective {
  id: string;
  subject: Subject;
  title: string;
  prerequisites: string[];
}

export type Verdict = "correct" | "incorrect" | "unreadable";

export interface Marking {
  verdict: Verdict;
  misconception: string | null;   // id from the template's catalogue
  note: string;                   // short, factual, for the tutor (never shown verbatim)
}

export interface Item {
  templateId: string;
  objective: string;
  seed: number;
  difficulty: 1 | 2 | 3;
  question: string;                // English; the tutor presents it in the learner's language
  answer: string;                  // reference answer (private)
  rubric: string;                  // what a full answer contains
  steps: string[];                 // expected intermediate reasoning
  // Intermediate values a correct working passes through. Finding them in a student's working earns
  // method marks in an exam even when the final answer is wrong. Private, like the answer.
  working?: number[];
}

export interface Template {
  id: string;
  objective: string;
  difficulty: 1 | 2 | 3;
  misconceptions: Record<string, string>;   // id -> description
  generate(seed: number): Item;
  mark(item: Item, studentText: string): Marking;
}

export const pick = <T,>(r: () => number, xs: T[]) => xs[Math.floor(r() * xs.length)];
export const int = (r: () => number, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
export const round = (v: number, dp = 3) => Math.round(v * 10 ** dp) / 10 ** dp;
export { rng };

const tidy = (text: string) => text.replace(/(\d),(\d)/g, "$1.$2").replace(/[−–]/g, "-");
const NUMBER = /-?\d+(?:\.\d+)?(?:e-?\d+)?/gi;

// Every number in a text, in order, with comma decimals accepted.
export function numbersIn(text: string): number[] {
  return (tidy(text).match(NUMBER) ?? []).map(Number);
}

// "1.5 m/s^2" must read as 1.5, not 2: powers written on units are dropped before numbers are read.
export const dropUnitPowers = (text: string) => text.replace(/(?<=[a-zA-ZΩ)])\s*\^\s*[-−]?\d+/g, "").replace(/\b(m|s|kg)-\d\b/g, "$1").replace(/[²³]/g, "");

// The last number the student wrote (their final answer).
export function lastNumber(text: string): number | null {
  const m = numbersIn(text);
  return m.length ? m[m.length - 1] : null;
}

// Value in base units from a number followed by an optional SI prefix and unit ("250 mA", "0.25 A", "2.5 k").
export function lastQuantity(text: string, unit: string): number | null {
  const re = new RegExp(`(-?\\d+(?:[.,]\\d+)?)\\s*(k|m|µ|u|M)?\\s*(${unit})?\\b`, "g");
  let last: RegExpExecArray | null = null, m: RegExpExecArray | null;
  while ((m = re.exec(text))) last = m;
  if (!last) return null;
  const v = Number(last[1].replace(",", "."));
  const scale = { k: 1e3, M: 1e6, m: 1e-3, µ: 1e-6, u: 1e-6 }[last[2] as "k"] ?? 1;
  return v * scale;
}

// A final answer that may be written as a fraction or a percentage: "3/8", "0.375", "37.5 %".
export function lastValue(text: string): number | null {
  const t = tidy(text).trim();
  const tail = t.split(/[=:≈]/).pop()!.trim();
  const frac = /(-?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*$/.exec(tail.replace(/[.;,\s]+$/, ""));
  if (frac && Number(frac[2]) !== 0) return Number(frac[1]) / Number(frac[2]);
  const pct = /(-?\d+(?:\.\d+)?)\s*%\s*\.?$/.exec(tail);
  if (pct) return Number(pct[1]) / 100;
  return lastNumber(t);
}

export const close = (a: number, b: number, rel = 0.01) => Math.abs(a - b) <= rel * Math.max(1, Math.abs(b));

export function numericMark(value: number | null, answer: number, wrong: Record<string, number>, rel = 0.01, cmp: (a: number, b: number, rel: number) => boolean = close): Marking {
  if (value == null) return { verdict: "unreadable", misconception: null, note: "no number found in the answer" };
  if (cmp(value, answer, rel)) return { verdict: "correct", misconception: null, note: `${value} matches the reference` };
  for (const [id, v] of Object.entries(wrong)) {
    if (Number.isFinite(v) && !cmp(v, answer, rel) && cmp(value, v, rel)) return { verdict: "incorrect", misconception: id, note: `${value} is what ${id} produces` };
  }
  return { verdict: "incorrect", misconception: null, note: `${value} does not match the reference` };
}

// Is F an antiderivative of f? Checked the way a student should check an integral: differentiate
// the answer (numerically, at random points) and compare with the integrand. The constant of
// integration disappears in the derivative, so "+ C" is neither required nor penalised.
export function isAntiderivative(F: string, f: string, variable = "x"): boolean | null {
  const cleaned = F.replace(/\+\s*[ck]\b\s*$/i, "").replace(/\+\s*constant\s*$/i, "").trim();
  const nF = parseExpression(cleaned), nf = parseExpression(f);
  if (!nF || !nf) return null;
  const r = rng(24680);
  let compared = 0;
  for (let i = 0; i < 60 && compared < 16; i++) {
    const x = 0.4 + r() * 1.6, h = 1e-5;
    const d = (evaluate(nF, { [variable]: x + h }) - evaluate(nF, { [variable]: x - h })) / (2 * h);
    const want = evaluate(nf, { [variable]: x });
    if (!Number.isFinite(d) || !Number.isFinite(want)) continue;
    compared++;
    if (Math.abs(d - want) > 1e-4 * Math.max(1, Math.abs(want))) return false;
  }
  return compared >= 6 ? true : null;
}

// "3 + 4i", "3 - 4 i", "-2i", "5", "i": the last complex number written.
export function lastComplex(text: string): { re: number; im: number } | null {
  const t = tidy(text).toLowerCase().replace(/\bj\b/g, "i").replace(/\s+/g, "");
  const tail = t.split(/[=:≈]/).pop()!.replace(/[.;,]+$/, "");
  const full = /(-?\d+(?:\.\d+)?)([+-])(\d+(?:\.\d+)?)?\*?i$/.exec(tail);
  if (full) return { re: Number(full[1]), im: (full[2] === "-" ? -1 : 1) * (full[3] === undefined ? 1 : Number(full[3])) };
  const imOnly = /(?:^|[^\d.])(-?)(\d+(?:\.\d+)?)?\*?i$/.exec(tail);
  if (imOnly) return { re: 0, im: (imOnly[1] === "-" ? -1 : 1) * (imOnly[2] === undefined ? 1 : Number(imOnly[2])) };
  const real = /(-?\d+(?:\.\d+)?)$/.exec(tail);
  return real ? { re: Number(real[1]), im: 0 } : null;
}

// How many of an item's intermediate values appear in the student's working (each counted once).
export function workingFound(item: Item, studentText: string): { found: number; total: number } {
  // Numbers the question already gives earn nothing for being copied, and a value that occurs twice counts once.
  const given = numbersIn(item.question.replace(/\b[A-Za-z]_?\d\b/g, " "));   // the 2 in "R2" is a label, not a value
  const want = [...new Set(item.working ?? [])].filter(w => !given.some(g => close(g, w, 0.001)));
  if (!want.length) return { found: 0, total: 0 };
  const have = numbersIn(studentText);
  const found = want.filter(w => have.some(h => close(h, w, 0.011))).length;
  return { found, total: want.length };
}
