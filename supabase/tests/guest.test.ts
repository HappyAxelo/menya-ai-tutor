// Guest access: limits from the guest plan, what a guest can't reach, and moving a guest's learning to an
// account. Real database rules and the real tutor pipeline; the AI model is scripted.
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { freshDb, createUser, rpc, asUser } from "./db.ts";
import { pgRepo } from "./pgRepo.ts";
import { handleApi, DbError, type ApiContext, type AuthUser } from "../functions/_shared/api.ts";
import type { ModelProvider } from "../functions/_shared/providers.ts";

let db: PGlite, ctx: ApiContext;
const sessions = new Map<string, AuthUser>();
const provider: ModelProvider = {
  name: "groq",
  async chat() {
    return { text: JSON.stringify({ language: "English", message: "What do you already know about this?", type: "question", conceptsDetected: ["x"],
      misconceptionDetected: null, hintLevel: null, progressSummary: null, solved: false, finalAnswer: "", difficulty: "basic" }), inputTokens: 1, outputTokens: 1, latencyMs: 1, ttftMs: null };
  },
  async health() { return { ok: true }; },
};
before(async () => {
  db = await freshDb();
  ctx = {
    repo: pgRepo(db),
    db: { async rpc(fn, args) { try { return await rpc(db, fn, args); } catch (err: any) { throw new DbError(err.message, err.code); } } },
    providers: { groq: provider }, billing: null,
    async getUser(jwt) { return sessions.get(jwt) ?? null; },
    async deleteUser(id) { await db.query("delete from auth.users where id = $1", [id]); },
    appUrl: "https://app.test", allowedOrigins: ["https://app.test"], log: () => {},
  };
});
async function guest() {
  const id = randomUUID();
  await db.query("insert into auth.users (id, email, is_anonymous) values ($1, null, true)", [id]);
  const token = `guest_${id}`;
  sessions.set(token, { id, email: null, isGuest: true });
  return { id, token };
}
async function account(provider_ = "google") {
  const email = `${randomUUID().slice(0, 8)}@uni.test`;
  const id = await createUser(db, email);
  await db.query("insert into auth.identities (user_id, provider) values ($1, $2)", [id, provider_]);
  const token = `user_${id}`;
  sessions.set(token, { id, email });
  return { id, token };
}
const call = async (method: string, path: string, token?: string, body?: unknown) => {
  const res = await handleApi(new Request(`https://x.supabase.co/functions/v1/api${path}`, { method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body) }), ctx);
  return { status: res.status, body: await res.json().catch(() => null) as any };
};
const ask = (token: string, sessionId?: unknown, message = "Why does a ball fall?") =>
  call("POST", "/tutor", token, { requestId: randomUUID(), action: "message", message, ...(sessionId ? { sessionId } : {}) });
const count = async (sql: string, ...args: unknown[]) => (await db.query<any>(sql, args)).rows[0].n;

describe("guest sessions", () => {
  test("a guest gets real tutoring on the guest plan, with the allowance enforced by the server", async () => {
    const g = await guest();
    const e = (await db.query<any>("select * from public.resolve_entitlement($1)", [g.id])).rows[0];
    assert.deepEqual([e.plan_id, e.daily_request_limit, e.monthly_request_limit, e.routing_policy], ["guest", 5, 5, "free"]);

    let sessionId: unknown;
    for (let i = 0; i < 5; i++) {
      const r = await ask(g.token, sessionId);
      assert.equal(r.status, 200, `message ${i + 1}`);
      assert.equal(r.body.reply.message, "What do you already know about this?");
      sessionId = r.body.sessionId;
      assert.equal(r.body.quota.daily_remaining, 4 - i);
    }
    const sixth = await ask(g.token, sessionId);
    assert.equal(sixth.status, 429);
    assert.equal(sixth.body.error, "guest_limit");
    assert.equal(await count("select count(*)::int as n from public.usage_records where user_id = $1 and status = 'success'", g.id), 5);
    assert.ok((await db.query<any>("select limit_reached_at from public.guest_sessions where guest_id = $1", [g.id])).rows[0].limit_reached_at);
    await db.query("delete from public.rate_buckets");   // a minute later
    // Asking again in the same session doesn't reset it.
    assert.equal((await ask(g.token)).body.error, "guest_limit");
  });

  test("limits change in one place", async () => {
    await db.query("update public.plans set daily_request_limit = 1, monthly_request_limit = 1 where id = 'guest'");
    try {
      const g = await guest();
      assert.equal((await ask(g.token)).status, 200);
      assert.equal((await ask(g.token)).body.error, "guest_limit");
    } finally { await db.query("update public.plans set daily_request_limit = 5, monthly_request_limit = 5 where id = 'guest'"); }
  });

  test("the guest plan isn't for sale or listed, and guests don't count as learners", async () => {
    const { plans } = (await call("GET", "/plans")).body;
    assert.ok(!plans.some((p: any) => p.id === "guest"));
    const admin = await account();
    await db.query("update public.profiles set platform_role = 'admin' where id = $1", [admin.id]);
    const before = (await call("GET", "/admin/overview", admin.token)).body.users_total;
    await guest();
    assert.equal((await call("GET", "/admin/overview", admin.token)).body.users_total, before);
    assert.ok(!(await call("GET", "/admin/users?q=", admin.token)).body.users.some((u: any) => u.email === null));
  });

  test("a guest can only reach tutoring: everything else needs an account", async () => {
    const g = await guest();
    for (const [m, p] of [["GET", "/learn/state"], ["POST", "/exam/start"], ["GET", "/materials"], ["POST", "/materials"], ["POST", "/billing/checkout"],
                          ["GET", "/billing/history"], ["GET", "/account/export"], ["POST", "/media/transcribe"], ["POST", "/media/read-image"],
                          ["GET", "/admin/overview"], ["GET", "/admin/auth"], ["POST", "/guest/claim"], ["POST", "/org/accept"], ["POST", "/learn/profile"]]) {
      const r = await call(m, p, g.token, m === "POST" ? {} : undefined);
      assert.equal(r.status, 403, `${m} ${p}`);
      assert.equal(r.body.error, "account_required", `${m} ${p}`);
    }
    const attach = await call("POST", "/tutor", g.token, { requestId: randomUUID(), action: "message", message: "see file",
      attachments: [{ name: "a.txt", kind: "text", text: "hello" }] });
    assert.equal(attach.status, 403);
  });

  test("a guest can't read anyone else's conversation", async () => {
    const owner = await account();
    const theirs = (await ask(owner.token)).body.sessionId;
    const g = await guest();
    assert.equal((await ask(g.token, theirs)).status, 404, "through the API");
    const rows = await asUser(db, g.id, async () => (await db.query("select id from public.tutoring_sessions")).rows);
    assert.equal(rows.length, 0, "through direct database access");
  });

  test("a total daily guest cap protects shared AI capacity, without touching accounts", async () => {
    await db.query("update public.app_settings set value = '0' where key = 'guest_total_daily_messages'");
    try {
      const g = await guest(), a = await account();
      const r = await ask(g.token);
      assert.equal(r.status, 429);
      assert.equal(r.body.error, "guest_capacity");
      assert.equal((await ask(a.token)).status, 200);
    } finally { await db.query("update public.app_settings set value = '500' where key = 'guest_total_daily_messages'"); }
  });

  test("a guest can delete their own session and everything in it", async () => {
    const g = await guest();
    await ask(g.token);
    assert.equal((await call("DELETE", "/account", g.token)).status, 200);
    assert.equal(await count("select count(*)::int as n from public.tutoring_sessions where user_id = $1", g.id), 0);
  });

  test("only unused guest sessions past their expiry are deleted, never accounts", async () => {
    const old = await guest(), fresh = await guest(), real = await account();
    await db.query("update public.profiles set created_at = now() - interval '40 days' where id = any($1)", [[old.id, real.id]]);
    assert.ok(await rpc<number>(db, "purge_old_guests", {}) >= 1);
    const exists = (id: string) => count("select count(*)::int as n from auth.users where id = $1", id);
    assert.equal(await exists(old.id), 0);
    assert.equal(await exists(fresh.id), 1);
    assert.equal(await exists(real.id), 1);
    assert.equal(await count("select count(*)::int as n from public.guest_sessions where guest_id = $1", old.id), 1, "the anonymous count stays");
  });
});

describe("guest to account", () => {
  async function guestWithWork() {
    const g = await guest();
    const first = await ask(g.token);
    await db.query("insert into public.learner_objectives (user_id, objective_id, independent_correct) values ($1, 'ee.ohms_law', 2)", [g.id]);
    await db.query("insert into public.assessment_attempts (user_id, objective_id, kind, verdict) values ($1, 'ee.ohms_law', 'verify', 'correct')", [g.id]);
    await db.query("insert into public.usage_counters (subject_type, subject_id, period, period_start, requests) values ('user', $1, 'month', date_trunc('month', now() at time zone 'utc')::date, 99) on conflict do nothing", [g.id]);
    const { ticket } = (await call("POST", "/guest/claim-ticket", g.token)).body;
    return { ...g, ticket, sessionId: first.body.sessionId };
  }

  test("a new account keeps the guest's conversation and progress, and the guest session is gone", async () => {
    const g = await guestWithWork(), a = await account();
    const r = await call("POST", "/guest/claim", a.token, { ticket: g.ticket });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { status: "claimed", conversations: 1 });
    const rows = await asUser(db, a.id, async () => (await db.query<any>("select id from public.tutoring_sessions")).rows);
    assert.deepEqual(rows.map(x => x.id), [g.sessionId], "the account can read it");
    assert.equal(await count("select count(*)::int as n from public.tutoring_messages where session_id = $1 and user_id = $2", g.sessionId, a.id), 2);
    assert.equal(await count("select count(*)::int as n from public.assessment_attempts where user_id = $1", a.id), 1);
    assert.equal(await count("select independent_correct as n from public.learner_objectives where user_id = $1", a.id), 2);
    assert.equal(await count("select count(*)::int as n from auth.users where id = $1", g.id), 0);
    assert.equal((await ask(a.token, g.sessionId, "and then?")).status, 200, "the conversation carries on");
    const counter = await db.query<any>("select requests from public.usage_counters where subject_id = $1 and period = 'month'", [a.id]);
    assert.ok(counter.rows[0].requests < 99, "the guest's usage isn't charged to the account");
  });

  test("a ticket works once, can't be guessed, and an expired one gives nothing", async () => {
    const g = await guestWithWork(), a = await account(), b = await account();
    assert.equal((await call("POST", "/guest/claim", b.token, { ticket: "x".repeat(32) })).body.status, "expired");
    assert.equal((await call("POST", "/guest/claim", a.token, { ticket: g.ticket })).body.status, "claimed");
    assert.equal((await call("POST", "/guest/claim", b.token, { ticket: g.ticket })).body.status, "already_claimed", "not claimable by an unrelated account");
    assert.equal(await count("select count(*)::int as n from public.tutoring_sessions where user_id = $1", b.id), 0);

    const late = await guestWithWork(), c = await account();
    await db.query("update public.guest_claims set expires_at = now() - interval '1 minute' where guest_id = $1", [late.id]);
    assert.equal((await call("POST", "/guest/claim", c.token, { ticket: late.ticket })).body.status, "expired");
    assert.equal(await count("select count(*)::int as n from public.tutoring_sessions where user_id = $1", c.id), 0);
    // Only the ticket's hash is stored.
    assert.equal(await count("select count(*)::int as n from public.guest_claims where ticket_hash = $1", late.ticket), 0);
  });

  test("an existing account is asked first, and its own data is never overwritten", async () => {
    const a = await account();
    await ask(a.token, undefined, "my own question");
    await db.query("insert into public.learner_objectives (user_id, objective_id, independent_correct) values ($1, 'ee.ohms_law', 7)", [a.id]);
    await call("POST", "/learn/profile", a.token, { education_level: "university", programme: "Mine" });
    const g = await guestWithWork();
    await db.query("insert into public.learner_profiles (user_id, programme) values ($1, 'Guest programme')", [g.id]);

    const asked = await call("POST", "/guest/claim", a.token, { ticket: g.ticket });
    assert.deepEqual(asked.body, { status: "needs_consent", conversations: 1 });
    assert.equal(await count("select count(*)::int as n from public.tutoring_sessions where user_id = $1", a.id), 1, "nothing moved yet");

    assert.equal((await call("POST", "/guest/claim", a.token, { ticket: g.ticket, consent: true })).body.status, "claimed");
    assert.equal(await count("select count(*)::int as n from public.tutoring_sessions where user_id = $1", a.id), 2);
    assert.equal(await count("select independent_correct as n from public.learner_objectives where user_id = $1", a.id), 7, "the account's level stays");
    assert.equal((await db.query<any>("select programme from public.learner_profiles where user_id = $1", [a.id])).rows[0].programme, "Mine");
  });

  test("converting transfers no plan or payment, and existing plans stay", async () => {
    const a = await account();
    await rpc(db, "process_payment_event", { p_provider: "test", p_raw: {}, p_event: { id: randomUUID(), type: "subscription.created",
      subscription: { provider_subscription_id: randomUUID(), user_id: a.id, plan_id: "pro", status: "active", current_period_end: new Date(Date.now() + 9e8).toISOString() } } });
    const g = await guestWithWork();
    await call("POST", "/guest/claim", a.token, { ticket: g.ticket });
    assert.equal((await db.query<any>("select plan_id from public.resolve_entitlement($1)", [a.id])).rows[0].plan_id, "pro");
    const fresh = await guestWithWork(), n = await account();
    await call("POST", "/guest/claim", n.token, { ticket: fresh.ticket });
    assert.equal((await db.query<any>("select plan_id from public.resolve_entitlement($1)", [n.id])).rows[0].plan_id, "free", "a new account is on Free");
  });

  test("a guest can't claim, and a ticket can't be issued to an account", async () => {
    const a = await account(), g = await guestWithWork(), other = await guest();
    assert.equal((await call("POST", "/guest/claim-ticket", a.token)).body.error, "not_a_guest");
    assert.equal((await call("POST", "/guest/claim", other.token, { ticket: g.ticket })).status, 403);
    assert.equal((await call("POST", "/guest/claim", a.token, { ticket: "short" })).status, 400);
  });
});

describe("sign-up numbers", () => {
  test("administrators only, from real records, and guests are sessions rather than people", async () => {
    const learner = await account();
    assert.equal((await call("GET", "/admin/auth", learner.token)).status, 403);
    const admin = await account();
    await db.query("update public.profiles set platform_role = 'admin' where id = $1", [admin.id]);
    const get = async () => (await call("GET", "/admin/auth", admin.token)).body;
    const before = await get();
    const g = await guestWithWorkForNumbers();
    const email = await account("email");
    await call("POST", "/guest/claim", email.token, { ticket: g.ticket });
    const abandoned = await guestWithWorkForNumbers();
    await db.query("update public.guest_sessions set signup_started_at = now() - interval '2 days' where guest_id = $1", [abandoned.id]);
    const after = await get();
    assert.equal(after.guest_sessions - before.guest_sessions, 2);
    assert.equal(after.converted - before.converted, 1);
    assert.equal(after.abandoned_signup - before.abandoned_signup, 1);
    assert.equal(after.registrations.today - before.registrations.today, 1);
    assert.equal((after.by_provider.email ?? 0) - (before.by_provider.email ?? 0), 1);
    assert.ok(after.guest_messages - before.guest_messages >= 2);
    assert.equal(after.trend.length, 30);
    assert.equal((await call("GET", "/admin/auth?from=2026-13-99&to=x", admin.token)).status, 400);
  });
  async function guestWithWorkForNumbers() {
    const g = await guest();
    await ask(g.token);
    const { ticket } = (await call("POST", "/guest/claim-ticket", g.token)).body;
    return { ...g, ticket };
  }
});
