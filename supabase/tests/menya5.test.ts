// Menya 5: the wider verified bank, the arithmetic check on tutor replies, learning stages,
// exam marks, the prerequisite diagnostic, readiness and the revision notebook.
// Reference answers in this file are worked out by hand, independently of the templates.
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { freshDb, createUser, rpc } from "./db.ts";
import { pgRepo } from "./pgRepo.ts";
import { handleApi, DbError, type ApiContext } from "../functions/_shared/api.ts";
import { handleTutor } from "../functions/_shared/tutorService.ts";
import type { ModelProvider, ChatRequest } from "../functions/_shared/providers.ts";
import { OBJECTIVES, TEMPLATES, generateItem, markItem, objective } from "../functions/_shared/engine/bank.ts";
import { STEM_TEMPLATES } from "../functions/_shared/engine/bankStem.ts";
import { isAntiderivative, lastComplex, lastValue, dropUnitPowers, lastNumber } from "../functions/_shared/engine/bankKit.ts";
import { FORMULA_CARDS, formulaCard } from "../functions/_shared/engine/formulas.ts";
import { arithmeticRequest, checkArithmetic } from "../functions/_shared/engine/mathCheck.ts";
import { statesCorrection } from "../functions/_shared/answerGuard.ts";
import { emptyRecord, stageOf, supportLevel, nextEvidence, update, type ObjectiveRecord } from "../functions/_shared/engine/mastery.ts";
import { awardMarks, buildDiagnostic, diagnosticAdvice, examReadiness, markMockExam, notebook, prerequisiteChain, topicReadiness } from "../functions/_shared/learning.ts";
import { objectiveFromText, subjectNote, teachingSubject, SUPPORT_NOTE } from "../functions/_shared/engine/pedagogy.ts";
import { parseLesson, splitSteps } from "../functions/_shared/lessonFormat.ts";
import { buildSystemPrompt } from "../functions/_shared/policy.ts";

const DAY = 864e5, NOW = Date.parse("2026-11-13T08:00:00Z");
const tpl = (id: string) => TEMPLATES.find(t => t.id === id)!;
// The first seed for which a template produces a question matching a condition.
const find = (id: string, ok: (q: string) => boolean) => { for (let s = 1; s < 400000; s++) { const it = tpl(id).generate(s); if (ok(it.question)) return it; } throw new Error(`no seed for ${id}`); };
const evidence = (id: string, list: { verdict: "correct" | "incorrect"; kind?: "verify" | "guided" | "review"; at: number; misconception?: string }[]): ObjectiveRecord =>
  list.reduce((r, e) => update(r, { kind: e.kind ?? "verify", verdict: e.verdict, hintsUsed: 0, unexplained: false, misconception: e.misconception ?? null, at: e.at }), emptyRecord(id));

describe("verified bank: first-year maths, physics, engineering and computing", () => {
  test("every topic has questions, and every template marks its own reference answer correct on 120 seeds", () => {
    for (const o of OBJECTIVES) assert.ok(generateItem(o.id, 1), `${o.id} has a template`);
    assert.ok(OBJECTIVES.length >= 30 && STEM_TEMPLATES.length >= 20);
    for (const t of TEMPLATES) for (let seed = 1; seed <= 120; seed++) {
      const item = t.generate(seed);
      assert.equal(t.mark(item, item.answer).verdict, "correct", `${t.id} seed ${seed}: ${item.question} -> ${item.answer}`);
      assert.equal(t.mark(item, `So the answer is ${item.answer}`).verdict, "correct", `${t.id} seed ${seed} in a sentence`);
    }
  });

  test("prerequisites point at real topics and never loop", () => {
    for (const o of OBJECTIVES) {
      for (const p of o.prerequisites) assert.ok(objective(p), `${o.id} -> ${p}`);
      assert.ok(!prerequisiteChain(o.id).includes(o.id), `${o.id} depends on itself`);
    }
  });

  test("a wrong answer is never marked right: each misconception's own result is rejected", () => {
    for (const t of STEM_TEMPLATES) for (let seed = 1; seed <= 40; seed++) {
      const item = t.generate(seed);
      for (const w of ["999983", "-0.000123"]) assert.notEqual(t.mark(item, w).verdict, "correct", `${t.id} accepted ${w}`);
    }
  });

  test("Kirchhoff: hand-worked circuit, and the mistake seen on the live site is recognised", () => {
    // 12 V, 2 Ω in series with 3 Ω ∥ 6 Ω: R_p = 2 Ω, R_total = 4 Ω, I = 3 A, V_p = 6 V, I(3 Ω) = 2 A.
    const item = find("ee.series_parallel", q => q.startsWith("A 12 V battery is connected to a 2 Ω resistor") && q.includes("R2 = 3 Ω and R3 = 6 Ω"));
    assert.equal(item.answer, "2 A");
    assert.equal(markItem(item, "I2 = 6 V / 3 Ω = 2 A").verdict, "correct");
    assert.equal(markItem(item, "2000 mA").verdict, "correct");
    // The series drop (3 A × 2 Ω = 6 V here equals V_p), so use a circuit where they differ.
    const other = find("ee.series_parallel", q => q.startsWith("A 27 V battery is connected to a 6 Ω resistor") && q.includes("R2 = 4 Ω and R3 = 12 Ω"));
    assert.equal(other.answer, "2.25 A");                             // R_p = 3, R_total = 9, I = 3 A, V_p = 9 V, 9/4
    const m = markItem(other, "V = 3 A × 6 Ω = 18 V so I2 = 18/4 = 4.5 A");
    assert.equal(m.verdict, "incorrect");
    assert.equal(m.misconception, "series_drop_used");
    assert.equal(markItem(other, "27/4 = 6.75 A").misconception, "series_resistor_ignored");
    assert.equal(markItem(other, "3 A").misconception, "total_current_given");
  });

  test("Newton's second law and projectiles, against hand calculations", () => {
    const crate = find("phys.newton2", q => q.includes("A 5 kg crate") && q.includes("force of 16 N") && q.includes("friction force of 6 N"));
    assert.equal(markItem(crate, "a = (16 − 6)/5 = 2 m/s^2").verdict, "correct");
    assert.equal(markItem(crate, "a = 16/5 = 3.2 m/s²").misconception, "friction_ignored");
    assert.equal(markItem(crate, "50").misconception, "multiplied_by_mass");
    // 20 m/s at 30°: range = 400·sin 60°/9.8 = 35.35 m; height = (10)²/19.6 = 5.10 m; time = 20/9.8 = 2.04 s.
    const range = find("phys.projectile", q => q.includes("20 m/s at 30°") && q.includes("range"));
    assert.equal(markItem(range, "35.3 m").verdict, "correct");
    assert.equal(markItem(range, "400 × 0.5 / 9.8 = 20.4 m").misconception, "angle_not_doubled");
    const height = find("phys.projectile", q => q.includes("20 m/s at 30°") && q.includes("maximum height"));
    assert.equal(markItem(height, "5.10 m").verdict, "correct");
    assert.equal(markItem(height, "10.2 m").misconception, "half_missing");
    const time = find("phys.projectile", q => q.includes("20 m/s at 30°") && q.includes("time in the air"));
    assert.equal(markItem(time, "2.04 s").verdict, "correct");
    assert.equal(markItem(time, "1.02 s").misconception, "one_way_time");
  });

  test("integration: checked by differentiating the answer, in any equivalent form, with or without + C", () => {
    assert.equal(isAntiderivative("sin(x^2)", "2x*cos(x^2)"), true);
    assert.equal(isAntiderivative("sin(x^2) + 7", "2x*cos(x^2)"), true);
    assert.equal(isAntiderivative("x^3/3 + C", "x^2"), true);
    assert.equal(isAntiderivative("2x*sin(x^2)", "2x*cos(x^2)"), false);
    assert.equal(isAntiderivative("???", "x^2"), null);
    const sub = find("int.substitution", q => q.includes("6x·e^(x²)"));
    assert.equal(markItem(sub, "3e^(x^2) + C").verdict, "correct");
    assert.equal(markItem(sub, "3·exp(x²)").verdict, "correct");
    assert.equal(markItem(sub, "6e^(x^2) + C").misconception, "inner_derivative_ignored");
    // ∫₀² (6x² + 3) dx = [2x³ + 3x]₀² = 16 + 6 = 22
    const power = find("int.power", q => q.includes("f(x) = 6x^2 + 3 from x = 0 to x = 2"));
    assert.equal(markItem(power, "22").verdict, "correct");
    assert.equal(markItem(power, "6·8 + 6 = 54").misconception, "not_divided");
  });

  test("differentiation, differential equations, matrices, probability and complex numbers", () => {
    const d = find("calc.power", q => q === "Differentiate f(x) = 3x^2 + 5x + 4");
    assert.equal(markItem(d, "f'(x) = 6x + 5").verdict, "correct");
    assert.equal(markItem(d, "3x + 5").misconception, "exponent_not_multiplied");
    assert.equal(markItem(d, "6x + 5 + 4").misconception, "kept_constant");
    const ode = find("ode.decay", q => q.includes("dy/dt = −0.5·y with y(0) = 8") && q.includes("y(2)"));
    assert.equal(markItem(ode, "y = 8e^(-1) = 2.94").verdict, "correct");            // 8/e = 2.943
    assert.equal(markItem(ode, "8(1 − 1) = 0").misconception, "linear_change");
    assert.equal(markItem(ode, "21.7").misconception, "sign_reversed");
    const det = find("linalg.det2", q => q.includes("first row (3, 2) and second row (5, 4)"));
    assert.equal(markItem(det, "12 − 10 = 2").verdict, "correct");
    assert.equal(markItem(det, "22").misconception, "added_products");
    const fail = find("prob.at_least_one", q => q.includes("probability 0.2 and the second with probability 0.3"));
    assert.equal(markItem(fail, "1 − 0.8 × 0.7 = 0.44").verdict, "correct");
    assert.equal(markItem(fail, "11/25").verdict, "correct");
    assert.equal(markItem(fail, "44%").verdict, "correct");
    assert.equal(markItem(fail, "0.5").misconception, "probabilities_added");
    const bin = find("prob.binomial", q => q.includes("Each of 4 independent trials succeeds with probability 0.5") && q.includes("exactly 2"));
    assert.equal(markItem(bin, "6/16 = 0.375").verdict, "correct");
    assert.equal(markItem(bin, "0.0625").misconception, "arrangements_ignored");
    const z = find("complex.product", q => q.includes("(2 + 3i)(1 - 4i)"));
    assert.equal(markItem(z, "2 − 8i + 3i − 12i² = 14 − 5i").verdict, "correct");
    assert.equal(markItem(z, "-10 - 5i").misconception, "i_squared_positive");
    assert.deepEqual(lastComplex("z = -2i"), { re: 0, im: -2 });
    assert.equal(lastValue("p = 3/8"), 0.375);
    assert.equal(lastNumber(dropUnitPowers("1.5 m/s^2")), 1.5);
  });

  test("engineering and computing topics, against hand calculations", () => {
    const fs = find("sig.nyquist", q => q.includes("3.5 kHz"));
    const top = Math.max(...(fs.question.match(/[\d.]+(?= kHz)/g) ?? []).map(Number));
    assert.equal(markItem(fs, `${2 * top} kHz`).verdict, "correct");
    assert.equal(markItem(fs, `${2000 * top} Hz`).verdict, "correct");
    assert.equal(markItem(fs, `${top} kHz`).misconception, "equal_to_highest");
    const loop = find("ctrl.unity_feedback", q => q.includes("G(s) = 9/") && q.includes("step of size 10"));
    assert.equal(markItem(loop, "10 × 9/10 = 9").verdict, "correct");
    assert.equal(markItem(loop, "90").misconception, "open_loop_gain");
    assert.equal(markItem(loop, "1").misconception, "error_given");
    const diode = find("semi.diode", q => q.includes("1000 Ω resistor across a 5 V supply"));
    assert.equal(markItem(diode, "4.3 mA").verdict, "correct");
    assert.equal(markItem(diode, "0.0043 A").verdict, "correct");
    assert.equal(markItem(diode, "5 mA").misconception, "drop_ignored");
    const emf = find("phys.faraday", q => q.includes("200-turn coil") && q.includes("5 mWb in 100 ms"));
    assert.equal(markItem(emf, "200 × 0.005 / 0.1 = 10 V").verdict, "correct");
    assert.equal(markItem(emf, "0.05 V").misconception, "turns_ignored");
    const search = find("algo.binary_search_steps", q => q.includes("1000 elements"));
    assert.equal(markItem(search, "10").verdict, "correct");                          // 2^9 = 512 ≤ 1000 < 1024
    assert.equal(markItem(search, "9").misconception, "last_step_missing");
    assert.equal(markItem(search, "1000").misconception, "linear_scan");
  });

  test("formula cards exist only for real topics and say when the formula applies", () => {
    assert.ok(FORMULA_CARDS.length >= 25);
    for (const c of FORMULA_CARDS) {
      assert.ok(objective(c.objective), c.objective);
      for (const k of ["use", "conditions", "origin", "mistake", "recall"] as const) assert.ok(c[k].length > 8, `${c.objective}.${k}`);
      assert.ok(c.formula.length > 4, c.objective);
      assert.ok(c.symbols.length > 0);
    }
    assert.match(formulaCard("ee.kirchhoff_laws")!.formula, /KCL.*KVL/);
    assert.equal(formulaCard("no.such"), null);
  });
});

describe("arithmetic check on tutor replies", () => {
  const LIVE = `@@example
Suppose a 10 V battery, a 1 Ω series resistor, and parallel branches of 2 Ω and 4 Ω. • Find total resistance: R_total = 1 Ω + (1/(1/2 Ω + 1/4 Ω)) = 1 Ω + 1.33 Ω = 2.33 Ω. • Total current: I_total = V / R_total = 10 V / 2.33 Ω ≈ 4.29 A. • Voltage across parallel part: V_parallel = I_total × 1 Ω = 4.29 V. • Currents in branches: I_2Ω = V_parallel / 2 Ω ≈ 2.14 A, I_4Ω = V_parallel / 4 Ω ≈ 1.07 A. • Check: I_2Ω + I_4Ω ≈ I_total.
@@try
What is the equivalent resistance of your circuit?`;

  test("the false check in the reply recorded from the live site is caught", () => {
    const r = checkArithmetic(LIVE);
    assert.equal(r.problems.length, 1);
    assert.equal(r.problems[0].statement, "I_2Ω + I_4Ω ≈ I_total");
    assert.ok(Math.abs(r.problems[0].leftValue - 3.21) < 0.01 && Math.abs(r.problems[0].rightValue - 4.29) < 0.01);
    assert.match(arithmeticRequest(r.problems), /works out to 3\.21.*4\.29/s);
  });

  test("the corrected working passes", () => {
    const fixed = LIVE.replace("V_parallel = I_total × 1 Ω = 4.29 V", "V_parallel = 10 V − I_total × 1 Ω = 5.71 V")
      .replace("≈ 2.14 A", "≈ 2.86 A").replace("≈ 1.07 A", "≈ 1.43 A");
    assert.deepEqual(checkArithmetic(fixed).problems, []);
  });

  test("true lines are not flagged: units, prefixes, rounding, degrees, percentages", () => {
    for (const line of ["I = V/R = 12 V / 4 Ω = 3 A", "I = 12 V / 4 kΩ = 3 mA = 0.003 A", "72 km/h = 20 m/s", "5 min = 300 s", "500 g = 0.5 kg",
      "F_net = 30 N − 6 N = 24 N, so a = F_net / 5 kg = 4.8 m/s²", "1/3 = 0.33 and 2/3 ≈ 0.67", "R = 3·6/(3 + 6) = 2 Ω",
      "sin 30° = 0.5", "P = 1 − 0.7 × 0.8 = 0.44", "C(4, 3) = 4, and 4 × 0.4³ × 0.6 = 0.1536", "det = 3·4 − 2·5 = 2", "25 % = 0.25",
      "y(2) = 8·e^(−1) = 2.94", "√(3² + 4²) = 5", "10/3 ≈ 3.3"]) {
      const r = checkArithmetic(line);
      assert.deepEqual(r.problems, [], line);
      assert.ok(r.checked >= 1, `checked: ${line}`);
    }
  });

  test("what can't be evaluated with certainty is left alone", () => {
    for (const line of ["2m = 10, so m = 5", "x = 4. 3x + 5 = 17", "f(x) = 3x² + 5x + 4", "sin(30) = 0.5", "log 100 = 2", "g(1) = 6, g'(1) = 10",
      "```\nx = 1 + 1 = 3\n```", "if a == b then stop", "x ≥ 2", "1 kg ≈ 2.2 lb", "H2 + O2 = H2O"]) {
      assert.deepEqual(checkArithmetic(line).problems, [], line);
    }
  });

  test("false lines are caught", () => {
    for (const line of ["7 + 8 = 16", "I = 12 V / 4 Ω = 4 A", "a = 24 N / 5 kg = 5.2 m/s²", "0.4³ × 0.6 = 0.0484", "det = 3·4 − 2·5 = 22",
      "I = 12 V / 4 kΩ = 3 A", "1 − 0.8 × 0.7 = 0.56"]) {
      assert.equal(checkArithmetic(line).problems.length, 1, line);
    }
  });

  test("a name from the worked example is not carried into the student's own problem", () => {
    const r = checkArithmetic("@@example\nR_total = 2 Ω + 3 Ω = 5 Ω.\n@@try\nIn your circuit R_total = 4 Ω + 6 Ω. What is it?");
    assert.deepEqual(r.problems, []);
  });
});

describe("a wrong step is not corrected for the student", () => {
  test("stating the fixed value next to the student's is recognised; ordinary feedback is not", () => {
    assert.equal(statesCorrection("You missed the factor 2; the derivative of 3x^2 should be 6x, not 3x.", "3x"), true);
    assert.equal(statesCorrection("The current is 3 A, not 12 A.", "I = 12 A"), true);
    assert.equal(statesCorrection("It is not 12 A but 3 A.", "12 A"), true);
    assert.equal(statesCorrection("Not quite: look again at the exponent. What do you multiply by when the power comes down?", "3x"), false);
    assert.equal(statesCorrection("The slope is 4, not 5 as the sketch suggests.", "3x"), false);
    assert.equal(statesCorrection("That is right, not wrong.", "3x"), false);
  });
});

describe("learning stages and topic-level support", () => {
  test("each stage needs its own kind of evidence", () => {
    const id = "calc.integration_power", t = NOW - 20 * DAY;
    assert.equal(stageOf(null), "not_started");
    assert.equal(stageOf(evidence(id, [{ verdict: "incorrect", at: t }])), "exposure");
    const guided = evidence(id, [{ verdict: "correct", kind: "guided", at: t }]);
    assert.equal(stageOf(guided), "understanding");
    assert.equal(nextEvidence(guided), "solve_alone");
    // Any number of guided successes never becomes application.
    assert.equal(stageOf(evidence(id, Array.from({ length: 8 }, (_, i) => ({ verdict: "correct" as const, kind: "guided" as const, at: t + i * DAY })))), "understanding");
    const alone = evidence(id, [{ verdict: "correct", kind: "guided", at: t }, { verdict: "correct", at: t + 3600e3 }]);
    assert.equal(stageOf(alone), "application");
    // The same day again is still not retention.
    assert.equal(stageOf(update(alone, { kind: "verify", verdict: "correct", hintsUsed: 0, unexplained: false, misconception: null, at: t + 7200e3 })), "application");
    const later = update(alone, { kind: "review", verdict: "correct", hintsUsed: 0, unexplained: false, misconception: null, at: t + 3 * DAY });
    assert.equal(stageOf(later), "retention");
    const mastered = evidence(id, [{ verdict: "correct", at: t }, { verdict: "correct", at: t + DAY }, { verdict: "correct", at: t + 4 * DAY }, { verdict: "correct", at: t + 5 * DAY }]);
    assert.equal(stageOf(mastered), "mastery");
  });

  test("support follows the topic, both ways", () => {
    const t = NOW - 20 * DAY;
    assert.equal(supportLevel(null), 1);
    const calc = evidence("calc.chain_rule", [{ verdict: "correct", at: t }, { verdict: "correct", at: t + 3 * DAY }, { verdict: "correct", at: t + 6 * DAY }]);
    const mech = evidence("phys.newtons_second_law", [{ verdict: "incorrect", at: t }]);
    assert.equal(supportLevel(calc), 3);
    assert.equal(supportLevel(mech), 1, "advanced in calculus, beginner in mechanics");
    assert.equal(supportLevel(evidence("ee.ohms_law", [{ verdict: "correct", kind: "guided", at: t }, { verdict: "correct", at: t + DAY }])), 2);
    let slipping = calc;
    for (let i = 0; i < 6; i++) slipping = update(slipping, { kind: "verify", verdict: "incorrect", hintsUsed: 0, unexplained: false, misconception: null, at: t + (8 + i) * DAY });
    assert.equal(supportLevel(slipping), 1, "repeated failures bring more support back");
    assert.match(SUPPORT_NOTE[3], /independent mastery/);
  });
});

describe("exam marks, diagnostic, readiness and notebook", () => {
  test("marks follow difficulty; correct working earns method marks, copied givens earn none", () => {
    const item = find("ee.series_parallel", q => q.startsWith("A 27 V battery is connected to a 6 Ω resistor") && q.includes("R2 = 4 Ω and R3 = 12 Ω"));
    assert.deepEqual(awardMarks(item, "2.25 A", true), { marks: 4, awarded: 4, method: { found: 0, total: 2 } });
    assert.equal(awardMarks(item, "R_p = 3 Ω, R_total = 9 Ω, I = 3 A, then V = 9 V, I2 = 9/12 = 0.75 A", false).awarded, 3, "all working shown, wrong last step");
    assert.equal(awardMarks(item, "27 V, 6 Ω, 4 Ω, 12 Ω so 100 A", false).awarded, 0, "repeating the question's numbers is not working");
    assert.equal(awardMarks(item, "", false).awarded, 0);
    const easy = tpl("ee.ohm").generate(3);
    assert.deepEqual(awardMarks(easy, "nonsense 1", false), { marks: 2, awarded: 0, method: null });
    const exam = [{ n: 1, objective: item.objective, templateId: item.templateId, question: item.question, answer: item.answer, seed: item.seed }];
    const marked = markMockExam(exam, { 1: "R_p = 3, R_total = 9, I = 3 A, so I2 = 3 × 6 / 4 = 4.5 A" });
    assert.equal(marked.results[0].verdict, "incorrect");
    assert.equal(marked.score.marks, 4);
    assert.ok(marked.score.awarded > 0 && marked.score.awarded < 4, "partial credit");
    assert.equal(marked.results[0].misconceptionId, "series_drop_used");
  });

  test("a diagnostic asks about what the topic depends on, earliest first, then the topic", () => {
    assert.deepEqual(prerequisiteChain("calc.integration_substitution"), ["calc.basic_derivatives", "calc.chain_rule", "calc.integration_power"]);
    const items = buildDiagnostic("calc.integration_substitution", Math.random);
    assert.deepEqual(items.map(i => i.objective), ["calc.basic_derivatives", "calc.chain_rule", "calc.integration_power", "calc.integration_substitution"]);
    const alone = buildDiagnostic("linalg.determinants", Math.random);
    assert.equal(alone.length, 2);
    assert.notEqual(alone[0].question, alone[1].question);
    assert.deepEqual(buildDiagnostic("no.such", Math.random), []);
    const marked = markMockExam(items, { 1: items[0].answer, 2: "0", 3: items[2].answer, 4: "0" });
    const advice = diagnosticAdvice("calc.integration_substitution", marked.results);
    assert.equal(advice.startAt, "calc.chain_rule", "start at the earliest gap, not at the topic");
    assert.deepEqual(advice.secure, ["calc.basic_derivatives", "calc.integration_power"]);
    const clean = markMockExam(items, Object.fromEntries(items.map(i => [i.n, i.answer])));
    assert.equal(diagnosticAdvice("calc.integration_substitution", clean.results).startAt, null);
  });

  test("readiness states what the evidence shows, and puts the weakest topics first", () => {
    const t = NOW - 30 * DAY;
    const secure = evidence("calc.basic_derivatives", [{ verdict: "correct", at: t }, { verdict: "correct", at: t + 3 * DAY }, { verdict: "correct", at: NOW - DAY }]);
    const weak = evidence("calc.integration_substitution", [{ verdict: "incorrect", at: t, misconception: "inner_derivative_ignored" }, { verdict: "incorrect", at: t + DAY, misconception: "inner_derivative_ignored" }]);
    const guided = evidence("calc.chain_rule", [{ verdict: "correct", kind: "guided", at: t }]);
    const once = evidence("calc.integration_power", [{ verdict: "correct", at: NOW - DAY }]);
    const stale = { ...secure, objective_id: "ee.ohms_law", next_review_at: new Date(NOW - 20 * DAY).toISOString() };
    assert.equal(topicReadiness("calc.basic_derivatives", secure, NOW).state, "secure");
    assert.equal(topicReadiness("ee.ohms_law", stale, NOW).state, "forgetting");
    assert.equal(topicReadiness("calc.chain_rule", guided, NOW).state, "guided_only");
    assert.equal(topicReadiness("calc.integration_power", once, NOW).state, "not_yet_retained", "one success is not retention");
    assert.equal(topicReadiness("phys.wave_speed", undefined, NOW).state, "not_tested");
    const r = examReadiness(["calc.basic_derivatives", "calc.integration_substitution", "calc.chain_rule", "phys.wave_speed", "no.such"], [secure, weak, guided], NOW);
    assert.equal(r.total, 4);
    assert.equal(r.secure, 1);
    assert.deepEqual(r.priorities, ["calc.integration_substitution", "calc.chain_rule", "phys.wave_speed"]);
    const sub = r.topics.find(x => x.objective === "calc.integration_substitution")!;
    assert.equal(sub.state, "weak");
    assert.match(sub.misconceptions[0], /du = u′ dx/);
    assert.ok(!JSON.stringify(r).includes("%"), "no percentage, no predicted mark");
  });

  test("the notebook lists only topics the learner has met, with their mistakes", () => {
    const t = NOW - 10 * DAY;
    const rec = evidence("phys.newtons_second_law", [{ verdict: "correct", at: t }, { verdict: "incorrect", at: t + DAY, misconception: "friction_ignored" }, { verdict: "incorrect", at: t + 2 * DAY, misconception: "friction_ignored" }]);
    const entries = notebook({ profile: null, exams: [{ id: 1, title: "Mechanics", exam_date: "2026-12-01", objectives: ["phys.projectile_motion"] }], objectives: [rec], attempts: [] }, NOW);
    assert.deepEqual(entries.map(e => e.objective), ["phys.newtons_second_law", "phys.projectile_motion"]);
    assert.deepEqual(entries[0].mistakes, [{ text: "used the applied force alone instead of the net force", times: 2 }]);
    assert.equal(entries[0].forgotten, true);
    assert.equal(entries[0].due, true);
    assert.match(entries[0].card!.formula, /F_net = m·a/);
    assert.equal(entries[1].stage, "not_started");
  });
});

describe("lesson text", () => {
  test("a dash after a section marker is dropped, and steps written on one line are separated", () => {
    const l = parseLesson("@@idea — Think of a slope.\n@@example: 1. Let g(t) = 2t³. 2. Apply the rule. 3. So g′(t) = 6t².\n@@try — What is the derivative of 3x²?");
    assert.deepEqual(l.sections.map(s => s.body), ["Think of a slope.", "1. Let g(t) = 2t³. 2. Apply the rule. 3. So g′(t) = 6t².", "What is the derivative of 3x²?"]);
    assert.deepEqual(splitSteps(l.sections[1].body)!.steps, ["Let g(t) = 2t³.", "Apply the rule.", "So g′(t) = 6t²."]);
    assert.deepEqual(splitSteps("Suppose a 10 V battery. • Find R. • Find I. • Check it.")!.steps, ["Find R.", "Find I.", "Check it."]);
    assert.equal(splitSteps("In 2019. 3 people came and 1 left."), null, "ordinary sentences with numbers are not steps");
    assert.equal(parseLesson("@@try\n-3x + 2 = 8").sections[0].body, "-3x + 2 = 8", "a minus sign is not a dash");
  });

  test("topics are recognised from the student's words, and lessons get their subject's structure", () => {
    assert.equal(objectiveFromText("I can't understand Kirchhoff's laws"), "ee.kirchhoff_laws");
    assert.equal(objectiveFromText("help with integration by substitution"), "calc.integration_substitution");
    assert.equal(objectiveFromText("Teach me integration"), "calc.integration_power");
    assert.equal(objectiveFromText("explain Newton's second law"), "phys.newtons_second_law");
    assert.equal(objectiveFromText("what is photosynthesis"), null);
    for (const [, id] of [["", objectiveFromText("projectile")], ["", objectiveFromText("nyquist")]]) assert.ok(objective(id!));
    assert.equal(teachingSubject("Kirchhoff current law"), "physics");
    assert.equal(teachingSubject("anything", "calculus"), "maths");
    assert.match(subjectNote("physics", "lesson")!, /state THAT law explicitly/);
    assert.match(subjectNote("maths", "demonstrate")!, /what each symbol means BEFORE/);
    assert.equal(subjectNote("maths", "guide"), null);
    assert.equal(subjectNote(null, "lesson"), null);
    assert.match(buildSystemPrompt(), /never write a check .* that you have not actually computed/);
  });
});

// ---------------- The pipeline, with a scripted model ----------------
let db: PGlite;
let ctx: ApiContext;
const emails = new Map<string, string>();
before(async () => {
  db = await freshDb();
  ctx = {
    repo: pgRepo(db),
    db: { async rpc(fn, args) { try { return await rpc(db, fn, args); } catch (err: any) { throw new DbError(err.message, err.code); } } },
    providers: {}, billing: null,
    async getUser(jwt) { const id = jwt.replace(/^tok_/, ""); return emails.has(id) ? { id, email: emails.get(id)! } : null; },
    async deleteUser() {}, appUrl: "https://app.test", allowedOrigins: ["https://app.test"], log: () => {},
  };
});
async function user() {
  const email = `${randomUUID().slice(0, 8)}@uni.test`;
  const id = await createUser(db, email);
  emails.set(id, email);
  return { id, token: `tok_${id}` };
}
async function call(method: string, path: string, token?: string, body?: unknown) {
  const res = await handleApi(new Request(`https://x.supabase.co/functions/v1/api${path}`, { method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body) }), ctx);
  return { status: res.status, body: await res.json() as any };
}

const WRONG_LESSON = `@@idea
A circuit is like water in pipes: the battery pushes, resistors hold the flow back. Kirchhoff's current law says the current into a junction equals the current out. Kirchhoff's voltage law says the voltages round a loop add up to zero.
@@example
1. Take a 10 V battery, a 1 Ω series resistor and branches of 2 Ω and 4 Ω.
2. R_total = 1 Ω + 1.33 Ω = 2.33 Ω.
3. I_total = 10 V / 2.33 Ω ≈ 4.29 A.
4. V_parallel = I_total × 1 Ω = 4.29 V.
5. I_a = V_parallel / 2 Ω ≈ 2.14 A, I_b = V_parallel / 4 Ω ≈ 1.07 A.
6. Check: I_a + I_b ≈ I_total.
@@try
What is the combined resistance of the two parallel branches in your circuit?`;
const RIGHT_LESSON = WRONG_LESSON.replace("V_parallel = I_total × 1 Ω = 4.29 V", "V_parallel = 10 V − I_total × 1 Ω = 5.71 V").replace("≈ 2.14 A", "≈ 2.86 A").replace("≈ 1.07 A", "≈ 1.43 A");

const reply = (message: string, over: Record<string, unknown> = {}) => JSON.stringify({
  language: "English", message, type: "explanation", conceptsDetected: [], misconceptionDetected: null, hintLevel: null, progressSummary: null,
  solved: false, finalAnswer: "", difficulty: "standard", ...over });
function scripted(replies: string[]) {
  const calls: ChatRequest[] = [], referenceCalls: ChatRequest[] = [];
  const provider: ModelProvider = {
    name: "groq",
    async chat(_config, req) {
      // A request to use the server's worked example is answered with the same reply again (this model ignores it)
      // and kept apart, so each test counts only the calls it is about.
      if (String(req.messages.at(-1)!.content).startsWith("[USE THE CHECKED EXAMPLE]")) { referenceCalls.push(req); return { text: replies[Math.min(Math.max(calls.length - 1, 0), replies.length - 1)], inputTokens: 0, outputTokens: 0, latencyMs: 1, ttftMs: null }; }
      calls.push(req);
      return { text: replies[Math.min(calls.length - 1, replies.length - 1)], inputTokens: 900, outputTokens: 300, latencyMs: 10, ttftMs: null };
    },
    async health() { return { ok: true }; },
  };
  return { provider, calls, referenceCalls };
}
const ask = (message: string, extra: Record<string, unknown> = {}) => ({ requestId: randomUUID(), action: "message", message, ...extra });
// The same circuit without naming a bank topic: the worked example is then the model's own, which is what these tests need.
const CIRCUIT = "A 12 V battery feeds a 2 ohm resistor and then two parallel branches of 3 ohm and 6 ohm. I can't see how to find the current in each branch.";
const KIRCHHOFF = "I can't understand Kirchhoff's laws. A 12 V battery is in series with a 2 ohm resistor, then two parallel branches of 3 ohm and 6 ohm. Find the current in each branch.";

describe("tutor pipeline: accuracy", () => {
  test("a worked example whose check fails is sent back once, and the corrected one reaches the student", async () => {
    const u = await createUser(db);
    const groq = scripted([reply(WRONG_LESSON), reply(RIGHT_LESSON)]);
    const res = await handleTutor({ repo: pgRepo(db), providers: { groq: groq.provider }, sleep: async () => {} }, u, ask(CIRCUIT));
    assert.equal(res.status, 200);
    assert.equal(groq.calls.length, 2);
    assert.match(groq.calls[1].messages.at(-1)!.content as string, /\[CHECK YOUR WORKING\].*I_a \+ I_b ≈ I_total/s);
    assert.match((res.body.reply as any).message, /5\.71 V/);
    assert.deepEqual((res.body as any).accuracy.unverified, []);
    assert.ok((res.body as any).accuracy.checked >= 4);
    // The first request carried the physics structure.
    assert.match(groq.calls[0].messages.map(m => m.content).join("\n"), /Physics lesson/);
    assert.equal((res.body as any).accuracy.example, null, "not a bank topic: the example is the model's own and is not labelled as checked");
    const usage = (await db.query<any>("select input_tokens from public.usage_records where user_id = $1", [u])).rows[0];
    assert.equal(usage.input_tokens, 1800, "both model calls are costed");
  });

  test("if the model repeats the error, the student is told which line was not confirmed", async () => {
    const u = await createUser(db);
    const groq = scripted([reply(WRONG_LESSON)]);
    const res = await handleTutor({ repo: pgRepo(db), providers: { groq: groq.provider }, sleep: async () => {} }, u, ask(CIRCUIT));
    assert.equal(res.status, 200);
    assert.equal(groq.calls.length, 2, "one rewrite, not a loop");
    assert.deepEqual((res.body as any).accuracy.unverified, ["I_a + I_b ≈ I_total"]);
    const saved = (await db.query<any>("select meta from public.tutoring_messages where user_id = $1 and role = 'assistant'", [u])).rows[0].meta;
    assert.deepEqual(saved.unverified, ["I_a + I_b ≈ I_total"], "kept with the reply, so history shows the same notice");
  });

  test("a rewrite that drops the worked example instead of correcting it is not accepted", async () => {
    const u = await createUser(db);
    const dodge = "@@idea\nA circuit is like water in pipes: the battery pushes and the resistors hold the flow back, so the current depends on both of them together.\n@@try\nWhat is the combined resistance of the two parallel branches in your circuit?";
    const groq = scripted([reply(WRONG_LESSON), reply(dodge)]);
    const res = await handleTutor({ repo: pgRepo(db), providers: { groq: groq.provider }, sleep: async () => {} }, u, ask(CIRCUIT));
    assert.match((res.body.reply as any).message, /@@example/, "the original lesson stands");
    assert.deepEqual((res.body as any).accuracy.unverified, ["I_a + I_b ≈ I_total"], "and is flagged");
  });

  test("a correct reply costs no extra call", async () => {
    const u = await createUser(db);
    const groq = scripted([reply(RIGHT_LESSON)]);
    const res = await handleTutor({ repo: pgRepo(db), providers: { groq: groq.provider }, sleep: async () => {} }, u, ask(CIRCUIT));
    assert.equal(groq.calls.length, 1);
    assert.deepEqual((res.body as any).accuracy.unverified, []);
  });

  test("the corrected value of a wrong step is taken back out", async () => {
    const u = await createUser(db);
    const lesson = "@@idea\nThe derivative measures how fast a function changes. For a power of x, bring the power down as a multiplier and lower the power by one: that is the power rule, d/dx(a·xⁿ) = a·n·xⁿ⁻¹.\n@@try\nWhat is the derivative of the first term, 3x²?";
    const groq = scripted([
      reply(lesson, { finalAnswer: "6x + 5" }),
      reply("You applied the power rule but missed the factor 2; the derivative of 3x² should be 6x, not 3x.", { type: "redirect", finalAnswer: "6x + 5" }),
      reply("Not yet. You lowered the power correctly. Look again at what happens to the old power: it comes down as a multiplier. Redo the step with that in mind.", { type: "redirect", finalAnswer: "6x + 5" }),
    ]);
    const deps = { repo: pgRepo(db), providers: { groq: groq.provider }, sleep: async () => {} };
    const first = await handleTutor(deps, u, ask("Find the derivative of f(x) = 3x^2 + 5x + 4"));
    assert.equal((first.body as any).engine.objective.id, "calc.basic_derivatives");
    const second = await handleTutor(deps, u, ask("3x", { sessionId: first.body.sessionId }));
    assert.equal(second.status, 200);
    assert.equal(groq.calls.length, 3);
    assert.match(groq.calls[2].messages.at(-1)!.content as string, /corrected result of the step/);
    assert.ok(!/6x/.test((second.body.reply as any).message), "the fixed value is gone");
    // And if the model insists, a safe message is sent instead.
    const v = await createUser(db);
    const stubborn = scripted([reply(lesson, { finalAnswer: "6x + 5" }), reply("It should be 6x, not 3x.", { type: "redirect", finalAnswer: "6x + 5" })]);
    const d2 = { repo: pgRepo(db), providers: { groq: stubborn.provider }, sleep: async () => {} };
    const a = await handleTutor(d2, v, ask("Find the derivative of f(x) = 3x^2 + 5x + 4"));
    const b = await handleTutor(d2, v, ask("3x", { sessionId: a.body.sessionId }));
    assert.match((b.body.reply as any).message, /^Not quite yet/);
  });

  test("support for a topic comes from the learner's marked answers on that topic", async () => {
    const u = await createUser(db);
    const t = Date.now() - 20 * DAY;
    await pgRepo(db).saveObjectiveRecord(u, evidence("ee.kirchhoff_laws", [{ verdict: "correct", at: t }, { verdict: "correct", at: t + 3 * DAY }, { verdict: "correct", at: t + 6 * DAY }]));
    const groq = scripted([reply(RIGHT_LESSON)]);
    const res = await handleTutor({ repo: pgRepo(db), providers: { groq: groq.provider }, sleep: async () => {} }, u, ask(KIRCHHOFF));
    assert.match(groq.calls[0].messages.map(m => m.content).join("\n"), /Support for this topic: independent mastery/);
    assert.equal((res.body as any).engine.topic.support, 3);
    assert.equal((res.body as any).engine.topic.stage, "mastery");
  });
});

describe("Menya 5 API", () => {
  test("new routes need a signed-in learner", async () => {
    assert.equal((await call("GET", "/learn/notebook")).status, 401);
    assert.equal((await call("POST", "/learn/diagnostic")).status, 401);
  });

  test("a diagnostic is served without answers, marked on the server, and says where to start", async () => {
    const u = await user(), other = await user();
    assert.equal((await call("POST", "/learn/diagnostic", u.token, { objective: "no.such" })).status, 400);
    const start = await call("POST", "/learn/diagnostic", u.token, { objective: "ee.kirchhoff_laws" });
    assert.equal(start.status, 200);
    assert.equal(start.body.mode, "diagnostic");
    assert.equal(start.body.timeLimitSeconds, null);
    assert.deepEqual(start.body.questions.map((q: any) => q.objective), ["ee.ohms_law", "ee.series_circuits", "ee.kirchhoff_laws"]);
    assert.ok(!JSON.stringify(start.body).includes("\"answer\""));
    const keys = (await db.query<any>("select items, mode from public.mock_exams where id = $1", [start.body.id])).rows[0];
    assert.equal(keys.mode, "diagnostic");
    assert.equal((await call("POST", "/exam/submit", other.token, { id: start.body.id, answers: {} })).status, 404);
    const res = await call("POST", "/exam/submit", u.token, { id: start.body.id, answers: { 1: keys.items[0].answer, 2: "123456", 3: "123456" } });
    assert.equal(res.status, 200);
    assert.equal(res.body.mode, "diagnostic");
    assert.equal(res.body.late, false);
    assert.deepEqual(res.body.advice, { target: "ee.kirchhoff_laws", startAt: "ee.series_circuits", secure: ["ee.ohms_law"] });
    const attempts = (await db.query<any>("select kind from public.assessment_attempts where user_id = $1", [u.id])).rows;
    assert.ok(attempts.length === 3 && attempts.every(a => a.kind === "verify"), "unseen and unaided: independent evidence");

    // The map, the notebook and an exam's readiness now reflect it; another learner sees none of it.
    const exam = await call("POST", "/learn/exams", u.token, { title: "Circuits CAT", exam_date: new Date(Date.now() + 9 * DAY).toISOString().slice(0, 10), objectives: ["ee.ohms_law", "ee.kirchhoff_laws", "phys.wave_speed"] });
    assert.equal(exam.status, 200);
    const state = await call("GET", "/learn/state", u.token);
    const topics = state.body.map.flatMap((s: any) => s.topics);
    assert.equal(topics.find((x: any) => x.objective === "ee.ohms_law").stage, "application");
    assert.equal(topics.find((x: any) => x.objective === "ee.kirchhoff_laws").stage, "exposure");
    assert.equal(topics.find((x: any) => x.objective === "phys.wave_speed").stage, "not_started");
    assert.deepEqual(topics.find((x: any) => x.objective === "ee.kirchhoff_laws").prerequisites, ["ee.ohms_law", "ee.series_circuits"]);
    assert.ok(state.body.map.some((s: any) => s.subject === "physics"));
    const ready = state.body.exams[0].readiness;
    assert.equal(ready.total, 3);
    assert.equal(ready.topics.find((x: any) => x.objective === "ee.ohms_law").state, "not_yet_retained");
    assert.equal(ready.topics.find((x: any) => x.objective === "phys.wave_speed").state, "not_tested");
    const nb = await call("GET", "/learn/notebook", u.token);
    assert.deepEqual(nb.body.entries.map((e: any) => e.objective).sort(), ["ee.kirchhoff_laws", "ee.ohms_law", "ee.series_circuits", "phys.wave_speed"]);
    assert.ok(nb.body.entries.every((e: any) => e.card?.formula));
    assert.deepEqual((await call("GET", "/learn/notebook", other.token)).body.entries, []);
  });

  test("a practice exam on the new topics gives marks, and the next one is compared with it", async () => {
    const u = await user();
    const sit = async (answer: (it: any) => string) => {
      const start = await call("POST", "/exam/start", u.token, { objectives: ["phys.newtons_second_law", "ee.kirchhoff_laws"], count: 4, title: "Mock" });
      assert.equal(start.status, 200);
      const items = (await db.query<any>("select items from public.mock_exams where id = $1", [start.body.id])).rows[0].items;
      return call("POST", "/exam/submit", u.token, { id: start.body.id, answers: Object.fromEntries(items.map((it: any) => [it.n, answer(it)])) });
    };
    const first = await sit(it => (it.objective === "ee.kirchhoff_laws" ? "0.001 A" : it.answer));
    assert.equal(first.body.score.correct, 2);
    assert.equal(first.body.score.marks, 2 * 2 + 2 * 4, "Newton questions carry 2 marks, Kirchhoff 4");
    assert.equal(first.body.score.awarded, 4);
    assert.equal(first.body.previous, null);
    const kirchhoff = first.body.byObjective.find((o: any) => o.objective === "ee.kirchhoff_laws");
    assert.deepEqual([kirchhoff.awarded, kirchhoff.marks], [0, 8]);
    const second = await sit(it => it.answer);
    assert.equal(second.body.score.awarded, 12);
    assert.deepEqual([second.body.previous.correct, second.body.previous.total, second.body.previous.awarded, second.body.previous.marks], [2, 4, 4, 12]);
  });
});

// ---------------- Found by the live evaluation of 14 November 2026 ----------------
// A model that does what it is told: it uses the checked example from the engine note, word for word.
function obedient() {
  const calls: ChatRequest[] = [];
  const provider: ModelProvider = {
    name: "groq",
    async chat(_config, req) {
      calls.push(req);
      const note = req.messages.map(m => String(m.content)).find(c => c.includes("[CHECKED EXAMPLE]")) ?? "";
      const problem = /Problem: (.*)/.exec(note)?.[1] ?? "", steps = (/Steps: (.*)/.exec(note)?.[1] ?? "").split(/\s{2}(?=\d+\. )/), result = /Result: (.*)/.exec(note)?.[1] ?? "";
      const message = `@@idea\nCharge is conserved, so the current into a junction equals the current out of it. Energy is conserved, so the voltages round a loop add up to zero. Those two statements are Kirchhoff's laws.\n@@example\n${problem}\n${steps.join("\n")}\nSo the result is ${result}.\n@@try\nWhat is the combined resistance of the two parallel branches in your circuit?`;
      return { text: reply(message), inputTokens: 900, outputTokens: 300, latencyMs: 10, ttftMs: null };
    },
    async health() { return { ok: true }; },
  };
  return { provider, calls };
}

describe("worked examples computed by the server", () => {
  test("every template's own solution steps pass the arithmetic check", () => {
    for (const t of TEMPLATES) for (let seed = 1; seed <= 60; seed++) {
      const item = t.generate(seed);
      assert.deepEqual(checkArithmetic(item.steps.join("\n")).problems, [], `${t.id} seed ${seed}: ${item.steps.join(" | ")}`);
    }
  });

  test("on a bank topic the lesson's example is the server's, and is labelled as checked", async () => {
    const u = await createUser(db);
    const m = obedient();
    const res = await handleTutor({ repo: pgRepo(db), providers: { groq: m.provider }, sleep: async () => {} }, u, ask(KIRCHHOFF));
    assert.equal(res.status, 200);
    assert.equal(m.calls.length, 1, "a model that uses the example costs no extra call");
    const note = m.calls[0].messages.map(x => String(x.content)).find(c => c.includes("[CHECKED EXAMPLE]"))!;
    assert.match(note, /Problem: A \d+(\.\d+)? V battery is connected to a \d+ Ω resistor in series with a parallel pair/);
    assert.match(note, /V_parallel = [\d.]+ − [\d.]+·\d+ = [\d.]+ V/, "the step the live model got wrong is given, computed");
    assert.match(m.calls[0].messages.map(x => String(x.content)).join("\n"), /Learning objective: Analyse a series-parallel circuit with Kirchhoff's laws/);
    assert.ok(String(m.calls[0].messages.at(-2)!.content).startsWith("[CHECKED EXAMPLE]"), "placed right before the student's message");
    assert.deepEqual((res.body as any).accuracy, { checked: (res.body as any).accuracy.checked, unverified: [], example: "checked" });
    assert.ok((res.body as any).accuracy.checked >= 3, "and its lines were recomputed too");
    assert.deepEqual((res.body as any).engine.topic, { stage: "not_started", next: "learn", support: 1, practice: true, prerequisites: ["ee.ohms_law", "ee.series_circuits"] });
    // The example's problem can no longer be served as an "unseen" check.
    const served = (await db.query<any>("select kind from public.served_items where user_id = $1", [u])).rows;
    assert.deepEqual(served.map(r => r.kind), ["practice"]);
    const saved = (await db.query<any>("select meta from public.tutoring_messages where user_id = $1 and role = 'assistant'", [u])).rows[0].meta;
    assert.equal(saved.exampleChecked, true);
  });

  test("a model that keeps writing its own example (as the live model did) has it replaced by the server's", async () => {
    const u = await createUser(db);
    const groq = scripted([reply(WRONG_LESSON)]);     // its own example, and a wrong one
    const res = await handleTutor({ repo: pgRepo(db), providers: { groq: groq.provider }, sleep: async () => {} }, u, ask(KIRCHHOFF));
    assert.equal(groq.referenceCalls.length, 1, "asked once to use the checked example");
    assert.match(String(groq.referenceCalls[0].messages.at(-1)!.content), /\[USE THE CHECKED EXAMPLE\][\s\S]*Result: [\d.]+ A/);
    const message = (res.body.reply as any).message as string;
    const example = parseLesson(message).sections.find(x => x.id === "example")!.body;
    assert.match(example, /^A [\d.]+ V battery is connected to a \d+ Ω resistor in series with a parallel pair/);
    assert.match(example, /\n1\. R_parallel = [\s\S]*\n4\. V_parallel = [\d.]+ − [\d.]+·\d+ = [\d.]+ V\n5\. [\s\S]*\n6\. Result: [\d.]+ A$/, "each computed step on its own line");
    assert.ok(!message.includes("4.29"), "the model's wrong working is gone");
    assert.match(message, /@@idea[\s\S]*@@try\nWhat is the combined resistance/, "the rest of the lesson is untouched");
    assert.deepEqual((res.body as any).accuracy.unverified, []);
    assert.equal((res.body as any).accuracy.example, "checked");
    assert.equal(groq.calls.length, 1, "nothing left for the arithmetic check to send back");
  });

  test("in a language other than English the model's own example stays, and is not labelled as checked", async () => {
    const u = await createUser(db);
    const groq = scripted([reply(RIGHT_LESSON, { language: "French" })]);
    const res = await handleTutor({ repo: pgRepo(db), providers: { groq: groq.provider }, sleep: async () => {} }, u, ask(KIRCHHOFF));
    assert.equal(groq.referenceCalls.length, 1);
    assert.equal((res.body as any).accuracy.example, "unchecked");
    assert.match((res.body.reply as any).message, /5\.71 V/);
    const saved = (await db.query<any>("select meta from public.tutoring_messages where user_id = $1 and role = 'assistant'", [u])).rows[0].meta;
    assert.equal(saved.exampleChecked, undefined);
  });

  test("a typed request for another problem is served from the bank, like the button", async () => {
    const u = await createUser(db);
    const m = obedient();
    const deps = { repo: pgRepo(db), providers: { groq: m.provider }, sleep: async () => {} };
    const first = await handleTutor(deps, u, ask(KIRCHHOFF));
    const next = await handleTutor(deps, u, ask("Give me a harder problem", { sessionId: first.body.sessionId }));
    assert.equal((next.body as any).engine.state, "PRACTISE");
    assert.equal((next.body as any).engine.item.kind, "practice");
    assert.match((next.body.reply as any).message, /battery is connected to a \d+ Ω resistor/, "a checked Kirchhoff problem, not one the model made up");
    const again = await handleTutor(deps, u, ask("test me", { sessionId: first.body.sessionId }));
    assert.equal((again.body as any).engine.item.kind, "verify");
  });

  test("what the live model wrote on 14 November 2026 is now caught", () => {
    // Narrow no-break spaces between numbers and units, as the model writes them.
    assert.equal(checkArithmetic("3. Substitute: I = 9 V / 3 Ω. 4. Compute: 3 A × 3 Ω = 9 V").checked, 1);
    assert.equal(checkArithmetic("I = 9 V / 3 Ω = 4 A").problems.length, 1);
    // "The correct derivative of 3x² is 6x."
    assert.equal(statesCorrection("You wrote 3x, which looks like you dropped the factor 2. The correct derivative of 3x² is 6x.", "3x"), true);
    assert.equal(statesCorrection("La bonne réponse est 6x.", "3x"), true);
    assert.equal(statesCorrection("The correct approach is to bring the power down first.", "3x"), false);
    assert.equal(statesCorrection("The right rule is the power rule.", "3x"), false);
  });

  test("asking for a problem is recognised; ordinary messages are not", async () => {
    const { asksForProblem } = await import("../functions/_shared/engine/pedagogy.ts");
    for (const t of ["Give me a harder problem", "another one please", "can I have one more question?", "more practice", "un autre exercice"]) assert.equal(asksForProblem(t), "practice", t);
    for (const t of ["test me", "Quiz me on this"]) assert.equal(asksForProblem(t), "test", t);
    for (const t of ["I don't know", "3x", "why is it 6x?", "is this another way to solve the problem I gave you earlier, using the chain rule instead of expanding the bracket first?"]) assert.equal(asksForProblem(t), null, t);
  });

  test("a student who says they don't know is not told to 'carry out the step' when a reply has to be withheld", async () => {
    const u = await createUser(db);
    const lesson = "@@idea\nOhm's law says the current through a resistor equals the voltage across it divided by its resistance, so a bigger push gives more flow and a bigger resistance gives less.\n@@try\nWrite the formula for the current in terms of the voltage and the resistance.";
    const groq = scripted([reply(lesson, { finalAnswer: "3 A" }), reply("So I = 12 V / 4 Ω = 3 A.", { type: "hint", finalAnswer: "3 A" })]);
    const deps = { repo: pgRepo(db), providers: { groq: groq.provider }, sleep: async () => {} };
    const first = await handleTutor(deps, u, ask("A 12 V battery is across a 4 ohm heater. What current flows?"));
    const stuck = await handleTutor(deps, u, ask("I don't know", { sessionId: first.body.sessionId }));
    assert.match((stuck.body.reply as any).message, /^Let's slow down/);
    assert.doesNotMatch((stuck.body.reply as any).message, /3 A/);
  });
});

test("the worked example from the owner's screenshot is split into one step per line", () => {
  const l = parseLesson("@@example — 1. We know 3x + 5 = 14, we need x. 2. Subtract 5 from both sides: 3x = 9. 3. Divide by 3: x = 3. 4. Check: 3·3 + 5 = 14.");
  assert.deepEqual(splitSteps(l.sections[0].body)!.steps,
    ["We know 3x + 5 = 14, we need x.", "Subtract 5 from both sides: 3x = 9.", "Divide by 3: x = 3.", "Check: 3·3 + 5 = 14."]);
});

test("a value in the server's own example that equals the student's answer is not treated as a leak", async () => {
  const u = await createUser(db);
  // An obedient model whose private answer for the student's problem happens to be the example's result.
  const calls: ChatRequest[] = [];
  const provider: ModelProvider = {
    name: "groq",
    async chat(_config, req) {
      calls.push(req);
      const note = req.messages.map(m => String(m.content)).find(c => c.includes("[CHECKED EXAMPLE]")) ?? "";
      const problem = /Problem: (.*)/.exec(note)?.[1] ?? "", steps = (/Steps: (.*)/.exec(note)?.[1] ?? "").split(/\s{2}(?=\d+\. )/), result = /Result: (.*)/.exec(note)?.[1] ?? "";
      const message = `@@idea\nCharge is conserved, so the current into a junction equals the current out of it. Energy is conserved, so the voltages round a loop add up to zero. Those are Kirchhoff's laws.\n@@example\n${problem}\n${steps.join("\n")}\nSo the result is ${result}.\n@@try\nWhat is the combined resistance of the two parallel branches in your circuit?`;
      return { text: reply(message, { finalAnswer: result }), inputTokens: 900, outputTokens: 300, latencyMs: 10, ttftMs: null };
    },
    async health() { return { ok: true }; },
  };
  const res = await handleTutor({ repo: pgRepo(db), providers: { groq: provider }, sleep: async () => {} }, u, ask(KIRCHHOFF));
  assert.equal(calls.length, 1, "no rewrite was asked for");
  assert.match((res.body.reply as any).message, /@@example[\s\S]*So the result is/, "the lesson reached the student whole");
  assert.equal((res.body as any).accuracy.example, "checked");
  // Outside the example the guard still works.
  const v = await createUser(db);
  const leaky = scripted([reply("@@idea\nKirchhoff's current law says the currents into a junction add up to the current out, and the voltage law says the voltages round a loop add up to zero, so the answer is 2 A.\n@@try\nWhat is the total resistance?", { finalAnswer: "2 A" })]);
  const out = await handleTutor({ repo: pgRepo(db), providers: { groq: leaky.provider }, sleep: async () => {} }, v, ask(KIRCHHOFF));
  assert.doesNotMatch((out.body.reply as any).message, /answer is 2 A/);
});
