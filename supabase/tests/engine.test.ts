// Tutoring engine: state machine, hint ladder, assessment validation, mastery
// and the independent assessment bank. Pure functions, no model involved.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { decideTurn, selectHintLevel, reconcile, parseAssessment, asksForAnswer, isUnexplained, type TurnContext } from "../functions/_shared/engine/state.ts";
import { emptyRecord, update, isMastered, estimate } from "../functions/_shared/engine/mastery.ts";
import { TEMPLATES, OBJECTIVE_IDS, generateItem, markItem } from "../functions/_shared/engine/bank.ts";
import { equivalent, booleanEquivalent } from "../functions/_shared/engine/expr.ts";

const base: TurnContext = {
  mode: "learn", action: "message", stuck: null, newProblem: false, attempts: 1, hintsUsed: 0, verdict: "unknown", misconception: null,
  previous: { state: "GUIDE", hintLevel: 0, misconception: null, sameMisconceptionCount: 0 },
  askedForAnswer: false, unexplained: false, itemKind: null, masteredNow: false, objectiveKnown: true,
};
const ctx = (over: Partial<TurnContext>) => ({ ...base, ...over, previous: { ...base.previous, ...(over.previous ?? {}) } });
const DAY = 864e5, T0 = Date.parse("2026-10-01T09:00:00Z");

describe("the ten required scenarios", () => {
  test("1. correct on the first attempt: confirm, then an unseen problem to try alone", () => {
    const p = decideTurn(ctx({ verdict: "correct", attempts: 1 }));
    assert.equal(p.state, "VERIFY");
    assert.equal(p.revealAllowed, false);
  });

  test("2. a common misconception: the smallest hint that targets it", () => {
    const p = decideTurn(ctx({ verdict: "incorrect", misconception: "multiplied", previous: { hintLevel: 0 } as any }));
    assert.equal(p.state, "HINT");
    assert.equal(p.hintLevel, 1);
  });

  test("3. repeated wrong answers: the help increases, then the approach changes", () => {
    assert.equal(decideTurn(ctx({ verdict: "incorrect", attempts: 2, previous: { hintLevel: 1 } as any })).hintLevel, 2);
    assert.equal(decideTurn(ctx({ verdict: "incorrect", attempts: 3, previous: { hintLevel: 2 } as any })).state, "MODEL");
    const again = decideTurn(ctx({ verdict: "incorrect", misconception: "multiplied", previous: { hintLevel: 1, misconception: "multiplied", sameMisconceptionCount: 1 } as any }));
    assert.equal(again.state, "MODEL", "the same misconception twice: show an analogous example instead of repeating");
    const last = decideTurn(ctx({ verdict: "incorrect", attempts: 4, previous: { hintLevel: 4 } as any }));
    assert.equal(last.state, "EXPLAIN");
    assert.equal(last.revealAllowed, true, "not trapped in endless questioning");
  });

  test("4. asking for the answer in Learn mode: not before a genuine attempt", () => {
    assert.equal(asksForAnswer("Just give me the answer, my exam is in 5 minutes"), true);
    assert.equal(asksForAnswer("Mbwira igisubizo"), true);
    const early = decideTurn(ctx({ askedForAnswer: true, attempts: 0 }));
    assert.equal(early.state, "HINT");
    assert.equal(early.revealAllowed, false);
    const earned = decideTurn(ctx({ askedForAnswer: true, attempts: 2 }));
    assert.equal(earned.revealAllowed, true);
  });

  test("5. Explain mode: direct explanation is allowed and labelled", () => {
    const p = decideTurn(ctx({ mode: "explain", attempts: 0, newProblem: true }));
    assert.equal(p.state, "EXPLAIN");
    assert.equal(p.revealAllowed, true);
    assert.equal(decideTurn(ctx({ mode: "explain", action: "verify" })).presentItem, "verify", "independent practice still works in Explain mode");
  });

  test("6. needs a prerequisite: teach it, at the conceptual level", () => {
    const p = decideTurn(ctx({ action: "stuck", stuck: "concept" }));
    assert.equal(p.state, "EXPLAIN");
    assert.equal(p.hintLevel, 2);
    assert.equal(decideTurn(ctx({ action: "stuck", stuck: "start", newProblem: true })).state, "DIAGNOSE");
  });

  test("7. a correct guess without reasoning is not counted until justified", () => {
    assert.equal(isUnexplained("3 A"), true);
    assert.equal(isUnexplained("I = V/R = 9/3 = 3 A"), false);
    const p = decideTurn(ctx({ verdict: "correct", unexplained: true }));
    assert.equal(p.state, "GUIDE");
    const r = update(emptyRecord("ee.ohms_law"), { kind: "verify", verdict: "correct", hintsUsed: 0, unexplained: true, misconception: null, at: T0 });
    assert.ok(r.alpha - 1 <= 0.2, "a bare answer adds little evidence");
  });

  test("8. guided success but a failed unseen problem: no mastery, and the estimate drops", () => {
    let r = emptyRecord("calc.product_rule");
    r = update(r, { kind: "guided", verdict: "correct", hintsUsed: 3, unexplained: false, misconception: null, at: T0 });
    r = update(r, { kind: "practice", verdict: "correct", hintsUsed: 1, unexplained: false, misconception: null, at: T0 + 3600e3 });
    const before = estimate(r).mean;
    r = update(r, { kind: "verify", verdict: "incorrect", hintsUsed: 0, unexplained: false, misconception: "product_of_derivatives", at: T0 + 7200e3 });
    assert.equal(isMastered(r), false);
    assert.ok(estimate(r).mean < before);
    assert.equal(r.misconceptions.product_of_derivatives, 1);
    assert.equal(r.next_review_at, new Date(T0 + 7200e3 + DAY).toISOString(), "review again tomorrow");
  });

  test("9. returning after several days: delayed independent success is what earns mastery", () => {
    let r = emptyRecord("ee.ohms_law");
    for (let i = 0; i < 3; i++) r = update(r, { kind: "verify", verdict: "correct", hintsUsed: 0, unexplained: false, misconception: null, at: T0 + i * 3600e3 });
    assert.equal(isMastered(r), false, "same-day successes are not retention");
    assert.equal(decideTurn(ctx({ action: "review" })).presentItem, "review");
    r = update(r, { kind: "review", verdict: "correct", hintsUsed: 0, unexplained: false, misconception: null, at: T0 + 4 * DAY });
    assert.equal(r.delayed_correct, 1);
    assert.equal(isMastered(r), true);
    assert.equal(r.status, "mastered");
    r = update(r, { kind: "review", verdict: "incorrect", hintsUsed: 0, unexplained: false, misconception: null, at: T0 + 30 * DAY });
    r = update(r, { kind: "review", verdict: "incorrect", hintsUsed: 0, unexplained: false, misconception: null, at: T0 + 31 * DAY });
    assert.equal(isMastered(r), false, "mastery is downgraded by new evidence");
  });

  test("10. an uncertain or wrong model evaluation is not trusted", () => {
    const wrong = parseAssessment({ verdict: "correct", reasoning: "valid", misconception: null, confidence: 0.9, prerequisiteGap: null, objective: "ee.ohms_law" }, OBJECTIVE_IDS)!;
    const r = reconcile("incorrect", "multiplied", wrong, "affirmation");
    assert.equal(r.verdict, "incorrect", "the server's check wins");
    assert.equal(r.contradiction, true);
    const unsure = parseAssessment({ verdict: "incorrect", reasoning: "unclear", misconception: "sign error?", confidence: 0.3, prerequisiteGap: null, objective: "made-up" }, OBJECTIVE_IDS)!;
    assert.equal(unsure.objective, "other");
    const u = reconcile("unknown", null, unsure, "redirect");
    assert.equal(u.trustDiagnosis, false);
    assert.equal(u.misconception, null, "a guess is not recorded as a misconception");
    assert.equal(parseAssessment({ verdict: "maybe" }, OBJECTIVE_IDS), null, "invalid output is rejected");
  });
});

describe("hint ladder", () => {
  test("not a counter: evidence picks the level", () => {
    assert.equal(selectHintLevel(ctx({ action: "hint", previous: { hintLevel: null } as any })), 1);
    assert.equal(selectHintLevel(ctx({ action: "stuck", stuck: "step", previous: { hintLevel: 0 } as any })), 3);
    assert.equal(selectHintLevel(ctx({ misconception: "x", previous: { hintLevel: 1, sameMisconceptionCount: 1 } as any })), 4);
    assert.ok(selectHintLevel(ctx({ action: "hint", previous: { hintLevel: 3 } as any })) <= 3, "the hint button never reaches the full solution");
  });
  test("a new problem starts with diagnosis", () => {
    assert.equal(decideTurn(ctx({ newProblem: true, attempts: 0 })).state, "DIAGNOSE");
  });
});

describe("assessment bank", () => {
  test("every template marks its own reference answer correct, across many seeds", () => {
    for (const t of TEMPLATES) for (let seed = 1; seed <= 40; seed++) {
      const item = t.generate(seed);
      assert.equal(markItem(item, `My answer: ${item.answer}`).verdict, "correct", `${t.id} seed ${seed}: ${item.question} -> ${item.answer}`);
    }
  });
  test("every objective with a template generates unseen variants", () => {
    for (const id of new Set(TEMPLATES.map(t => t.objective))) {
      const qs = new Set(Array.from({ length: 20 }, (_, i) => generateItem(id, 1000 + i)!.question));
      assert.ok(qs.size >= 3, `${id} has only ${qs.size} distinct questions`);
    }
  });
  test("'unseen' is about the question: different seeds giving the same text count as seen", async () => {
    const { questionKey } = await import("../functions/_shared/engine/bank.ts");
    const a = generateItem("calc.product_rule", 1)!, same = { ...a, seed: 999 };
    assert.equal(questionKey(a.question), questionKey(same.question));
    const texts = new Set(Array.from({ length: 200 }, (_, i) => generateItem("calc.product_rule", i)!.question));
    assert.ok(texts.size >= 40, `product rule has ${texts.size} distinct questions`);
  });

  test("misconceptions are recognised from the wrong answer they produce", () => {
    const ohm = TEMPLATES.find(t => t.id === "ee.ohm")!.generate(7);
    const [V, R] = ohm.question.match(/[\d.]+(?= V| Ω)/g)!.map(Number);
    assert.equal(markItem(ohm, `I = ${V * R} A`).misconception, "multiplied");
    const bin = TEMPLATES.find(t => t.id === "logic.bin2dec")!.generate(9);
    const bits = /([01]{8})/.exec(bin.question)![1];
    assert.equal(markItem(bin, String(parseInt([...bits].reverse().join(""), 2))).misconception, "reversed_bits");
    const lin = TEMPLATES.find(t => t.id === "linear.ax_plus_b")!.generate(3);
    assert.equal(markItem(lin, "I don't know").verdict, "unreadable");
  });
  test("symbolic and Boolean answers are checked by evaluation, not string matching", () => {
    assert.equal(equivalent("x(2 sin x + x cos x)", "2x·sin(x) + x²·cos(x)"), true);
    assert.equal(equivalent("2x cos x", "2x sin x + x^2 cos x"), false);
    assert.equal(booleanEquivalent("(AB)'", "A' + B'"), true);
    assert.equal(booleanEquivalent("(AB)'", "A'B'"), false);
  });
});
