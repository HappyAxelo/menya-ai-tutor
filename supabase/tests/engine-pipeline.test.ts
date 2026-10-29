// The tutoring engine inside the real pipeline: scripted model, real database rules.
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { freshDb, createUser } from "./db.ts";
import { pgRepo } from "./pgRepo.ts";
import { handleTutor } from "../functions/_shared/tutorService.ts";
import type { ChatRequest, ModelProvider } from "../functions/_shared/providers.ts";
import { questionKey } from "../functions/_shared/engine/bank.ts";

let db: PGlite;
before(async () => { db = await freshDb(); });

const assessment = (over: Record<string, unknown> = {}) => ({
  verdict: "not_an_attempt", reasoning: "none", misconception: null, confidence: 0.9, prerequisiteGap: null, objective: "ee.ohms_law", ...over });
const reply = (over: Record<string, unknown> = {}) => JSON.stringify({
  language: "English", message: "Which law links voltage, current and resistance?", type: "question", conceptsDetected: ["Ohm's law"],
  misconceptionDetected: null, hintLevel: null, progressSummary: null, solved: false, finalAnswer: "3 A", difficulty: "basic",
  assessment: assessment(), ...over });

// A model that echoes whatever the engine asked it to present, and otherwise follows a script.
function model(script: (req: ChatRequest, last: string) => string) {
  const calls: ChatRequest[] = [];
  const provider: ModelProvider = {
    name: "groq",
    async chat(_c, req) {
      calls.push(req);
      const last = String(req.messages.at(-1)!.content);
      if (last.startsWith("[PRESENT PROBLEM]")) {
        const question = last.split("\n\n").slice(1).join("\n\n");
        return { text: reply({ message: `Practice problem\n\n${question}\n\nShow your working.`, assessment: assessment() }), inputTokens: 1, outputTokens: 1, latencyMs: 1, ttftMs: null };
      }
      return { text: script(req, last), inputTokens: 1, outputTokens: 1, latencyMs: 1, ttftMs: null };
    },
    async health() { return { ok: true }; },
  };
  return { provider, calls, notes: () => calls.map(c => c.messages.map(m => String(m.content)).find(t => t.startsWith("[TUTOR ENGINE]")) ?? "") };
}

const deps = (p: ModelProvider) => ({ repo: pgRepo(db), providers: { groq: p }, sleep: async () => {} });
const ask = (message: string, extra: Record<string, unknown> = {}) => ({ requestId: randomUUID(), action: "message", message, ...extra });
const act = (action: string, extra: Record<string, unknown> = {}) => ({ requestId: randomUUID(), action, ...extra });
const item = async (sessionId: string) => (await db.query<any>("select * from public.session_items where session_id = $1", [sessionId])).rows[0];

// Start a conversation the model classifies as Ohm's law, then ask for a bank problem.
async function ohmPractice(u: string, m: ReturnType<typeof model>, kind = "practice") {
  const first = await handleTutor(deps(m.provider), u, ask("Can you help me with Ohm's law?"));
  const sessionId = first.body.sessionId as string;
  const res = await handleTutor(deps(m.provider), u, act(kind, { sessionId }));
  const it = (await item(sessionId)).item;
  const [V, R] = it.question.match(/[\d.]+(?= V| Ω)/g).map(Number);
  return { sessionId, res, it, V, R };
}

describe("tutoring engine in the pipeline", () => {
  test("a new problem starts in DIAGNOSE and the engine note reaches the model", async () => {
    const u = await createUser(db);
    const m = model(() => reply());
    const res = await handleTutor(deps(m.provider), u, ask("A 12 V battery is across a 4 Ω resistor. What is the current?"));
    assert.equal((res.body.engine as any).state, "DIAGNOSE");
    assert.match(m.notes()[0], /Teaching move: DIAGNOSE/);
    assert.equal((res.body.reply as any).assessment, undefined, "internal assessment never reaches the browser");
  });

  test("practice serves an unseen bank problem; its answer key stays private", async () => {
    const u = await createUser(db);
    const m = model(() => reply());
    const { res, it, V, R } = await ohmPractice(u, m);
    assert.equal((res.body.engine as any).item.kind, "practice");
    assert.match((res.body.reply as any).message, new RegExp(`${V} V`));
    assert.doesNotMatch(JSON.stringify(res.body), new RegExp(it.answer.replace(".", "\\.")), "the answer key is not in the response");
    const served = (await db.query<any>("select * from public.served_items where user_id = $1", [u])).rows;
    assert.equal(served.length, 1);
    assert.equal(served[0].seed, questionKey(it.question), "recorded by question text");
  });

  test("a misconception is diagnosed from the answer; a wrong 'correct' from the model is overruled", async () => {
    const u = await createUser(db);
    const m = model((_req, last) => last.startsWith("[SECOND LOOK]")
      ? reply({ type: "redirect", message: "Not quite: check whether you should multiply or divide here." })
      : reply({ type: "affirmation", solved: true, message: "Correct!" }));      // the model wrongly agrees
    const { sessionId, V, R } = await ohmPractice(u, m);
    const res = await handleTutor(deps(m.provider), u, ask(`I = V × R = ${V * R} A`, { sessionId }));
    const engine = res.body.engine as any;
    assert.equal(engine.verified, "incorrect");
    assert.equal(engine.state, "HINT");
    assert.equal((res.body.reply as any).type, "redirect");
    assert.equal((res.body.problem as any).solved, false);
    assert.match(m.notes().at(-1)!, /NOT correct.*multiplied V by R/s);
    const attempt = (await db.query<any>("select * from public.assessment_attempts where user_id = $1", [u])).rows[0];
    assert.equal(attempt.misconception, "multiplied");
    assert.equal(attempt.kind, "practice");
  });

  test("the same misconception twice changes the approach (MODEL)", async () => {
    const u = await createUser(db);
    const m = model(() => reply({ type: "redirect", message: "Check the operation." }));
    const { sessionId, V, R } = await ohmPractice(u, m);
    await handleTutor(deps(m.provider), u, ask(`${V * R} A`, { sessionId }));
    const again = await handleTutor(deps(m.provider), u, ask(`it's ${V * R} A`, { sessionId }));
    assert.equal((again.body.engine as any).state, "MODEL");
    assert.match(m.notes().at(-1)!, /Teaching move: MODEL/);
  });

  test("a correct answer with working solves the item and updates the learning profile", async () => {
    const u = await createUser(db);
    const m = model(() => reply({ type: "affirmation", solved: true, message: "Yes: I = V/R." }));
    const { sessionId, V, R } = await ohmPractice(u, m, "verify");
    const res = await handleTutor(deps(m.provider), u, ask(`I = V/R = ${V}/${R} = ${V / R} A`, { sessionId }));
    assert.equal((res.body.problem as any).solved, true);
    assert.equal((res.body.engine as any).verified, "correct");
    assert.equal(await item(sessionId), undefined, "the solved item is cleared");
    const profile = (await db.query<any>("select * from public.learner_objectives where user_id = $1", [u])).rows[0];
    assert.equal(profile.objective_id, "ee.ohms_law");
    assert.equal(profile.independent_correct, 1);
    assert.ok(profile.next_review_at, "a review is scheduled");
  });

  test("a bare correct answer is not counted until the student explains it", async () => {
    const u = await createUser(db);
    const m = model(() => reply({ type: "question", message: "How did you get that?" }));
    const { sessionId, V, R } = await ohmPractice(u, m);
    const res = await handleTutor(deps(m.provider), u, ask(`${V / R} A`, { sessionId }));
    assert.equal((res.body.engine as any).state, "GUIDE");
    assert.equal((res.body.problem as any).solved, false);
    assert.match(m.notes().at(-1)!, /no reasoning/);
  });

  test("Explain mode allows a full worked solution and is stored; Learn mode would have rewritten it", async () => {
    const u = await createUser(db);
    const m = model(() => reply({ type: "worked_solution", message: "I = V/R = 12 V / 4 Ω = 3 A.", finalAnswer: "3 A" }));
    const res = await handleTutor(deps(m.provider), u, ask("Current for 12 V across 4 Ω?", { mode: "explain" }));
    assert.equal((res.body.engine as any).state, "EXPLAIN");
    assert.match((res.body.reply as any).message, /= 3 A/, "not rewritten in Explain mode");
    assert.equal(m.calls.length, 1);
    const s = (await db.query<any>("select mode from public.tutoring_sessions where id = $1", [res.body.sessionId])).rows[0];
    assert.equal(s.mode, "explain");
    const learn = await handleTutor(deps(m.provider), u, ask("Current for 12 V across 4 Ω?"));
    assert.doesNotMatch((learn.body.reply as any).message, /= 3 A/, "Learn mode guards the answer");
  });

  test("'I'm stuck: I don't understand the idea' teaches the prerequisite", async () => {
    const u = await createUser(db);
    const m = model(() => reply({ type: "explanation" }));
    const first = await handleTutor(deps(m.provider), u, ask("12 V across 4 Ω, current?"));
    const res = await handleTutor(deps(m.provider), u, act("stuck", { sessionId: first.body.sessionId, stuck: "concept" }));
    assert.equal((res.body.engine as any).state, "EXPLAIN");
    assert.match(m.notes().at(-1)!, /Help level 2 of 5: Conceptual hint/);
    assert.equal((await handleTutor(deps(m.provider), u, act("stuck", { sessionId: first.body.sessionId, stuck: "nonsense" }))).status, 400);
  });

  test("review without a conversation starts one on the most overdue objective", async () => {
    const u = await createUser(db);
    await db.query(`insert into public.learner_objectives (user_id, objective_id, next_review_at) values ($1, 'logic.binary_to_decimal', now() - interval '1 day')`, [u]);
    const m = model(() => reply());
    const res = await handleTutor(deps(m.provider), u, act("review"));
    assert.equal(res.status, 200);
    assert.equal((res.body.engine as any).state, "REVIEW");
    assert.equal((res.body.engine as any).objective.id, "logic.binary_to_decimal");
    assert.match((await item(res.body.sessionId as string)).item.question, /binary number [01]{8}/);
  });

  test("a malformed assessment from the model is ignored safely", async () => {
    const u = await createUser(db);
    const m = model(() => reply({ assessment: { verdict: "probably", objective: "made-up", confidence: "high" } }));
    const res = await handleTutor(deps(m.provider), u, ask("What is 2 + 2?"));
    assert.equal(res.status, 200);
    assert.equal((res.body.engine as any).objective, null);
  });
});
