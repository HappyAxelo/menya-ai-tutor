// HTTP API: authentication, authorization, webhooks, institutions.
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { freshDb, createUser, rpc } from "./db.ts";
import { pgRepo } from "./pgRepo.ts";
import { handleApi, DbError, parseRosterCsv, type ApiContext } from "../functions/_shared/api.ts";
import { testBillingProvider, signTestWebhook } from "../functions/_shared/billing.ts";

const SECRET = "test-secret-test-secret-test-secret-123";
let db: PGlite;
let ctx: ApiContext;
const deleted: string[] = [];
const emails = new Map<string, string>();

before(async () => {
  db = await freshDb();
  ctx = {
    repo: pgRepo(db),
    db: {
      async rpc(fn, args) {
        try { return await rpc(db, fn, args); }
        catch (err: any) { throw new DbError(err.message, err.code); }
      },
    },
    providers: {},
    billing: testBillingProvider(SECRET),
    async getUser(jwt) { const id = jwt.replace(/^tok_/, ""); return emails.has(id) ? { id, email: emails.get(id)! } : null; },
    async deleteUser(id) { deleted.push(id); },
    appUrl: "https://app.test",
    allowedOrigins: ["https://app.test"],
    log: () => {},
  };
});

async function user(email = `${randomUUID().slice(0, 8)}@uni.test`) {
  const id = await createUser(db, email);
  emails.set(id, email);
  return { id, email, token: `tok_${id}` };
}

function call(method: string, path: string, opts: { token?: string; body?: unknown; headers?: Record<string, string>; raw?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json", ...(opts.headers ?? {}) };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  return handleApi(new Request(`https://x.supabase.co/functions/v1/api${path}`, {
    method, headers, body: opts.raw ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body)),
  }), ctx);
}

const iso = (days: number) => new Date(Date.now() + days * 864e5).toISOString();

describe("authentication", () => {
  test("protected routes reject missing or invalid tokens", async () => {
    for (const path of ["/tutor", "/admin/economics", "/org/dashboard?org=" + randomUUID(), "/account/export"]) {
      const method = path === "/tutor" ? "POST" : "GET";
      assert.equal((await call(method, path)).status, 401, path);
      assert.equal((await call(method, path, { token: "tok_forged" })).status, 401, path);
    }
  });

  test("public routes work without a token", async () => {
    assert.equal((await call("GET", "/health")).status, 200);
    const plans = await (await call("GET", "/plans")).json();
    assert.deepEqual(plans.plans.map((p: any) => p.id), ["free", "pro", "professional"]);
    assert.equal(plans.plans[2].monthly_premium_limit, 190, "allowance shown after safety margin");
  });
});

describe("admin endpoints", () => {
  test("reject non-admins on every route, allow platform admins", async () => {
    const learner = await user();
    for (const [m, p] of [["GET", "/admin/economics"], ["GET", "/admin/alerts"], ["GET", "/admin/users"], ["GET", "/admin/config"],
                          ["GET", "/admin/export"], ["POST", "/admin/grant"], ["POST", "/admin/plan"], ["POST", "/admin/model"], ["POST", "/admin/org"]]) {
      assert.equal((await call(m, p, { token: learner.token, body: m === "POST" ? {} : undefined })).status, 403, p);
    }
    const admin = await user();
    await db.query("update public.profiles set platform_role = 'admin' where id = $1", [admin.id]);
    const econ = await call("GET", "/admin/economics", { token: admin.token });
    assert.equal(econ.status, 200);
    const csv = await (await call("GET", "/admin/export", { token: admin.token })).text();
    assert.match(csv.split("\n")[0], /^plan_id,paying_subscriptions/);
  });

  test("admin plan changes are validated and audited", async () => {
    const admin = await user();
    await db.query("update public.profiles set platform_role = 'admin' where id = $1", [admin.id]);
    assert.equal((await call("POST", "/admin/plan", { token: admin.token, body: { plan: "free", changes: { rank: 99 } } })).status, 400);
    assert.equal((await call("POST", "/admin/plan", { token: admin.token, body: { plan: "free", changes: { daily_request_limit: 25 } } })).status, 200);
    const p = await db.query<any>("select daily_request_limit from public.plans where id = 'free'");
    assert.equal(p.rows[0].daily_request_limit, 25);
    const a = await db.query<any>("select action from public.audit_logs where actor_id = $1", [admin.id]);
    assert.deepEqual(a.rows.map(r => r.action), ["admin.update_plan"]);
    await db.query("update public.plans set daily_request_limit = 20 where id = 'free'");
  });
});

describe("billing webhooks", () => {
  const event = (userId: string, id = `evt_${randomUUID()}`) => JSON.stringify({ id, type: "subscription.created", occurred_at: new Date().toISOString(),
    subscription: { provider_subscription_id: `sub_${userId}`, user_id: userId, plan_id: "pro", status: "active", current_period_end: iso(30) } });
  const planOf = async (u: string) => (await db.query<any>("select plan_id from public.resolve_entitlement($1)", [u])).rows[0].plan_id;

  test("unsigned, wrongly signed, or stale webhooks cannot grant a subscription", async () => {
    const u = await user();
    const raw = event(u.id);
    assert.equal((await call("POST", "/billing/webhook", { raw })).status, 401);
    assert.equal((await call("POST", "/billing/webhook", { raw, headers: { "menya-signature": await signTestWebhook("wrong-secret-wrong-secret-wrong-secret", raw) } })).status, 401);
    const old = await signTestWebhook(SECRET, raw, Math.floor(Date.now() / 1000) - 3600);
    assert.equal((await call("POST", "/billing/webhook", { raw, headers: { "menya-signature": old } })).status, 401);
    const tampered = await signTestWebhook(SECRET, raw);
    assert.equal((await call("POST", "/billing/webhook", { raw: raw.replace('"pro"', '"professional"'), headers: { "menya-signature": tampered } })).status, 401);
    assert.equal(await planOf(u.id), "free");
  });

  test("a valid webhook grants the plan; a replay does nothing", async () => {
    const u = await user();
    const raw = event(u.id, "evt_once");
    const sig = await signTestWebhook(SECRET, raw);
    const first = await (await call("POST", "/billing/webhook", { raw, headers: { "menya-signature": sig } })).json();
    const again = await (await call("POST", "/billing/webhook", { raw, headers: { "menya-signature": sig } })).json();
    assert.deepEqual([first.result, again.result], ["processed", "duplicate"]);
    assert.equal(await planOf(u.id), "pro");
  });

  test("checkout without a live provider says so instead of pretending", async () => {
    const u = await user();
    const saved = ctx.billing;
    ctx.billing = null;
    const r = await call("POST", "/billing/checkout", { token: u.token, body: { plan: "pro" } });
    ctx.billing = saved;
    assert.equal(r.status, 501);
    assert.equal((await r.json()).error, "billing_not_configured");
  });
});

describe("institutions", () => {
  async function org(name: string, seats = 2) {
    const r = await db.query<any>("insert into public.organizations (name, slug, plan_id, purchased_seats) values ($1, $2, 'pro', $3) returning id",
      [name, `${name.toLowerCase().replace(/\W+/g, "-")}-${randomUUID().slice(0, 6)}`, seats]);
    return r.rows[0].id as string;
  }

  test("an org admin cannot read or change another organization", async () => {
    const orgA = await org("Alpha"), orgB = await org("Beta");
    const adminA = await user();
    await db.query("insert into public.org_members (org_id, user_id, role) values ($1, $2, 'org_admin')", [orgA, adminA.id]);
    const learnerB = await user();
    await db.query("insert into public.org_members (org_id, user_id) values ($1, $2)", [orgB, learnerB.id]);
    assert.equal((await call("GET", `/org/dashboard?org=${orgA}`, { token: adminA.token })).status, 200);
    assert.equal((await call("GET", `/org/dashboard?org=${orgB}`, { token: adminA.token })).status, 403);
    assert.equal((await call("GET", `/org/roster?org=${orgB}`, { token: adminA.token })).status, 403);
    assert.equal((await call("POST", "/org/invite", { token: adminA.token, body: { org: orgB, emails: ["x@y.test"] } })).status, 403);
    assert.equal((await call("POST", "/org/seat", { token: adminA.token, body: { org: orgB, user: learnerB.id, assigned: false } })).status, 403);
    assert.equal((await call("GET", `/org/dashboard?org=${orgA}`, { token: learnerB.token })).status, 403, "learners can't see dashboards");
  });

  test("invite → accept by the invited email only; seats are capped", async () => {
    const o = await org("Gamma", 1);
    const admin = await user();
    await db.query("insert into public.org_members (org_id, user_id, role, seat_assigned) values ($1, $2, 'org_admin', false)", [o, admin.id]);
    const alice = await user("alice@gamma.test"), bob = await user("bob@gamma.test"), mallory = await user();
    const inv = await (await call("POST", "/org/invite", { token: admin.token, body: { org: o, csv: "name,email\nAlice,alice@gamma.test\nBob,BOB@gamma.test\nbad,not-an-email" } })).json();
    assert.deepEqual(inv.invited.map((i: any) => i.email), ["alice@gamma.test", "bob@gamma.test"]);
    const token = (e: string) => new URL(inv.invited.find((i: any) => i.email === e).link).searchParams.get("invite");

    assert.equal((await call("POST", "/org/accept", { token: mallory.token, body: { token: token("alice@gamma.test") } })).status, 403);
    const a = await (await call("POST", "/org/accept", { token: alice.token, body: { token: token("alice@gamma.test") } })).json();
    const b = await (await call("POST", "/org/accept", { token: bob.token, body: { token: token("bob@gamma.test") } })).json();
    assert.deepEqual([a.seat_assigned, b.seat_assigned], [true, false], "only one purchased seat");
    assert.equal((await call("POST", "/org/accept", { token: alice.token, body: { token: token("alice@gamma.test") } })).status, 400, "single use");
    const seat = await call("POST", "/org/seat", { token: admin.token, body: { org: o, user: bob.id, assigned: true } });
    assert.equal((await seat.json()).error, "no_seats_available");
    const stored = await db.query<any>("select token_hash from public.org_invitations where email = 'alice@gamma.test'");
    assert.notEqual(stored.rows[0].token_hash, token("alice@gamma.test"), "only the token hash is stored");
  });

  test("roster CSV parsing", () => {
    assert.deepEqual(parseRosterCsv("a@x.io\nA@x.io\nb@y.io,Bob\n\nnope"), ["a@x.io", "b@y.io"]);
  });
});

describe("account and public endpoints", () => {
  test("data export contains only the caller's data; account deletion is audited", async () => {
    const u = await user(), other = await user();
    await db.query("insert into public.tutoring_sessions (user_id, title) values ($1, 'mine'), ($2, 'theirs')", [u.id, other.id]);
    const data = await (await call("GET", "/account/export", { token: u.token })).json();
    assert.deepEqual(data.sessions.map((s: any) => s.title), ["mine"]);
    assert.equal((await call("DELETE", "/account", { token: u.token })).status, 200);
    assert.ok(deleted.includes(u.id));
  });

  test("quote requests are validated and throttled", async () => {
    const q = { institution: "University of Rwanda", contact_name: "Dr. Test", contact_email: "dean@ur.test", learners: 1200 };
    assert.equal((await call("POST", "/quote", { body: { ...q, contact_email: "nope" } })).status, 400);
    for (let i = 0; i < 3; i++) assert.equal((await call("POST", "/quote", { body: q })).status, 200);
    assert.equal((await call("POST", "/quote", { body: q })).status, 429);
  });

  test("CORS headers only for allowed origins; errors are generic", async () => {
    const ok = await call("GET", "/health", { headers: { origin: "https://app.test" } });
    const bad = await call("GET", "/health", { headers: { origin: "https://evil.test" } });
    assert.equal(ok.headers.get("access-control-allow-origin"), "https://app.test");
    assert.equal(bad.headers.get("access-control-allow-origin"), null);

    const u = await user();
    const saved = ctx.repo.resolveEntitlement;
    ctx.repo.resolveEntitlement = async () => { throw new Error("connection string postgres://admin:hunter2@db"); };
    const r = await call("POST", "/tutor", { token: u.token, body: { requestId: randomUUID(), message: "hi" } });
    ctx.repo.resolveEntitlement = saved;
    assert.equal(r.status, 500);
    assert.doesNotMatch(await r.text(), /hunter2|postgres:\/\//);
  });
});
