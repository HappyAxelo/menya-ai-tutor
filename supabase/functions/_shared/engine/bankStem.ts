// First-year university topics: calculus, linear algebra, probability, complex numbers,
// mechanics, waves, electromagnetism, circuit analysis, signals, control, semiconductors,
// data structures and algorithms. Same rules as bank.ts: the question, the reference answer
// and the marking are computed from a seed, never written by a language model.
//
// Each template is one build(seed) function that returns the question together with the
// function that marks it, so marking always uses exactly the numbers the question used.
import { equivalent, finalExpression } from "./expr.ts";
import {
  close, dropUnitPowers, int, isAntiderivative, lastComplex, lastNumber, lastQuantity, lastValue, numbersIn, numericMark, pick, rng, round,
  type Item, type Marking, type Objective, type Template,
} from "./bankKit.ts";

export const STEM_OBJECTIVES: Objective[] = [
  { id: "calc.integration_power", subject: "calculus", title: "Integrate polynomials and evaluate definite integrals", prerequisites: ["calc.basic_derivatives"] },
  { id: "calc.integration_substitution", subject: "calculus", title: "Integrate by substitution", prerequisites: ["calc.chain_rule", "calc.integration_power"] },
  { id: "calc.first_order_ode", subject: "calculus", title: "Solve a first-order differential equation with an initial condition", prerequisites: ["calc.integration_power"] },
  { id: "linalg.determinants", subject: "mathematics", title: "Find the determinant of a 2×2 matrix", prerequisites: [] },
  { id: "linalg.matrix_multiplication", subject: "mathematics", title: "Multiply 2×2 matrices", prerequisites: [] },
  { id: "prob.independent_events", subject: "mathematics", title: "Combine probabilities of independent events", prerequisites: [] },
  { id: "prob.binomial_distribution", subject: "mathematics", title: "Use the binomial distribution", prerequisites: ["prob.independent_events"] },
  { id: "math.complex_numbers", subject: "mathematics", title: "Multiply complex numbers and find a modulus", prerequisites: [] },
  { id: "phys.newtons_second_law", subject: "physics", title: "Apply Newton's second law with more than one force", prerequisites: ["math.linear_equations"] },
  { id: "phys.projectile_motion", subject: "physics", title: "Analyse projectile motion", prerequisites: ["phys.newtons_second_law"] },
  { id: "phys.wave_speed", subject: "physics", title: "Relate wave speed, frequency and wavelength", prerequisites: [] },
  { id: "phys.electromagnetic_induction", subject: "physics", title: "Apply Faraday's law of induction", prerequisites: [] },
  { id: "ee.kirchhoff_laws", subject: "electronics", title: "Analyse a series-parallel circuit with Kirchhoff's laws", prerequisites: ["ee.ohms_law", "ee.series_circuits"] },
  { id: "semi.diode_circuits", subject: "engineering", title: "Analyse a forward-biased diode circuit", prerequisites: ["ee.ohms_law"] },
  { id: "sig.sampling", subject: "engineering", title: "Choose a sampling rate (Nyquist)", prerequisites: [] },
  { id: "ctrl.feedback_steady_state", subject: "engineering", title: "Find the steady-state output of a feedback loop", prerequisites: [] },
  { id: "ds.stacks_queues", subject: "programming", title: "Trace stack and queue operations", prerequisites: [] },
  { id: "algo.binary_search", subject: "programming", title: "Count the steps of a binary search", prerequisites: ["prog.loop_tracing"] },
];

interface Built {
  question: string; answer: string; rubric: string; steps: string[]; working?: number[];
  mark(studentText: string): Marking;
}
interface Spec { id: string; objective: string; difficulty: 1 | 2 | 3; misconceptions: Record<string, string>; build(seed: number): Built }

const template = (s: Spec): Template => ({
  id: s.id, objective: s.objective, difficulty: s.difficulty, misconceptions: s.misconceptions,
  generate(seed) {
    const { mark: _mark, ...b } = s.build(seed);
    return { templateId: s.id, objective: s.objective, seed, difficulty: s.difficulty, ...b };
  },
  mark(item: Item, text: string) { return s.build(item.seed).mark(text); },
});

const unreadable = (note: string): Marking => ({ verdict: "unreadable", misconception: null, note });
const right = (note: string): Marking => ({ verdict: "correct", misconception: null, note });
const wrong = (misconception: string | null, note: string): Marking => ({ verdict: "incorrect", misconception, note });
const plainNumber = (text: string) => lastNumber(dropUnitPowers(text));
const signed = (n: number) => (n < 0 ? `- ${-n}` : `+ ${n}`);
const power = (n: number) => (n === 1 ? "x" : `x^${n}`);
const coef = (a: number) => (a === 1 ? "" : String(a));
// Probabilities are small numbers: compare with a relative tolerance plus rounding to three decimals.
const nearProbability = (a: number, b: number) => Math.abs(a - b) <= 0.01 * Math.abs(b) + 0.0006;
// "9.2 mA", "0.0092 A" or a bare "9.2" (the question asks for mA): the value in mA.
function milliamps(text: string): number | null {
  const v = lastQuantity(text, "A|amps?|amperes?");
  if (v == null) return null;
  return /\d\s*[mµuk]?A\b|amp/i.test(text) ? v * 1000 : v;
}
const strip = (s: string) => s.replace(/\+\s*[ck]\b\s*$/i, "").trim();

export const STEM_TEMPLATES: Template[] = [
  // ---------------- Calculus ----------------
  template({
    id: "calc.power", objective: "calc.basic_derivatives", difficulty: 1,
    misconceptions: {
      exponent_not_multiplied: "lowered the power but did not multiply by the old exponent",
      kept_constant: "kept the constant term, whose derivative is zero",
      power_not_reduced: "multiplied by the exponent but did not lower the power by one",
    },
    build(seed) {
      const r = rng(seed); const a = int(r, 2, 6), n = int(r, 2, 5), b = int(r, 2, 9), c = int(r, 1, 9);
      const answer = `${a * n}${power(n - 1)} + ${b}`;
      return {
        question: `Differentiate f(x) = ${a}x^${n} + ${b}x + ${c}`, answer,
        rubric: "Power rule on each term: d/dx(a·xⁿ) = a·n·xⁿ⁻¹; the derivative of b·x is b; the derivative of a constant is 0.",
        steps: [`d/dx(${a}x^${n}) = ${a}·${n}·x^${n - 1} = ${a * n}${power(n - 1)}`, `d/dx(${b}x) = ${b}`, `d/dx(${c}) = 0`, `f'(x) = ${answer}`],
        mark(text) {
          const student = finalExpression(text);
          const ok = equivalent(student, answer);
          if (ok === null) return unreadable("could not read the expression");
          if (ok) return right("equivalent to the derivative at random points");
          if (equivalent(student, `${a}${power(n - 1)} + ${b}`)) return wrong("exponent_not_multiplied", "coefficient not multiplied by the exponent");
          if (equivalent(student, `${answer} + ${c}`)) return wrong("kept_constant", "constant term kept");
          if (equivalent(student, `${a * n}x^${n} + ${b}`)) return wrong("power_not_reduced", "power not lowered");
          return wrong(null, "not equivalent to the derivative");
        },
      };
    },
  }),
  template({
    id: "int.power", objective: "calc.integration_power", difficulty: 1,
    misconceptions: {
      not_divided: "raised the power but did not divide by the new exponent",
      substituted_without_integrating: "put the limits into f(x) itself instead of into its antiderivative",
    },
    build(seed) {
      const r = rng(seed); const n = int(r, 1, 3), c = int(r, 1, 4), b = int(r, 1, 6), k = int(r, 1, 3);
      const lead = c * (n + 1), value = c * k ** (n + 1) + b * k;
      return {
        question: `Evaluate the definite integral of f(x) = ${lead}${power(n)} + ${b} from x = 0 to x = ${k}.`, answer: String(value),
        rubric: "Raise each power by one and divide by the new power, then evaluate the antiderivative at the upper limit minus the lower limit.",
        steps: [`F(x) = ${coef(c)}x^${n + 1} + ${b}x`, `F(${k}) = ${c}·${k}^${n + 1} + ${b}·${k} = ${c * k ** (n + 1)} + ${b * k} = ${value}`, `F(0) = 0`, `F(${k}) − F(0) = ${value}`], working: [c * k ** (n + 1), b * k],
        mark: text => numericMark(plainNumber(text), value, { not_divided: lead * k ** (n + 1) + b * k, substituted_without_integrating: lead * k ** n }, 0.005),
      };
    },
  }),
  template({
    id: "int.substitution", objective: "calc.integration_substitution", difficulty: 2,
    misconceptions: {
      inner_derivative_ignored: "integrated the outer function but did not account for du = u′ dx",
      outer_only: "integrated the outer function and left the x factor in place",
    },
    build(seed) {
      const r = rng(seed); const a = int(r, 1, 4), m = int(r, 1, 3), f = pick(r, ["cos", "sin", "exp"] as const);
      const k = 2 * a * m, inner = `${coef(a)}x^2`, shownInner = `${coef(a)}x²`;
      const shown = f === "exp" ? `e^(${shownInner})` : `${f}(${shownInner})`;
      const anti = { cos: `sin(${inner})`, sin: `(-cos(${inner}))`, exp: `exp(${inner})` }[f];
      const integrand = `${k}x*${f}(${inner})`;
      return {
        question: `Find the indefinite integral of ${k}x·${shown} with respect to x.`, answer: `${f === "sin" ? "−" : ""}${coef(m)}${f === "exp" ? `e^(${shownInner})` : `${f === "cos" ? "sin" : "cos"}(${shownInner})`} + C`,
        rubric: `Substitute u = ${shownInner}, so du = ${2 * a}x dx; rewrite the integral in u, integrate, substitute back, add C. Check by differentiating.`,
        steps: [`u = ${shownInner}`, `du = ${2 * a}x dx`, `${k}x dx = ${m} du`, "integrate in u, substitute back"],
        mark(text) {
          const student = strip(finalExpression(text));
          const ok = isAntiderivative(student, integrand);
          if (ok === null) return unreadable("could not read the expression");
          if (ok) return right("its derivative equals the integrand");
          if (equivalent(student, `${k}*${anti}`)) return wrong("inner_derivative_ignored", "the factor from du was not divided out");
          if (equivalent(student, `${k}x*${anti}`)) return wrong("outer_only", "the x factor was left in place");
          return wrong(null, "its derivative is not the integrand");
        },
      };
    },
  }),
  template({
    id: "ode.decay", objective: "calc.first_order_ode", difficulty: 2,
    misconceptions: {
      linear_change: "treated the rate as constant, giving a straight-line change instead of an exponential",
      sign_reversed: "used growth (a positive exponent) for a decay equation",
      initial_value_dropped: "left out the initial value y(0)",
    },
    build(seed) {
      const r = rng(seed); const k = pick(r, [0.2, 0.5, 1, 2]), kT = pick(r, [0.5, 1, 2]), y0 = pick(r, [4, 6, 8, 10, 20]);
      const T = round(kT / k, 2), value = y0 * Math.exp(-kT);
      return {
        question: `A quantity y(t) obeys dy/dt = −${k}·y with y(0) = ${y0}. Find y(${T}). Give 3 significant figures.`, answer: String(round(value, 3)),
        rubric: "Separate variables: dy/y = −k dt, so y = y(0)·e^(−kt); substitute t and evaluate.",
        steps: ["dy/y = −k dt", "ln y = −kt + c", `y = ${y0}·e^(−${k}t)`, `y(${T}) = ${y0}·e^(−${kT}) = ${y0} × ${round(Math.exp(-kT), 4)} = ${round(value, 3)}`], working: [round(Math.exp(-kT), 3)],
        mark: text => numericMark(plainNumber(text), value, { linear_change: y0 * (1 - kT), sign_reversed: y0 * Math.exp(kT), initial_value_dropped: Math.exp(-kT) }, 0.006),
      };
    },
  }),

  // ---------------- Linear algebra, probability, complex numbers ----------------
  template({
    id: "linalg.det2", objective: "linalg.determinants", difficulty: 1,
    misconceptions: {
      added_products: "added the two diagonal products instead of subtracting",
      wrong_pairs: "multiplied along the rows instead of along the diagonals",
      order_reversed: "subtracted in the wrong order (bc − ad)",
    },
    build(seed) {
      const r = rng(seed); const nz = () => pick(r, [-5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6, 7]);
      const a = nz(), b = nz(), c = nz(), d = nz(), det = a * d - b * c;
      return {
        question: `Find the determinant of the 2×2 matrix with first row (${a}, ${b}) and second row (${c}, ${d}).`, answer: String(det),
        rubric: "det = ad − bc: the product of the main diagonal minus the product of the other diagonal.",
        steps: [`ad = ${a}·${d} = ${a * d}`, `bc = ${b}·${c} = ${b * c}`, `det = ad − bc = ${a * d} − (${b * c}) = ${det}`], working: [a * d, b * c],
        mark: text => numericMark(lastNumber(text), det, { added_products: a * d + b * c, wrong_pairs: a * b - c * d, order_reversed: b * c - a * d }, 0),
      };
    },
  }),
  template({
    id: "linalg.product2", objective: "linalg.matrix_multiplication", difficulty: 2,
    misconceptions: {
      elementwise: "multiplied matching entries instead of rows by columns",
      order_swapped: "computed BA instead of AB",
    },
    build(seed) {
      const r = rng(seed); const e = () => int(r, -3, 5);
      const [a, b, c, d, p, q, s, t] = [e(), e(), e(), e(), e(), e(), e(), e()];
      const ab = [a * p + b * s, a * q + b * t, c * p + d * s, c * q + d * t];
      const ba = [p * a + q * c, p * b + q * d, s * a + t * c, s * b + t * d];
      const same = (x: number[], y: number[]) => x.every((v, i) => v === y[i]);
      return {
        question: `A has rows (${a}, ${b}) and (${c}, ${d}). B has rows (${p}, ${q}) and (${s}, ${t}). Compute the product AB and give its four entries row by row.`,
        answer: `(${ab[0]}, ${ab[1]}) and (${ab[2]}, ${ab[3]})`,
        rubric: "Each entry is a row of A times a column of B: entry (i, j) = row i of A · column j of B.",
        steps: [`top left = ${a}·${p} + ${b}·${s}`, `top right = ${a}·${q} + ${b}·${t}`, "bottom row the same way with the second row of A"], working: [ab[0], ab[1]],
        mark(text) {
          const nums = numbersIn(text);
          if (nums.length < 4) return unreadable("four entries are needed");
          const got = nums.slice(-4);
          if (same(got, ab)) return right("all four entries match");
          if (!same(ab, [a * p, b * q, c * s, d * t]) && same(got, [a * p, b * q, c * s, d * t])) return wrong("elementwise", "entries multiplied one by one");
          if (!same(ab, ba) && same(got, ba)) return wrong("order_swapped", "this is BA");
          return wrong(null, "entries do not match AB");
        },
      };
    },
  }),
  template({
    id: "prob.at_least_one", objective: "prob.independent_events", difficulty: 1,
    misconceptions: {
      probabilities_added: "added the two probabilities, which counts the case where both happen twice",
      both_instead: "found the probability that both happen instead of at least one",
      complement_of_both: "subtracted the probability of both from 1 instead of the probability of neither",
    },
    build(seed) {
      const r = rng(seed); const p = pick(r, [0.1, 0.2, 0.25, 0.3, 0.4, 0.5]), q = pick(r, [0.1, 0.2, 0.3, 0.4, 0.5, 0.6]);
      const neither = (1 - p) * (1 - q), value = 1 - neither;
      return {
        question: `Two machines work independently. During a shift the first fails with probability ${p} and the second with probability ${q}. What is the probability that at least one of them fails?`,
        answer: String(round(value, 3)),
        rubric: "\"At least one\" is the complement of \"neither\": 1 − (1 − p)(1 − q). Independence lets the two no-failure probabilities multiply.",
        steps: [`P(neither) = ${round(1 - p, 2)} × ${round(1 - q, 2)} = ${round(neither, 4)}`, `P(at least one) = 1 − ${round(neither, 4)} = ${round(value, 4)}`], working: [round(neither, 3)],
        mark: text => numericMark(lastValue(text), value, { probabilities_added: p + q, both_instead: p * q, complement_of_both: 1 - p * q }, 0, nearProbability),
      };
    },
  }),
  template({
    id: "prob.binomial", objective: "prob.binomial_distribution", difficulty: 2,
    misconceptions: {
      arrangements_ignored: "left out the number of ways the successes can be arranged, C(n, k)",
      failures_ignored: "left out the probability of the failures, (1 − p)^(n − k)",
    },
    build(seed) {
      const r = rng(seed); const n = int(r, 4, 6), k = int(r, 1, n - 1), p = pick(r, [0.5, 0.25, 0.2, 0.4]);
      let ways = 1; for (let i = 1; i <= k; i++) ways = (ways * (n - k + i)) / i;
      const one = p ** k * (1 - p) ** (n - k), value = ways * one;
      return {
        question: `Each of ${n} independent trials succeeds with probability ${p}. What is the probability of exactly ${k} success${k === 1 ? "" : "es"}? Give 3 significant figures.`,
        answer: String(round(value, 4)),
        rubric: "P(X = k) = C(n, k)·pᵏ·(1 − p)ⁿ⁻ᵏ: the number of arrangements times the probability of one arrangement.",
        steps: [`C(${n}, ${k}) = ${ways}`, `${p}^${k} × ${round(1 - p, 2)}^${n - k} = ${Number(one.toPrecision(4))}`, `P(X = ${k}) = ${ways} × ${Number(one.toPrecision(4))} = ${Number(value.toPrecision(4))}`], working: [ways],
        mark: text => numericMark(lastValue(text), value, { arrangements_ignored: one, failures_ignored: ways * p ** k }, 0, nearProbability),
      };
    },
  }),
  template({
    id: "complex.product", objective: "math.complex_numbers", difficulty: 2,
    misconceptions: {
      i_squared_positive: "took i² as +1 instead of −1",
      cross_terms_dropped: "multiplied real with real and imaginary with imaginary only, leaving out the cross terms",
    },
    build(seed) {
      const r = rng(seed); const nz = () => pick(r, [-4, -3, -2, -1, 1, 2, 3, 4, 5]);
      const a = nz(), b = nz(), c = nz(), d = nz(), re = a * c - b * d, im = a * d + b * c;
      const show = (x: number, y: number) => `${x} ${signed(y)}i`;
      return {
        question: `Multiply the complex numbers (${show(a, b)})(${show(c, d)}). Give the answer in the form x + yi.`, answer: show(re, im),
        rubric: "Expand all four products, replace i² with −1, then collect real and imaginary parts.",
        steps: [`${a}·${c} = ${a * c}`, `cross terms: ${a * d}i and ${b * c}i`, `${b}·${d}·i² = ${-b * d}`], working: [a * c, b * d],
        mark(text) {
          const z = lastComplex(text);
          if (!z) return unreadable("no complex number found");
          const is = (x: number, y: number) => z.re === x && z.im === y;
          if (is(re, im)) return right("real and imaginary parts match");
          if (is(a * c + b * d, im)) return wrong("i_squared_positive", "real part uses i² = +1");
          if (is(a * c, b * d)) return wrong("cross_terms_dropped", "no cross terms");
          return wrong(null, "parts do not match");
        },
      };
    },
  }),
  template({
    id: "complex.modulus", objective: "math.complex_numbers", difficulty: 1,
    misconceptions: {
      parts_added: "added the sizes of the two parts instead of using Pythagoras",
      root_not_taken: "found a² + b² but did not take the square root",
    },
    build(seed) {
      const r = rng(seed); const [x, y, h] = pick(r, [[3, 4, 5], [5, 12, 13], [8, 15, 17], [6, 8, 10], [7, 24, 25], [9, 12, 15]]);
      const a = x * pick(r, [1, -1]), b = y * pick(r, [1, -1]);
      return {
        question: `Find the modulus of the complex number z = ${a} ${signed(b)}i.`, answer: String(h),
        rubric: "|z| = √(a² + b²): the distance of the point (a, b) from the origin of the complex plane.",
        steps: [`a² + b² = ${x * x} + ${y * y} = ${h * h}`, `|z| = √${h * h} = ${h}`], working: [h * h],
        mark: text => numericMark(lastNumber(text.replace(/√\s*\d+/g, "")) ?? lastNumber(text), h, { parts_added: x + y, root_not_taken: h * h }, 0),
      };
    },
  }),

  // ---------------- Physics ----------------
  template({
    id: "phys.newton2", objective: "phys.newtons_second_law", difficulty: 1,
    misconceptions: {
      friction_ignored: "used the applied force alone instead of the net force",
      friction_added: "added the friction force instead of subtracting it",
      multiplied_by_mass: "multiplied the net force by the mass instead of dividing",
    },
    build(seed) {
      const r = rng(seed); const m = pick(r, [2, 4, 5, 8, 10, 20]), f = pick(r, [4, 6, 10, 12]), a = pick(r, [0.5, 1, 1.5, 2, 3]);
      const F = m * a + f;
      return {
        question: `A ${m} kg crate on a horizontal floor is pushed with a horizontal force of ${F} N. A friction force of ${f} N opposes the motion. What is the crate's acceleration? Give the unit.`,
        answer: `${a} m/s²`,
        rubric: "Draw the forces, find the net force along the motion (applied minus friction), then a = F_net / m, in m/s².",
        steps: [`F_net = ${F} − ${f} = ${F - f} N`, `a = F_net / m = ${F - f} / ${m} = ${a} m/s²`], working: [F - f],
        mark: text => numericMark(plainNumber(text), a, { friction_ignored: F / m, friction_added: (F + f) / m, multiplied_by_mass: (F - f) * m }),
      };
    },
  }),
  template({
    id: "phys.projectile", objective: "phys.projectile_motion", difficulty: 2,
    misconceptions: {
      angle_not_doubled: "used sin θ where the range formula needs sin 2θ",
      half_missing: "left out the factor ½ in the maximum height",
      full_speed_used: "used the launch speed instead of its vertical component",
      one_way_time: "found the time to the top, not the whole flight",
    },
    build(seed) {
      const r = rng(seed); const v = pick(r, [10, 14, 20, 28]), deg = pick(r, [30, 45, 60]), kind = pick(r, ["range", "height", "time"] as const);
      const g = 9.8, th = (deg * Math.PI) / 180, vy = v * Math.sin(th);
      const value = { range: (v * v * Math.sin(2 * th)) / g, height: (vy * vy) / (2 * g), time: (2 * vy) / g }[kind];
      const what = { range: "its horizontal range", height: "the maximum height it reaches", time: "its total time in the air" }[kind];
      const wrongs: Record<string, number> = kind === "range" ? { angle_not_doubled: (v * v * Math.sin(th)) / g }
        : kind === "height" ? { half_missing: (vy * vy) / g, full_speed_used: (v * v) / (2 * g) }
        : { one_way_time: vy / g, full_speed_used: (2 * v) / g };
      return {
        question: `A ball is launched from level ground at ${v} m/s at ${deg}° above the horizontal. Ignore air resistance and take g = 9.8 m/s². Find ${what}. Give 3 significant figures and the unit.`,
        answer: `${round(value, 2)} ${kind === "time" ? "s" : "m"}`,
        rubric: "Split the launch velocity into horizontal (v·cos θ, constant) and vertical (v·sin θ, changed by g) parts; treat the two directions separately.",
        steps: [`v_y = ${v}·sin ${deg}° = ${round(vy, 2)} m/s`, `v_x = ${v}·cos ${deg}° = ${round(v * Math.cos(th), 2)} m/s`, kind === "range" ? `R = v²·sin(2θ)/g = ${v}²·sin ${2 * deg}°/9.8 = ${round(value, 2)} m` : kind === "height" ? `H = v_y²/(2g) = ${round(vy, 2)}²/19.6 = ${round(value, 2)} m` : `T = 2·v_y/g = 2 × ${round(vy, 2)}/9.8 = ${round(value, 2)} s`],
        working: [round(vy, 2)],
        mark: text => numericMark(plainNumber(text), value, wrongs, 0.012),
      };
    },
  }),
  template({
    id: "phys.wave", objective: "phys.wave_speed", difficulty: 1,
    misconceptions: {
      divided_instead: "divided frequency by wavelength instead of multiplying",
      multiplied_instead: "multiplied speed by frequency instead of dividing",
      ratio_inverted: "divided frequency by speed instead of speed by frequency",
    },
    build(seed) {
      const r = rng(seed); const f = pick(r, [2, 5, 50, 100, 250, 440]), lambda = pick(r, [0.5, 0.75, 1.2, 2, 3.4]), findSpeed = r() < 0.5;
      const v = round(f * lambda, 2);
      return findSpeed ? {
        question: `A wave has frequency ${f} Hz and wavelength ${lambda} m. What is its speed? Give the unit.`, answer: `${v} m/s`,
        rubric: "v = f·λ: each second f wavelengths pass, each of length λ.", steps: ["v = f·λ", `v = ${f} × ${lambda} = ${v} m/s`],
        mark: text => numericMark(plainNumber(text), v, { divided_instead: f / lambda }),
      } : {
        question: `A wave travels at ${v} m/s with frequency ${f} Hz. What is its wavelength? Give the unit.`, answer: `${lambda} m`,
        rubric: "Rearrange v = f·λ to λ = v / f.", steps: ["λ = v / f", `λ = ${v} / ${f} = ${lambda} m`],
        mark: text => numericMark(plainNumber(text), lambda, { multiplied_instead: v * f, ratio_inverted: f / v }),
      };
    },
  }),
  template({
    id: "phys.faraday", objective: "phys.electromagnetic_induction", difficulty: 2,
    misconceptions: {
      turns_ignored: "left out the number of turns",
      milli_not_converted: "did not convert milliwebers and milliseconds consistently",
    },
    build(seed) {
      const r = rng(seed); const N = pick(r, [50, 100, 200, 500]), dPhi = pick(r, [2, 4, 5, 8, 10]), dt = pick(r, [10, 20, 40, 50, 100]);
      const emf = (N * dPhi) / dt;
      return {
        question: `The magnetic flux through each turn of a ${N}-turn coil changes uniformly by ${dPhi} mWb in ${dt} ms. What is the magnitude of the induced emf? Give the unit.`,
        answer: `${round(emf, 3)} V`,
        rubric: "Faraday's law: |emf| = N·ΔΦ/Δt, with ΔΦ in webers and Δt in seconds.",
        steps: [`ΔΦ = ${dPhi} mWb = ${dPhi / 1000} Wb`, `Δt = ${dt} ms = ${dt / 1000} s`, `|emf| = N·ΔΦ/Δt = ${N} × ${dPhi / 1000} / ${dt / 1000} = ${round(emf, 3)} V`], working: [round(dPhi / dt, 4)],
        mark: text => numericMark(lastQuantity(dropUnitPowers(text), "V|volts?"), emf, { turns_ignored: dPhi / dt, milli_not_converted: emf * 1000 }),
      };
    },
  }),

  // ---------------- Circuits and engineering ----------------
  template({
    id: "ee.series_parallel", objective: "ee.kirchhoff_laws", difficulty: 3,
    misconceptions: {
      series_drop_used: "used the voltage across the series resistor as the voltage across the parallel branches",
      series_resistor_ignored: "put the full supply voltage across the branch, ignoring the drop across the series resistor",
      total_current_given: "gave the total current, which splits between the two branches",
      other_branch: "gave the current in the other branch",
    },
    build(seed) {
      const r = rng(seed); const [R2, R3, Rp] = pick(r, [[3, 6, 2], [4, 12, 3], [6, 12, 4], [10, 15, 6], [20, 30, 12], [6, 3, 2], [12, 4, 3]]);
      const R1 = pick(r, [1, 2, 3, 4, 6, 8]), I = pick(r, [0.5, 1, 2, 3]);
      const V = I * (R1 + Rp), Vp = I * Rp, I2 = Vp / R2;
      return {
        question: `A ${V} V battery is connected to a ${R1} Ω resistor in series with a parallel pair, R2 = ${R2} Ω and R3 = ${R3} Ω. Find the current through R2. Give the unit.`,
        answer: `${round(I2, 3)} A`,
        rubric: "Combine the parallel pair, add the series resistor, find the total current, then the voltage across the parallel pair (supply minus the series drop, by Kirchhoff's voltage law), then the branch current. Check with Kirchhoff's current law: the branch currents add up to the total.",
        steps: [`R_parallel = ${R2}·${R3}/(${R2} + ${R3}) = ${Rp} Ω`, `R_total = ${R1} + ${Rp} = ${R1 + Rp} Ω`, `I_total = ${V}/${R1 + Rp} = ${I} A`,
                `V_parallel = ${V} − ${I}·${R1} = ${Vp} V`, `I_2 = ${Vp}/${R2}`],
        working: [Rp, R1 + Rp, I, Vp],
        mark: text => numericMark(lastQuantity(text, "A|amps?|amperes?"), I2,
          { series_drop_used: (I * R1) / R2, series_resistor_ignored: V / R2, total_current_given: I, other_branch: Vp / R3 }, 0.012),
      };
    },
  }),
  template({
    id: "semi.diode", objective: "semi.diode_circuits", difficulty: 1,
    misconceptions: {
      drop_ignored: "ignored the 0.7 V across the diode",
      drop_added: "added the diode drop to the supply instead of subtracting it",
    },
    build(seed) {
      const r = rng(seed); const V = pick(r, [3, 5, 9, 12]), R = pick(r, [220, 330, 470, 1000, 2200]);
      const mA = ((V - 0.7) / R) * 1000;
      return {
        question: `A silicon diode (forward voltage 0.7 V) is forward biased in series with a ${R} Ω resistor across a ${V} V supply. What current flows? Answer in mA.`,
        answer: `${round(mA, 2)} mA`,
        rubric: "The resistor has the supply voltage minus the diode drop across it: I = (V − 0.7)/R, then convert to mA.",
        steps: [`V_R = ${V} − 0.7 = ${round(V - 0.7, 1)} V`, `I = ${round(V - 0.7, 1)}/${R} = ${round((V - 0.7) / R, 6)} A = ${round(mA, 2)} mA`], working: [round(V - 0.7, 1)],
        mark: text => numericMark(milliamps(text), mA, { drop_ignored: (V / R) * 1000, drop_added: ((V + 0.7) / R) * 1000 }, 0.015),
      };
    },
  }),
  template({
    id: "sig.nyquist", objective: "sig.sampling", difficulty: 1,
    misconceptions: {
      equal_to_highest: "sampled at the highest frequency instead of twice it",
      lowest_used: "used the lowest component instead of the highest",
      components_summed: "added the component frequencies",
    },
    build(seed) {
      const r = rng(seed); const pool = [0.3, 0.5, 0.8, 1.2, 1.5, 2, 2.5, 3.5, 4, 6, 8];
      const fs = new Set<number>(); while (fs.size < 3) fs.add(pick(r, pool));
      const list = [...fs], hi = Math.max(...list), lo = Math.min(...list), sum = list.reduce((a, b) => a + b, 0);
      const hz = (text: string) => { const v = lastQuantity(text, "Hz|hertz"); return v == null ? null : /hz|hertz/i.test(text) ? v : v * 1000; };
      return {
        question: `A signal contains sinusoidal components at ${list[0]} kHz, ${list[1]} kHz and ${list[2]} kHz. What is the minimum sampling rate that avoids aliasing (the Nyquist rate)? Answer in kHz.`,
        answer: `${round(2 * hi, 2)} kHz`,
        rubric: "The sampling rate must be at least twice the highest frequency present; lower components don't matter.",
        steps: [`highest component = ${hi} kHz`, `f_s = 2 × ${hi} kHz = ${round(2 * hi, 2)} kHz`], working: [hi],
        mark: text => numericMark(hz(text), 2000 * hi, { equal_to_highest: 1000 * hi, lowest_used: 2000 * lo, components_summed: 1000 * sum }, 0.005),
      };
    },
  }),
  template({
    id: "ctrl.unity_feedback", objective: "ctrl.feedback_steady_state", difficulty: 2,
    misconceptions: {
      open_loop_gain: "used the forward gain alone, as if there were no feedback",
      error_given: "gave the steady-state error instead of the output",
    },
    build(seed) {
      const r = rng(seed); const K = pick(r, [1, 3, 4, 9, 19, 24]), A = pick(r, [1, 2, 5, 10]), tau = pick(r, [0.5, 2, 5]);
      const y = (A * K) / (1 + K);
      return {
        question: `A unity negative-feedback loop has forward transfer function G(s) = ${K}/(${tau}s + 1). The reference input is a step of size ${A}. What is the steady-state value of the output?`,
        answer: String(round(y, 3)),
        rubric: "Closed loop: T(s) = G/(1 + G). For a step, the steady-state output is the step size times T(0) = K/(1 + K) (final value theorem); the time constant doesn't affect it.",
        steps: [`G(0) = ${K}`, `T(0) = ${K}/(1 + ${K}) = ${round(K / (1 + K), 4)}`, `y_ss = ${A} × ${round(K / (1 + K), 4)} = ${round(y, 3)}`], working: [round(K / (1 + K), 3)],
        mark: text => numericMark(lastValue(text), y, { open_loop_gain: A * K, error_given: A / (1 + K) }, 0.006),
      };
    },
  }),

  // ---------------- Data structures and algorithms ----------------
  template({
    id: "ds.stack_queue", objective: "ds.stacks_queues", difficulty: 1,
    misconceptions: {
      order_confused: "used first-in-first-out where the structure is last-in-first-out, or the reverse",
    },
    build(seed) {
      const r = rng(seed); const stack = r() < 0.5;
      const values: number[] = []; while (values.length < 5) { const v = int(r, 1, 20); if (!values.includes(v)) values.push(v); }
      // push, push, remove, push, push, push, remove, remove: the last removal differs between a stack and a queue.
      const pattern = pick(r, ["aaraaarr", "aaaraarr", "aararaar"]);
      const add = stack ? "push" : "enqueue", remove = stack ? "pop" : "dequeue";
      const run = (lifo: boolean) => {
        const held: number[] = []; let next = 0, out = NaN;
        for (const op of pattern) { if (op === "a") held.push(values[next++]); else out = lifo ? held.pop()! : held.shift()!; }
        return out;
      };
      let next = 0;
      const ops = [...pattern].map(op => (op === "a" ? `${add}(${values[next++]})` : `${remove}()`)).join(", ");
      const answer = run(stack), other = run(!stack);
      return {
        question: `Starting with an empty ${stack ? "stack" : "queue"}, these operations run in order: ${ops}. What value does the last ${remove}() return?`,
        answer: String(answer),
        rubric: stack ? "A stack is last in, first out: each pop removes the most recently pushed value still held." : "A queue is first in, first out: each dequeue removes the oldest value still held.",
        steps: ["write the contents after each operation", `the last ${remove}() removes the ${stack ? "newest" : "oldest"} value held`],
        mark: text => numericMark(lastNumber(text.replace(/\b(push|pop|enqueue|dequeue)\(\d*\)/gi, "")), answer, { order_confused: other }, 0),
      };
    },
  }),
  template({
    id: "algo.binary_search_steps", objective: "algo.binary_search", difficulty: 2,
    misconceptions: {
      linear_scan: "counted as if every element were examined",
      halved_once: "halved the array only once",
      last_step_missing: "stopped one step early: the final single element still has to be examined",
    },
    build(seed) {
      const r = rng(seed); const n = pick(r, [15, 31, 63, 100, 127, 500, 1000, 1023, 2000]);
      const steps = Math.floor(Math.log2(n)) + 1;
      return {
        question: `Binary search runs on a sorted array of ${n} elements. Each step examines the middle element of the remaining range and discards half of it. In the worst case, how many elements are examined before the search ends?`,
        answer: String(steps),
        rubric: "Each step halves the range, so the worst case is the number of times n can be halved down to 1, plus the final element: ⌊log₂ n⌋ + 1.",
        steps: [`⌊log₂ ${n}⌋ = ${steps - 1}`, `steps = ${steps - 1} + 1 = ${steps}`], working: [steps - 1],
        mark: text => numericMark(lastNumber(text.replace(/log\s*_?2/gi, "log")), steps, { linear_scan: n, halved_once: n / 2, last_step_missing: steps - 1 }, 0),
      };
    },
  }),
];

// Used by tests: every numeric comparison in this file goes through close() or an exact match.
export const _internals = { close, nearProbability, milliamps };
