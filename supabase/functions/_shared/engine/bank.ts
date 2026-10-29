// Independent assessment bank for first-year ICT and engineering.
// Every item comes from a template and a seed, never from the language model:
// the question, the reference answer and the marking are deterministic, so a
// mastery check can't be wrong because a model invented a bad answer key.
// Each template also recognises the wrong answers that common misconceptions
// produce, which gives a diagnosis with evidence instead of a guess.
import { booleanEquivalent, equivalent, finalExpression, rng } from "./expr.ts";

export type Subject = "mathematics" | "calculus" | "electronics" | "digital_logic" | "programming";

export interface Objective {
  id: string;
  subject: Subject;
  title: string;
  prerequisites: string[];
}

export const OBJECTIVES: Objective[] = [
  { id: "math.linear_equations", subject: "mathematics", title: "Solve linear equations in one unknown", prerequisites: [] },
  { id: "calc.basic_derivatives", subject: "calculus", title: "Differentiate powers and standard functions", prerequisites: [] },
  { id: "calc.product_rule", subject: "calculus", title: "Differentiate a product with the product rule", prerequisites: ["calc.basic_derivatives"] },
  { id: "calc.chain_rule", subject: "calculus", title: "Differentiate a composite function with the chain rule", prerequisites: ["calc.basic_derivatives"] },
  { id: "ee.ohms_law", subject: "electronics", title: "Apply Ohm's law (V = I·R)", prerequisites: [] },
  { id: "ee.series_circuits", subject: "electronics", title: "Analyse resistors in series", prerequisites: ["ee.ohms_law"] },
  { id: "ee.voltage_divider", subject: "electronics", title: "Use the voltage-divider rule", prerequisites: ["ee.series_circuits"] },
  { id: "logic.binary_to_decimal", subject: "digital_logic", title: "Convert binary to decimal", prerequisites: [] },
  { id: "logic.decimal_to_binary", subject: "digital_logic", title: "Convert decimal to binary", prerequisites: ["logic.binary_to_decimal"] },
  { id: "logic.boolean_algebra", subject: "digital_logic", title: "Simplify Boolean expressions (De Morgan, absorption)", prerequisites: [] },
  { id: "prog.loop_tracing", subject: "programming", title: "Trace a loop and predict its output", prerequisites: [] },
  { id: "prog.complexity", subject: "programming", title: "Estimate the time complexity of simple loops", prerequisites: ["prog.loop_tracing"] },
];
export const OBJECTIVE_IDS = OBJECTIVES.map(o => o.id);
export const objective = (id: string) => OBJECTIVES.find(o => o.id === id) ?? null;

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
}

export interface Template {
  id: string;
  objective: string;
  difficulty: 1 | 2 | 3;
  misconceptions: Record<string, string>;   // id -> description
  generate(seed: number): Item;
  mark(item: Item, studentText: string): Marking;
}

// ---------- helpers ----------
const pick = <T,>(r: () => number, xs: T[]) => xs[Math.floor(r() * xs.length)];
const int = (r: () => number, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
const round = (v: number, dp = 3) => Math.round(v * 10 ** dp) / 10 ** dp;

// The last number the student wrote (their final answer), with comma decimals accepted.
export function lastNumber(text: string): number | null {
  const m = text.replace(/(\d),(\d)/g, "$1.$2").replace(/[−–]/g, "-").match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/gi);
  return m ? Number(m[m.length - 1]) : null;
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

const close = (a: number, b: number, rel = 0.01) => Math.abs(a - b) <= rel * Math.max(1, Math.abs(b));

function numericMark(value: number | null, answer: number, wrong: Record<string, number>, rel = 0.01): Marking {
  if (value == null) return { verdict: "unreadable", misconception: null, note: "no number found in the answer" };
  if (close(value, answer, rel)) return { verdict: "correct", misconception: null, note: `${value} matches the reference` };
  for (const [id, v] of Object.entries(wrong)) {
    if (Number.isFinite(v) && close(value, v, rel)) return { verdict: "incorrect", misconception: id, note: `${value} is what ${id} produces` };
  }
  return { verdict: "incorrect", misconception: null, note: `${value} does not match the reference` };
}

// ---------- templates ----------
export const TEMPLATES: Template[] = [
  {
    id: "linear.ax_plus_b", objective: "math.linear_equations", difficulty: 1,
    misconceptions: {
      sign_error: "moved the constant across without changing its sign",
      divide_first: "divided only the x-term by the coefficient",
      forgot_divide: "isolated a·x but did not divide by a",
    },
    generate(seed) {
      const r = rng(seed); const a = int(r, 2, 9), x = int(r, -6, 12), b = int(r, -15, 20) || 7, c = a * x + b;
      const bs = b < 0 ? `- ${-b}` : `+ ${b}`;
      return { templateId: this.id, objective: this.objective, seed, difficulty: this.difficulty,
        question: `Solve for x: ${a}x ${bs} = ${c}`, answer: `x = ${x}`,
        rubric: "Subtract the constant from both sides, then divide by the coefficient; check by substitution.",
        steps: [`${a}x = ${c - b}`, `x = ${x}`] };
    },
    mark(item, text) {
      const [a, b, c] = (() => { const m = /(\d+)x ([+-]) (\d+) = (-?\d+)/.exec(item.question)!; const bb = (m[2] === "-" ? -1 : 1) * Number(m[3]); return [Number(m[1]), bb, Number(m[4])]; })();
      return numericMark(lastNumber(text), (c - b) / a, { sign_error: (c + b) / a, divide_first: c / a - b, forgot_divide: c - b });
    },
  },
  {
    id: "calc.product", objective: "calc.product_rule", difficulty: 2,
    misconceptions: {
      product_of_derivatives: "differentiated each factor and multiplied the results",
      one_term_only: "kept only one of the two product-rule terms",
    },
    generate(seed) {
      const r = rng(seed); const n = int(r, 2, 5), a = pick(r, [1, 1, 2, 3, 4, 5]), f = pick(r, ["sin x", "cos x", "e^x"]);
      const df = { "sin x": "cos x", "cos x": "(-sin x)", "e^x": "e^x" }[f]!;
      const fx = f === "e^x" ? "exp(x)" : f, dfx = df === "e^x" ? "exp(x)" : df;
      const c = a === 1 ? "" : String(a);
      return { templateId: this.id, objective: this.objective, seed, difficulty: this.difficulty,
        question: `Differentiate f(x) = ${c}x^${n} · ${f}`,
        answer: `${a * n}x^${n - 1}·${fx} + ${c}x^${n}·${dfx}`,
        rubric: "Identify u = x^n and v; compute u' and v'; combine u'v + uv'.",
        steps: [`u = x^${n}, v = ${f}`, `u' = ${n}x^${n - 1}, v' = ${df}`, `f'(x) = u'v + uv'`] };
    },
    mark(item, text) {
      const student = finalExpression(text);
      const ok = equivalent(student, item.answer);
      if (ok === null) return { verdict: "unreadable", misconception: null, note: "could not read the expression" };
      if (ok) return { verdict: "correct", misconception: null, note: "equivalent to u'v + uv' at random points" };
      const [t1, t2] = item.answer.split(" + ");
      const [, cs, ns] = /= (\d*)x\^(\d)/.exec(item.question)!;
      const n = Number(ns), a = Number(cs || 1);
      const dfx = t2.split("·")[1];
      if (equivalent(student, `${a * n}x^${n - 1}·${dfx}`)) return { verdict: "incorrect", misconception: "product_of_derivatives", note: "equals u'·v'" };
      if (equivalent(student, t1) || equivalent(student, t2)) return { verdict: "incorrect", misconception: "one_term_only", note: "only one product-rule term" };
      return { verdict: "incorrect", misconception: null, note: "not equivalent to the derivative" };
    },
  },
  {
    id: "calc.chain", objective: "calc.chain_rule", difficulty: 2,
    misconceptions: { no_inner_derivative: "differentiated the outer function but not the inner one" },
    generate(seed) {
      const r = rng(seed); const a = int(r, 2, 6), outer = pick(r, ["sin", "cos", "exp"]);
      const d = { sin: `cos(${a}x^2)`, cos: `(-sin(${a}x^2))`, exp: `exp(${a}x^2)` }[outer]!;
      return { templateId: this.id, objective: this.objective, seed, difficulty: this.difficulty,
        question: `Differentiate g(x) = ${outer === "exp" ? `e^(${a}x²)` : `${outer}(${a}x²)`}`,
        answer: `${2 * a}x·${d}`,
        rubric: "Name the inner function u = ax², differentiate the outer function at u, multiply by u'.",
        steps: [`u = ${a}x²`, `u' = ${2 * a}x`, `g'(x) = outer'(u)·u'`] };
    },
    mark(item, text) {
      const student = finalExpression(text);
      const ok = equivalent(student, item.answer);
      if (ok === null) return { verdict: "unreadable", misconception: null, note: "could not read the expression" };
      if (ok) return { verdict: "correct", misconception: null, note: "equivalent to the chain-rule derivative" };
      const outerOnly = item.answer.split("·").slice(1).join("·");
      if (equivalent(student, outerOnly)) return { verdict: "incorrect", misconception: "no_inner_derivative", note: "missing the factor u'" };
      return { verdict: "incorrect", misconception: null, note: "not equivalent to the derivative" };
    },
  },
  {
    id: "ee.ohm", objective: "ee.ohms_law", difficulty: 1,
    misconceptions: { multiplied: "multiplied V by R instead of dividing", inverted: "computed R/V instead of V/R" },
    generate(seed) {
      const r = rng(seed); const R = pick(r, [2, 4, 5, 8, 10, 20, 50, 100, 220]), I = pick(r, [0.05, 0.1, 0.25, 0.5, 1, 1.5, 2, 3]);
      const V = round(I * R, 2);
      return { templateId: this.id, objective: this.objective, seed, difficulty: this.difficulty,
        question: `A ${V} V source is connected across a single ${R} Ω resistor. What current flows through the resistor? Give the unit.`,
        answer: `${I} A`, rubric: "State V = I·R, rearrange to I = V/R, substitute with units, give amperes.",
        steps: ["I = V/R", `I = ${V} V / ${R} Ω`, `I = ${I} A`] };
    },
    mark(item, text) {
      const [V, R] = (item.question.match(/[\d.]+(?= V| Ω)/g) ?? []).map(Number);
      return numericMark(lastQuantity(text, "A|amps?|amperes?"), V / R, { multiplied: V * R, inverted: R / V });
    },
  },
  {
    id: "ee.series", objective: "ee.series_circuits", difficulty: 2,
    misconceptions: { one_resistor: "used only one resistor", parallel_formula: "combined the resistors as if in parallel" },
    generate(seed) {
      const r = rng(seed); const R1 = pick(r, [10, 20, 30, 47, 68, 100]), R2 = pick(r, [10, 22, 33, 50, 82, 150]), V = pick(r, [5, 9, 12, 24]);
      return { templateId: this.id, objective: this.objective, seed, difficulty: this.difficulty,
        question: `Resistors of ${R1} Ω and ${R2} Ω are connected in series across a ${V} V supply. What current flows? Give the answer in mA.`,
        answer: `${round((V / (R1 + R2)) * 1000, 1)} mA`,
        rubric: "Series resistances add: R = R1 + R2; then I = V/R; convert A to mA.",
        steps: [`R = ${R1} + ${R2} = ${R1 + R2} Ω`, `I = ${V}/${R1 + R2} A`] };
    },
    mark(item, text) {
      const [R1, R2, V] = (item.question.match(/\d+(?= Ω| V)/g) ?? []).map(Number);
      const asMilli = (a: number) => a * 1000;
      const v = lastQuantity(text, "A|mA");
      const value = v == null ? null : /\bmA\b/.test(text) || v > 2 ? (/\bmA\b/.test(text) ? v * 1000 : v) : v * 1000; // read "x mA" or "x A"
      return numericMark(value, asMilli(V / (R1 + R2)),
        { one_resistor: asMilli(V / R1), parallel_formula: asMilli(V / ((R1 * R2) / (R1 + R2))) }, 0.02);
    },
  },
  {
    id: "ee.divider", objective: "ee.voltage_divider", difficulty: 2,
    misconceptions: { wrong_resistor: "used the other resistor in the numerator", no_ratio: "used R2/R1 instead of R2/(R1+R2)" },
    generate(seed) {
      const r = rng(seed); const R1 = pick(r, [1, 2, 3, 4.7, 10]) * 1000, R2 = pick(r, [1, 2.2, 3.3, 5.6, 10]) * 1000, V = pick(r, [5, 9, 12]);
      return { templateId: this.id, objective: this.objective, seed, difficulty: this.difficulty,
        question: `A ${V} V supply feeds R1 = ${R1 / 1000} kΩ in series with R2 = ${R2 / 1000} kΩ. What is the voltage across R2?`,
        answer: `${round((V * R2) / (R1 + R2), 2)} V`, rubric: "Vout = V·R2/(R1+R2); same current through both resistors.",
        steps: ["I = V/(R1 + R2)", "V2 = I·R2"] };
    },
    mark(item, text) {
      const nums = (item.question.match(/[\d.]+(?= V| kΩ)/g) ?? []).map(Number);
      const [V, R1, R2] = [nums[0], nums[1] * 1000, nums[2] * 1000];
      return numericMark(lastQuantity(text, "V|volts?"), (V * R2) / (R1 + R2),
        { wrong_resistor: (V * R1) / (R1 + R2), no_ratio: (V * R2) / R1 }, 0.02);
    },
  },
  {
    id: "logic.bin2dec", objective: "logic.binary_to_decimal", difficulty: 1,
    misconceptions: { reversed_bits: "read the bits from the wrong end", ones_count: "counted the 1 bits" },
    generate(seed) {
      const r = rng(seed); const v = int(r, 37, 250); const bits = v.toString(2).padStart(8, "0");
      return { templateId: this.id, objective: this.objective, seed, difficulty: this.difficulty,
        question: `Convert the unsigned binary number ${bits} to decimal.`, answer: String(v),
        rubric: "Weight each bit by a power of two, starting at 2^0 on the right, and add.",
        steps: ["list place values 128 64 32 16 8 4 2 1", "add the values where the bit is 1"] };
    },
    mark(item, text) {
      const bits = /([01]{8})/.exec(item.question)![1];
      const reversed = parseInt([...bits].reverse().join(""), 2);
      return numericMark(lastNumber(text.replace(/\b[01]{8}\b/g, "")), Number(item.answer),
        { reversed_bits: reversed, ones_count: [...bits].filter(b => b === "1").length }, 0);
    },
  },
  {
    id: "logic.dec2bin", objective: "logic.decimal_to_binary", difficulty: 1,
    misconceptions: { reversed_bits: "wrote the remainders in the order they were found (reversed)" },
    generate(seed) {
      const r = rng(seed); const v = int(r, 19, 200);
      return { templateId: this.id, objective: this.objective, seed, difficulty: this.difficulty,
        question: `Convert ${v} (decimal) to unsigned binary.`, answer: v.toString(2),
        rubric: "Repeatedly divide by 2 and read the remainders from last to first (or subtract powers of two).",
        steps: ["divide by 2, note remainders", "read remainders bottom-up"] };
    },
    mark(item, text) {
      const m = text.match(/[01]{3,}/g);
      if (!m) return { verdict: "unreadable", misconception: null, note: "no binary number found" };
      const got = parseInt(m[m.length - 1], 2), want = parseInt(item.answer, 2);
      if (got === want) return { verdict: "correct", misconception: null, note: "same value" };
      if (m[m.length - 1].replace(/^0+/, "") === [...item.answer].reverse().join("").replace(/^0+/, "")) {
        return { verdict: "incorrect", misconception: "reversed_bits", note: "bits in reverse order" };
      }
      return { verdict: "incorrect", misconception: null, note: `value ${got} instead of the target` };
    },
  },
  {
    id: "logic.simplify", objective: "logic.boolean_algebra", difficulty: 2,
    misconceptions: { de_morgan_no_flip: "complemented the variables but kept the same operator", not_equivalent: "changed the function's truth table" },
    generate(seed) {
      const r = rng(seed);
      const pool = [
        { q: "(A·B)'", a: "A' + B'", steps: ["De Morgan: (XY)' = X' + Y'"] },
        { q: "(A + B)'", a: "A'·B'", steps: ["De Morgan: (X + Y)' = X'·Y'"] },
        { q: "A·B + A·B'", a: "A", steps: ["factor A: A(B + B')", "B + B' = 1"] },
        { q: "A + A·B", a: "A", steps: ["absorption: A + AB = A(1 + B) = A"] },
        { q: "(A' + B)'", a: "A·B'", steps: ["De Morgan, then double complement: A'' = A"] },
      ];
      const p = pick(r, pool);
      return { templateId: this.id, objective: this.objective, seed, difficulty: this.difficulty,
        question: `Simplify the Boolean expression ${p.q} to the fewest literals.`, answer: p.a,
        rubric: "Name each law used; the result must have the same truth table and fewer literals.", steps: p.steps };
    },
    mark(item, text) {
      const expr = finalExpression(text);
      const given = /expression (.+) to the fewest/.exec(item.question)![1];
      const ok = booleanEquivalent(expr, item.answer);
      if (ok === null) return { verdict: "unreadable", misconception: null, note: "could not read the Boolean expression" };
      const literals = (s: string) => (s.toUpperCase().match(/[A-Z]/g) ?? []).length;
      if (ok) {
        return literals(expr) <= literals(item.answer)
          ? { verdict: "correct", misconception: null, note: "same truth table, minimal literals" }
          : { verdict: "incorrect", misconception: null, note: "equivalent but not fully simplified" };
      }
      const flipped = given.includes("·") ? item.answer.replace(" + ", "·") : item.answer.replace("·", " + ");
      if (/'\s*$/.test(given) && booleanEquivalent(expr, flipped)) return { verdict: "incorrect", misconception: "de_morgan_no_flip", note: "operator not flipped" };
      return { verdict: "incorrect", misconception: "not_equivalent", note: "truth table differs" };
    },
  },
  {
    id: "prog.trace_sum", objective: "prog.loop_tracing", difficulty: 1,
    misconceptions: { includes_stop: "included the stop value of range()", ignored_step: "ignored the step and added every number" },
    generate(seed) {
      const r = rng(seed); const start = int(r, 0, 4), stop = int(r, 8, 16), step = pick(r, [1, 2, 3]);
      let s = 0; for (let i = start; i < stop; i += step) s += i;
      return { templateId: this.id, objective: this.objective, seed, difficulty: this.difficulty,
        question: `What does this Python program print?\n\n\`\`\`python\ntotal = 0\nfor i in range(${start}, ${stop}, ${step}):\n    total += i\nprint(total)\n\`\`\``,
        answer: String(s), rubric: "List the values of i (stop excluded), then add them.",
        steps: [`i takes ${start}, ${start + step}, ... below ${stop}`, "add them"] };
    },
    mark(item, text) {
      const [start, stop, step] = /range\((\d+), (\d+), (\d+)\)/.exec(item.question)!.slice(1).map(Number);
      let inc = 0; for (let i = start; i <= stop; i += step) inc += i;
      let all = 0; for (let i = start; i < stop; i++) all += i;
      return numericMark(lastNumber(text), Number(item.answer), { includes_stop: inc, ignored_step: all }, 0);
    },
  },
  {
    id: "prog.complexity", objective: "prog.complexity", difficulty: 2,
    misconceptions: { counts_loops_not_iterations: "counted loops instead of how many times they run", halving_is_linear: "thought a halving loop is linear" },
    generate(seed) {
      const r = rng(seed);
      const pool = [
        { code: "for i in range(n):\n    for j in range(n):\n        count += 1", a: "O(n^2)" },
        { code: "for i in range(n):\n    count += 1\nfor j in range(n):\n    count += 1", a: "O(n)" },
        { code: "i = n\nwhile i > 1:\n    i = i // 2\n    count += 1", a: "O(log n)" },
        { code: "for i in range(n):\n    j = 1\n    while j < n:\n        j *= 2", a: "O(n log n)" },
      ];
      const p = pick(r, pool);
      return { templateId: this.id, objective: this.objective, seed, difficulty: this.difficulty,
        question: `What is the time complexity (Big-O, in terms of n) of this code?\n\n\`\`\`python\n${p.code}\n\`\`\``,
        answer: p.a, rubric: "Count how many times the innermost statement runs as a function of n.", steps: ["iterations of each loop", "multiply nested, add sequential"] };
    },
    mark(item, text) {
      const norm = (s: string) => s.toLowerCase().replace(/\s|\*|·/g, "").replace(/²/g, "^2").replace(/o\(n\^2\)|o\(n\*n\)|o\(nn\)/, "o(n^2)")
        .replace(/log2|lg/g, "log").replace(/o\(logn\)/, "o(logn)");
      const m = norm(text).match(/o\([^)]*\)/g);
      if (!m) return { verdict: "unreadable", misconception: null, note: "no Big-O expression found" };
      const got = m[m.length - 1], want = norm(item.answer);
      if (got === want) return { verdict: "correct", misconception: null, note: "matches" };
      if (want === "o(n)" && got === "o(n^2)") return { verdict: "incorrect", misconception: "counts_loops_not_iterations", note: "two sequential loops are O(n)" };
      if (want === "o(logn)" && got === "o(n)") return { verdict: "incorrect", misconception: "halving_is_linear", note: "halving loop" };
      return { verdict: "incorrect", misconception: null, note: `${got} instead of ${want}` };
    },
  },
];

export const templateFor = (objectiveId: string, difficulty?: number) =>
  TEMPLATES.filter(t => t.objective === objectiveId && (difficulty == null || t.difficulty <= difficulty));

export function generateItem(objectiveId: string, seed: number): Item | null {
  const ts = templateFor(objectiveId);
  if (!ts.length) return null;
  return ts[seed % ts.length].generate(seed);
}

export function markItem(item: Item, studentText: string): Marking {
  const t = TEMPLATES.find(x => x.id === item.templateId);
  if (!t) return { verdict: "unreadable", misconception: null, note: "unknown template" };
  try { return t.mark(item, studentText); } catch { return { verdict: "unreadable", misconception: null, note: "marking failed" }; }
}

export const misconceptionText = (item: Item, id: string | null) =>
  id ? TEMPLATES.find(t => t.id === item.templateId)?.misconceptions[id] ?? id : null;

// A stable 31-bit key for a question's text (what "seen before" is checked against).
export function questionKey(question: string): number {
  let h = 2166136261;
  for (let i = 0; i < question.length; i++) h = Math.imul(h ^ question.charCodeAt(i), 16777619);
  return (h >>> 1) & 0x7fffffff;
}
