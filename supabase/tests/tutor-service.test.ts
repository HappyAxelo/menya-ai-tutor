// Tutor pipeline: real database rules underneath, scripted model providers on top.
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { freshDb, createUser, rpc } from "./db.ts";
import { pgRepo } from "./pgRepo.ts";
import { handleTutor } from "../functions/_shared/tutorService.ts";
import { ProviderError, type ModelProvider, type ChatRequest, type ModelConfig } from "../functions/_shared/providers.ts";
import { matchesAnswer, revealsAnswer } from "../functions/_shared/answerGuard.ts";
import { classifyDifficulty, planRoute } from "../functions/_shared/router.ts";

let db: PGlite;
before(async () => { db = await freshDb(); });

function reply(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    language: "English", message: "What do you already know about this circuit?", type: "question",
    conceptsDetected: ["Ohm's law"], misconceptionDetected: null, hintLevel: null, progressSummary: null,
    solved: false, finalAnswer: "3 A", difficulty: "basic", ...overrides,
  });
}

type Script = (config: ModelConfig, req: ChatRequest) => string | Error;
function fakeProvider(name: string, script: Script) {
  const calls: { model: string; req: ChatRequest }[] = [];
  const provider: ModelProvider = {
    name,
    async chat(config, req) {
      calls.push({ model: config.model, req });
      const out = script(config, req);
      if (out instanceof Error) throw out;
      return { text: out, inputTokens: 1000, outputTokens: 200, latencyMs: 12, ttftMs: null };
    },
    async health() { return { ok: true }; },
  };
  return { provider, calls };
}

const noSleep = async () => {};
const ask = (message: string, extra: Record<string, unknown> = {}) => ({ requestId: randomUUID(), action: "message", message, ...extra });

async function subscribe(userId: string, plan: string) {
  await rpc(db, "process_payment_event", { p_provider: "test", p_raw: {}, p_event: { id: randomUUID(), type: "subscription.created",
    subscription: { provider_subscription_id: randomUUID(), user_id: userId, plan_id: plan, status: "active",
      current_period_end: new Date(Date.now() + 30 * 864e5).toISOString() } } });
}

const usage = async (userId: string) => (await db.query<any>("select * from public.usage_records where user_id = $1 order by id", [userId])).rows;

describe("tutor pipeline", () => {
  test("existing tutoring still works end to end: reply, session, history, usage and cost", async () => {
    const u = await createUser(db);
    const groq = fakeProvider("groq", () => reply());
    const res = await handleTutor({ repo: pgRepo(db), providers: { groq: groq.provider }, sleep: noSleep }, u,
      ask("A 12 V battery is across a 4 Ω resistor. What is the current?"));
    assert.equal(res.status, 200);
    assert.equal((res.body.reply as any).message, "What do you already know about this circuit?");
    assert.equal((res.body.reply as any).finalAnswer, undefined, "private answer never reaches the browser");
    assert.equal(groq.calls[0].model, "openai/gpt-oss-120b", "free plan uses the medium model");
    const rows = await usage(u);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, "success");
    assert.equal(Number(rows[0].est_cost_usd), (1000 * 0.15 + 200 * 0.60) / 1e6);
    const msgs = await db.query<any>("select role, meta from public.tutoring_messages where session_id = $1 order by id", [res.body.sessionId]);
    assert.deepEqual(msgs.rows.map(m => m.role), ["user", "assistant"]);
    assert.equal(JSON.stringify(msgs.rows[1].meta).includes("3 A"), false, "stored meta has no private answer");
  });

  test("a Free user cannot reach Pro/Professional models by editing the request", async () => {
    const u = await createUser(db);
    const groq = fakeProvider("groq", () => reply());
    const anthropic = fakeProvider("anthropic", () => reply());
    const res = await handleTutor({ repo: pgRepo(db), providers: { groq: groq.provider, anthropic: anthropic.provider }, sleep: noSleep }, u,
      ask("Prove that the derivative of the integral equals the integrand for a matrix-valued function with eigenvalues…",
        { plan: "professional", model: "claude-opus-5-5", role: "premium", premium: true }));
    assert.equal(res.status, 200);
    assert.equal(anthropic.calls.length, 0);
    assert.equal(groq.calls[0].model, "openai/gpt-oss-120b");
  });

  test("Pro routes complex questions to the strong model; Professional to premium within allowance", async () => {
    const pro = await createUser(db), prof = await createUser(db);
    await subscribe(pro, "pro"); await subscribe(prof, "professional");
    const groq = fakeProvider("groq", () => reply({ difficulty: "complex" }));
    const anthropic = fakeProvider("anthropic", () => reply({ difficulty: "complex" }));
    const deps = { repo: pgRepo(db), providers: { groq: groq.provider, anthropic: anthropic.provider }, sleep: noSleep };
    const hard = "Prove by induction that the recurrence T(n) = 2T(n/2) + n has complexity O(n log n), deriving each step.";
    await handleTutor(deps, pro, ask(hard));
    assert.equal(groq.calls.at(-1)!.model, "openai/gpt-oss-120b");
    const r = await handleTutor(deps, prof, ask(hard));
    assert.equal(anthropic.calls.length, 1);
    assert.equal(r.body.advancedReasoning, true);
    const easy = await handleTutor(deps, prof, ask("hi"));
    assert.equal(easy.body.advancedReasoning, false, "routine tutoring does not spend premium");
    const rows = await usage(prof);
    assert.deepEqual(rows.map(x => x.premium), [true, false]);
  });

  test("an exhausted premium allowance falls back to the strong model with an accurate quota", async () => {
    const u = await createUser(db);
    await subscribe(u, "professional");
    const month = new Date(); const ms = `${month.getUTCFullYear()}-${String(month.getUTCMonth() + 1).padStart(2, "0")}-01`;
    await db.query("insert into public.usage_counters values ('user', $1, 'month', $2, 190, 190)", [u, ms]);
    const groq = fakeProvider("groq", () => reply());
    const anthropic = fakeProvider("anthropic", () => reply());
    const res = await handleTutor({ repo: pgRepo(db), providers: { groq: groq.provider, anthropic: anthropic.provider }, sleep: noSleep }, u,
      ask("Prove by induction that the recurrence T(n) = 2T(n/2) + n has complexity O(n log n), deriving each step."));
    assert.equal(res.status, 200);
    assert.equal(anthropic.calls.length, 0);
    assert.equal(res.body.advancedReasoning, false);
    assert.equal((res.body.quota as any).premium_remaining, 0);
  });

  test("provider failure falls back without leaking secrets; total failure refunds the quota", async () => {
    const u = await createUser(db);
    let n = 0;
    // Local model first (enabled for this test), falling back to the hosted one.
    await db.query("update public.model_configs set enabled = true, provider = 'groq', model = 'local-test' where role = 'local_small'");
    const flaky = fakeProvider("groq", (config) => (config.model === "local-test" ? new ProviderError("unavailable", "groq", 503) : (n++, reply())));
    const ok = await handleTutor({ repo: pgRepo(db), providers: { groq: flaky.provider }, sleep: noSleep }, u, ask("help"));
    await db.query("update public.model_configs set enabled = false, provider = 'openai_compatible', model = 'qwen3:4b' where role = 'local_small'");
    assert.equal(ok.status, 200);
    assert.deepEqual(flaky.calls.map(c => c.model), ["local-test", "local-test", "openai/gpt-oss-120b"]);
    assert.equal((await usage(u)).at(-1).fallback_used, true);

    const v = await createUser(db);
    const down = fakeProvider("groq", () => new ProviderError("timeout", "groq"));
    const res = await handleTutor({ repo: pgRepo(db), providers: { groq: down.provider }, sleep: noSleep }, v, ask("help"));
    assert.equal(res.status, 503);
    assert.doesNotMatch(JSON.stringify(res.body), /gsk_|sk-ant|api[_-]?key|Bearer/i);
    const day = await db.query<any>("select requests from public.usage_counters where subject_id = $1 and period = 'day'", [v]);
    assert.equal(day.rows[0].requests, 0, "failed request not counted");
    assert.equal((await usage(v))[0].status, "timeout");
  });

  test("a reply that reveals the answer is rewritten; if it still leaks a safe message is sent", async () => {
    const u = await createUser(db);
    let call = 0;
    const leaky = fakeProvider("groq", () => (++call === 1
      ? reply({ type: "hint", hintLevel: 3, message: "f'(x) = (2x)·sin(x) + x²·cos(x). Now compute one term.", finalAnswer: "2x·sin(x) + x²·cos(x)", language: "French" })
      : reply({ type: "hint", hintLevel: 3, message: "f'(x) = u'·sin(x) + x²·v'. Que valent u' et v' ?", language: "French" })));
    const fixed = await handleTutor({ repo: pgRepo(db), providers: { groq: leaky.provider }, sleep: noSleep }, u, ask("Dérivée de x²·sin(x) ?"));
    assert.match((fixed.body.reply as any).message, /u'·sin\(x\)/);
    assert.equal((await usage(u)).at(-1).answer_rewrite, true);

    const stubborn = fakeProvider("groq", () => reply({ message: "So I = 12/4 = 3 A.", finalAnswer: "3 A" }));
    const res = await handleTutor({ repo: pgRepo(db), providers: { groq: stubborn.provider }, sleep: noSleep }, u, ask("current for 12 V and 4 Ω?"));
    assert.doesNotMatch((res.body.reply as any).message, /3 A/);
  });

  test("the guard remembers the answer when the model stops reporting it", async () => {
    const u = await createUser(db);
    let call = 0;
    const groq = fakeProvider("groq", () => {
      call++;
      if (call === 1) return reply({ message: "Which rule applies to a product?", finalAnswer: "2x·sin(x) + x²·cos(x)" });
      if (call === 2) return reply({ type: "hint", message: "The derivative is (2x)·sin(x) + x²·cos(x).", finalAnswer: "" });
      return reply({ type: "hint", message: "f'(x) = u'·sin(x) + x²·v'. What are u' and v'?", finalAnswer: "" });
    });
    const deps = { repo: pgRepo(db), providers: { groq: groq.provider }, sleep: noSleep };
    const first = await handleTutor(deps, u, ask("Derivative of x² sin x?"));
    const hint = await handleTutor(deps, u, { requestId: randomUUID(), action: "hint", sessionId: first.body.sessionId });
    assert.doesNotMatch((hint.body.reply as any).message, /cos\(x\)\./);
    assert.equal(call, 3, "the leaking reply was rewritten");
    const stored = await db.query<any>("select final_answer from public.tutoring_session_answers where session_id = $1", [first.body.sessionId]);
    assert.equal(stored.rows[0].final_answer, "2x·sin(x) + x²·cos(x)");
    await asUserCheck(u);
  });

  async function asUserCheck(userId: string) {
    const { asUser } = await import("./db.ts");
    await asUser(db, userId, async () => {
      await assert.rejects(db.query("select * from public.tutoring_session_answers"), /permission denied/);
    });
  }

  test("hints: the server picks the level and stops after 3", async () => {
    const u = await createUser(db);
    const groq = fakeProvider("groq", () => reply({ type: "hint" }));
    const deps = { repo: pgRepo(db), providers: { groq: groq.provider }, sleep: noSleep };
    const first = await handleTutor(deps, u, ask("Derivative of x^2 sin x?"));
    const sessionId = first.body.sessionId as string;
    for (const level of [1, 2, 3]) {
      const r = await handleTutor(deps, u, { requestId: randomUUID(), action: "hint", sessionId, level: 99 });
      assert.equal(r.status, 200);
      assert.match(groq.calls.at(-1)!.req.messages.at(-1)!.content, new RegExp(`Level ${level} of 3`));
    }
    const fourth = await handleTutor(deps, u, { requestId: randomUUID(), action: "hint", sessionId });
    assert.equal(fourth.body.error, "hint_limit");
  });

  test("learner actions need an existing problem and send the right instruction", async () => {
    const u = await createUser(db);
    const groq = fakeProvider("groq", () => reply({ type: "explanation" }));
    const deps = { repo: pgRepo(db), providers: { groq: groq.provider }, sleep: noSleep };
    const orphan = await handleTutor(deps, u, { requestId: randomUUID(), action: "example" });
    assert.equal(orphan.status, 400);
    assert.equal(orphan.body.error, "action_needs_session");
    const bogus = await handleTutor(deps, u, { requestId: randomUUID(), action: "solve_it_for_me", sessionId: randomUUID() });
    assert.equal(bogus.body.error, "invalid_action");
    const first = await handleTutor(deps, u, ask("A 12 V battery is across a 4 Ω resistor. What is the current?"));
    const sessionId = first.body.sessionId as string;
    const expected: Record<string, RegExp> = { simpler: /EXPLAIN MORE SIMPLY/, example: /WORKED EXAMPLE/, summary: /\[SUMMARY\]/ };
    for (const [action, re] of Object.entries(expected)) {
      const r = await handleTutor(deps, u, { requestId: randomUUID(), action, sessionId });
      assert.equal(r.status, 200, action);
      assert.match(groq.calls.at(-1)!.req.messages.at(-1)!.content, re);
    }
    const noAnswer = await handleTutor(deps, u, { requestId: randomUUID(), action: "check", sessionId, message: "  " });
    assert.equal(noAnswer.body.error, "empty_message");
    const msgs = await db.query<any>("select meta from public.tutoring_messages where session_id = $1 and role = 'user' order by id", [sessionId]);
    assert.deepEqual(msgs.rows.map(m => m.meta.control ?? null), [null, "simpler", "example", "summary"]);
  });

  test("progress: a solve counts only when the student's own answer matches the verified answer", async () => {
    const u = await createUser(db);
    let claim = true;
    const groq = fakeProvider("groq", () => reply({ type: "affirmation", solved: claim, progressSummary: "Current = voltage / resistance." }));
    const deps = { repo: pgRepo(db), providers: { groq: groq.provider }, sleep: noSleep };
    const first = await handleTutor(deps, u, ask("A 12 V battery is across a 4 Ω resistor. What is the current?"));
    const sessionId = first.body.sessionId as string;
    // The model claims "solved" but the student's text has the wrong value: not counted.
    const wrong = await handleTutor(deps, u, { requestId: randomUUID(), action: "check", sessionId, message: "48 A" });
    assert.equal((wrong.body.reply as any).solved, false);
    // Right value (unit optional), but the model says not solved: not counted either.
    claim = false;
    const unclaimed = await handleTutor(deps, u, ask("I think it's 3", { sessionId }));
    assert.equal((unclaimed.body.reply as any).solved, false);
    claim = true;
    const right = await handleTutor(deps, u, ask("So I = 12/4 = 3 A", { sessionId }));
    assert.equal((right.body.reply as any).solved, true);
    assert.deepEqual(right.body.problem, { solved: true, practice: false, attempts: 3 });
    // Saying it again does not count twice.
    await handleTutor(deps, u, ask("3 A, right?", { sessionId }));
    // A practice question after a solve is a fresh, unsolved problem.
    claim = false;
    const next = await handleTutor(deps, u, { requestId: randomUUID(), action: "practice", sessionId });
    assert.deepEqual(next.body.problem, { solved: false, practice: true, attempts: 0 });
    const events = (await db.query<any>("select kind, attempts, hints_used from public.learning_events where user_id = $1", [u])).rows;
    assert.deepEqual(events, [{ kind: "problem_solved", attempts: 3, hints_used: 0 }]);
  });

  test("practice: a new question resets hints and the remembered answer; solving it counts as practice", async () => {
    const u = await createUser(db);
    let answer = "3 A", type = "hint", solved = false;
    const groq = fakeProvider("groq", () => reply({ type, finalAnswer: answer, solved }));
    const deps = { repo: pgRepo(db), providers: { groq: groq.provider }, sleep: noSleep };
    const first = await handleTutor(deps, u, ask("A 12 V battery is across a 4 Ω resistor. What is the current?"));
    const sessionId = first.body.sessionId as string;
    await handleTutor(deps, u, { requestId: randomUUID(), action: "hint", sessionId });
    answer = "2 A"; type = "question";
    const p = await handleTutor(deps, u, { requestId: randomUUID(), action: "practice", sessionId });
    assert.equal(p.body.hintsUsed, 0);
    assert.deepEqual(p.body.problem, { solved: false, practice: true, attempts: 0 });
    // The old answer (3 A) no longer counts; the practice answer does.
    type = "affirmation"; solved = true;
    const stale = await handleTutor(deps, u, ask("3 A", { sessionId }));
    assert.equal((stale.body.reply as any).solved, false);
    const ok = await handleTutor(deps, u, ask("I = 10 V / 5 Ω = 2 A", { sessionId }));
    assert.equal((ok.body.reply as any).solved, true);
    const events = (await db.query<any>("select kind, hints_used from public.learning_events where user_id = $1", [u])).rows;
    assert.deepEqual(events, [{ kind: "practice_solved", hints_used: 0 }]);
  });

  test("progress: a solve after a worked example is recorded as solved with help", async () => {
    const u = await createUser(db);
    let type = "explanation", solved = false;
    const groq = fakeProvider("groq", () => reply({ type, solved, message: "Example: 9 V across 2 Ω gives 4.5 A. Now try yours." }));
    const deps = { repo: pgRepo(db), providers: { groq: groq.provider }, sleep: noSleep };
    const first = await handleTutor(deps, u, ask("A 12 V battery is across a 4 Ω resistor. What is the current?"));
    const sessionId = first.body.sessionId as string;
    await handleTutor(deps, u, { requestId: randomUUID(), action: "example", sessionId });
    type = "affirmation"; solved = true;
    await handleTutor(deps, u, ask("12/4 = 3 A", { sessionId }));
    const events = (await db.query<any>("select hints_used, examples_used from public.learning_events where user_id = $1", [u])).rows;
    assert.deepEqual(events, [{ hints_used: 0, examples_used: 1 }]);
  });

  test("worked solution: rewritten before effort, allowed after two genuine attempts", async () => {
    const u = await createUser(db);
    const groq = fakeProvider("groq", (_c, req) => {
      const last = req.messages.at(-1)!.content;
      return last.startsWith("[REWRITE]")
        ? reply({ type: "question", message: "Which formula links voltage, current and resistance?" })
        : reply({ type: "worked_solution", message: "I = V/R = 12 V / 4 Ω = 3 A." });
    });
    const deps = { repo: pgRepo(db), providers: { groq: groq.provider }, sleep: noSleep };
    const first = await handleTutor(deps, u, ask("A 12 V battery is across a 4 Ω resistor. What is the current?"));
    assert.equal((first.body.reply as any).type, "question", "no worked solution on the first message");
    const sessionId = first.body.sessionId as string;
    const a1 = await handleTutor(deps, u, ask("Is it 48 A?", { sessionId }));
    assert.equal((a1.body.reply as any).type, "question", "one attempt is not enough");
    const a2 = await handleTutor(deps, u, ask("Maybe 16 A? Please show me the solution.", { sessionId }));
    assert.equal((a2.body.reply as any).type, "worked_solution");
    assert.match(groq.calls.at(-1)!.req.messages.at(-2)!.content, /student attempts so far 2/);
  });

  test("time budget: a hanging provider gets a clean 503 inside the budget, quota released, usage recorded", async () => {
    const u = await createUser(db);
    let clock = 0;
    const timeouts: number[] = [];
    // Simulates a provider that never answers: each call uses its whole timeout.
    const hanging: ModelProvider = {
      name: "groq",
      async chat(config) { timeouts.push(config.timeout_ms); clock += config.timeout_ms; throw new ProviderError("timeout", "groq"); },
      async health() { return { ok: true }; },
    };
    const deps = { repo: pgRepo(db), providers: { groq: hanging }, sleep: async (ms: number) => { clock += ms; }, now: () => clock };
    const res = await handleTutor(deps, u, ask("A 12 V battery is across a 4 Ω resistor. What is the current?"));
    assert.equal(res.status, 503);
    assert.equal(res.body.error, "tutor_unavailable");
    assert.ok(clock <= 50_000, `all model calls fit the 50 s budget (used ${clock} ms)`);
    assert.ok(timeouts.every(t => t <= 45_000) && timeouts.length >= 1, `each call capped: ${timeouts}`);
    const rows = await usage(u);
    assert.equal(rows.at(-1).status, "timeout", "the failure is recorded");
    const counters = await db.query<any>("select coalesce(sum(requests),0)::int as n from public.usage_counters where subject_type = 'user' and subject_id = $1", [u]);
    assert.equal(counters.rows[0].n, 0, "the student's quota is given back");
  });

  test("time budget: slow strong model on Pro does not run past the budget", async () => {
    const u = await createUser(db);
    await subscribe(u, "pro");
    let clock = 0;
    const slow: ModelProvider = {
      name: "groq",
      async chat(config) { clock += config.timeout_ms; throw new ProviderError("timeout", "groq"); },
      async health() { return { ok: true }; },
    };
    const deps = { repo: pgRepo(db), providers: { groq: slow }, sleep: async (ms: number) => { clock += ms; }, now: () => clock };
    const res = await handleTutor(deps, u, ask("Prove by induction that the recurrence T(n) = 2T(n/2) + n has complexity O(n log n), deriving each step."));
    assert.equal(res.status, 503);
    assert.ok(clock <= 50_000, `strong + fallback stay inside the budget (used ${clock} ms)`);
  });

  test("time budget: no time left for a rewrite sends the safe message instead of a leak", async () => {
    const u = await createUser(db);
    let clock = 0;
    const groq = fakeProvider("groq", () => { clock += 47_000; return reply({ type: "hint", message: "So I = 12/4 = 3 A." }); });
    const deps = { repo: pgRepo(db), providers: { groq: groq.provider }, sleep: noSleep, now: () => clock };
    const first = await handleTutor(deps, u, ask("A 12 V battery is across a 4 Ω resistor. What is the current?"));
    assert.equal(groq.calls.length, 1, "no rewrite call started without time for it");
    assert.equal((first.body.reply as any).message.includes("3 A"), false, "the answer is still not revealed");
  });

  test("provider rate limit: the student is told how long to wait, and the message is not counted", async () => {
    const u = await createUser(db);
    const groq = fakeProvider("groq", () => new ProviderError("rate_limited", "groq", 429, 42_000));
    const res = await handleTutor({ repo: pgRepo(db), providers: { groq: groq.provider }, sleep: noSleep }, u, ask("What is 2 + 2?"));
    assert.equal(res.status, 503);
    assert.equal(res.body.error, "tutor_busy");
    assert.equal(res.body.retry_after_seconds, 42);
    assert.match(String(res.body.message), /about 42 seconds/);
    assert.match(String(res.body.message), /not counted/);
  });

  test("a user cannot continue another user's session", async () => {
    const a = await createUser(db), b = await createUser(db);
    const groq = fakeProvider("groq", () => reply());
    const deps = { repo: pgRepo(db), providers: { groq: groq.provider }, sleep: noSleep };
    const r = await handleTutor(deps, a, ask("hello"));
    const hijack = await handleTutor(deps, b, ask("continue", { sessionId: r.body.sessionId }));
    assert.equal(hijack.status, 404);
  });

  test("quota exhaustion returns a clear message and an upgrade path", async () => {
    const u = await createUser(db);
    await db.query("insert into public.usage_counters values ('user', $1, 'day', (now() at time zone 'utc')::date, 20, 0)", [u]);
    const groq = fakeProvider("groq", () => reply());
    const res = await handleTutor({ repo: pgRepo(db), providers: { groq: groq.provider }, sleep: noSleep }, u, ask("hi"));
    assert.equal(res.status, 429);
    assert.equal(res.body.error, "daily_limit");
    assert.equal(res.body.upgrade_to, "pro");
    assert.equal(groq.calls.length, 0, "no model call when over quota");
  });

  test("learner level and reply style reach the model's instructions", async () => {
    const u = await createUser(db);
    const groq = fakeProvider("groq", () => reply());
    const deps = { repo: pgRepo(db), providers: { groq: groq.provider }, sleep: noSleep };
    await handleTutor(deps, u, ask("hi", { learnerLevel: "secondary", style: "concise" }));
    assert.match(groq.calls[0].req.system, /secondary-school student/);
    assert.match(groq.calls[0].req.system, /one or two sentences/);
    assert.equal((await handleTutor(deps, u, ask("hi", { learnerLevel: "phd" }))).body.error, "invalid_level");
    assert.equal((await handleTutor(deps, u, ask("hi", { style: "essay" }))).body.error, "invalid_style");
  });

  test("input validation", async () => {
    const u = await createUser(db);
    const deps = { repo: pgRepo(db), providers: {}, sleep: noSleep };
    assert.equal((await handleTutor(deps, u, { requestId: "nope", message: "x" })).body.error, "invalid_request_id");
    assert.equal((await handleTutor(deps, u, ask("x".repeat(5000)))).body.error, "message_too_long");
    assert.equal((await handleTutor(deps, u, ask("hi", { language: "<script>" }))).body.error, "invalid_language");
  });
});

describe("answer guard", () => {
  test("matchesAnswer: the student's own text must contain the verified answer", () => {
    assert.equal(matchesAnswer("I think it's 3", "3 A"), true, "unit optional");
    assert.equal(matchesAnswer("I = 12/4 = 3 A", "3 A"), true);
    assert.equal(matchesAnswer("13 A", "3 A"), false);
    assert.equal(matchesAnswer("-3", "3 A"), false);
    assert.equal(matchesAnswer("3.5 A", "3 A"), false);
    assert.equal(matchesAnswer("0,5 A", "0.5 A"), true);
    assert.equal(matchesAnswer("f'(x) = 2x sin(x) + x² cos(x)", "2x·sin(x) + x²·cos(x)"), true);
    assert.equal(matchesAnswer("f'(x) = 2x sin(x)", "2x·sin(x) + x²·cos(x)"), false);
    assert.equal(matchesAnswer("3", null), false);
  });

  test("detects symbolic and numeric leaks, allows confirming the student's own answer", () => {
    assert.equal(revealsAnswer("En remplaçant : f'(x)= (2x)·sin(x) + x²·cos(x).", "2x·sin(x) + x²·cos(x)"), true);
    assert.equal(revealsAnswer("f'(x) = u'·sin(x) + x²·v'. Que valent u' et v' ?", "2x·sin(x) + x²·cos(x)"), false);
    assert.equal(revealsAnswer("I = 12 V / 4 Ω = ?", "3 A"), false);
    assert.equal(revealsAnswer("So the current is 3 A.", "3 A"), true);
    assert.equal(revealsAnswer("20 N ÷ 5 kg = 4 m/s², not 100.", "4 m/s²"), true);
    assert.equal(revealsAnswer("Correct, the current is 3 A.", "3 A", ["I = 12/4 = 3 A"]), false);
    assert.equal(revealsAnswer("Ni byo! 60 km/h.", "60 km/h", ["Ni 240 km/h?"]), true);
  });

  test("sees through LaTeX formatting", () => {
    assert.equal(revealsAnswer(String.raw`So $f'(x) = 2x\sin(x) + x^2\cos(x)$.`, "2x·sin(x) + x²·cos(x)"), true);
    assert.equal(revealsAnswer(String.raw`$f'(x) = 2x \cdot \sin x + x^{2} \cdot \cos x$`, "2x·sin(x) + x²·cos(x)"), true);
    assert.equal(revealsAnswer(String.raw`$I = \frac{12}{4} = 3\,\text{A}$`, "3 A"), true);
    assert.equal(revealsAnswer(String.raw`$f'(x) = u'\sin(x) + x^2 v'$. What are $u'$ and $v'$?`, "2x·sin(x) + x²·cos(x)"), false);
  });

  test("the policy prompt has real backslashes, not control characters", async () => {
    const { buildSystemPrompt } = await import("../functions/_shared/policy.ts");
    const p = buildSystemPrompt({ privateFields: true });
    assert.ok(p.includes(String.raw`(\frac, \cdot, \( \))`));
    assert.doesNotMatch(p, /[\f\v\b]/);
  });
});

describe("router", () => {
  const cfg = (role: string, provider: string, premium = false, fallback: string | null = null, enabled = true) =>
    ({ role, provider, model: role, enabled, is_premium: premium, input_usd_per_mtok: 0, output_usd_per_mtok: 0, timeout_ms: 1000,
       max_output_tokens: 100, options: {}, fallback_role: fallback }) as ModelConfig;
  const configs = {
    small: cfg("small", "groq", false, "medium"), medium: cfg("medium", "groq"), strong: cfg("strong", "groq", false, "medium"),
    premium: cfg("premium", "anthropic", true, "strong"), local_small: cfg("local_small", "openai_compatible", false, "small", false),
  };
  const all = new Set(["groq", "anthropic", "openai_compatible"]);

  test("difficulty classification", () => {
    assert.equal(classifyDifficulty("hi"), "basic");
    assert.equal(classifyDifficulty("Prove that the integral of a continuous function is differentiable"), "complex");
    assert.equal(classifyDifficulty("ok", "complex"), "standard");
  });

  test("free never reaches strong or premium, even via fallbacks", () => {
    const r = planRoute({ policy: "free", difficulty: "complex", premiumRemaining: 99, configs, availableProviders: all });
    assert.deepEqual(r.map(c => c.role), ["medium"]);
  });

  test("local model is used first for free when enabled", () => {
    const withLocal = { ...configs, local_small: { ...configs.local_small, enabled: true } };
    const r = planRoute({ policy: "free", difficulty: "basic", premiumRemaining: 0, configs: withLocal, availableProviders: all });
    assert.deepEqual(r.map(c => c.role), ["local_small", "small", "medium"]);
  });

  test("professional uses premium only for complex work and only with allowance left", () => {
    const p = (difficulty: "basic" | "complex", premiumRemaining: number) =>
      planRoute({ policy: "professional", difficulty, premiumRemaining, configs, availableProviders: all }).map(c => c.role);
    assert.deepEqual(p("basic", 50), ["strong", "medium"]);
    assert.deepEqual(p("complex", 50), ["premium", "strong", "medium"]);
    assert.deepEqual(p("complex", 0), ["strong", "medium"]);
  });

  test("providers without credentials are skipped", () => {
    const r = planRoute({ policy: "professional", difficulty: "complex", premiumRemaining: 5, configs, availableProviders: new Set(["groq"]) });
    assert.deepEqual(r.map(c => c.role), ["strong", "medium"]);
  });
});
