// Business rules enforced by the database itself, tested on real Postgres.
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { freshDb, createUser, asUser, rpc, migrationSql } from "./db.ts";

let db: PGlite;
before(async () => { db = await freshDb(); });

const iso = (days: number) => new Date(Date.now() + days * 864e5).toISOString();

async function subscribe(userId: string, plan: string, status: string, periodEndDays = 30, extra: Record<string, unknown> = {}) {
  const subId = `sub_${randomUUID()}`;
  const result = await rpc(db, "process_payment_event", {
    p_provider: "test",
    p_event: { id: `evt_${randomUUID()}`, type: "subscription.updated", occurred_at: new Date().toISOString(),
      subscription: { provider_subscription_id: subId, user_id: userId, plan_id: plan, interval: "month",
        status, current_period_end: iso(periodEndDays), ...extra } },
    p_raw: {},
  });
  assert.equal(result, "processed");
  return subId;
}

async function plan(userId: string) {
  const r = await db.query<{ plan_id: string }>("select plan_id from public.resolve_entitlement($1)", [userId]);
  return r.rows[0].plan_id;
}

describe("entitlements", () => {
  test("a new user gets the Free plan", async () => {
    const u = await createUser(db);
    assert.equal(await plan(u), "free");
    const profile = await db.query("select platform_role from public.profiles where id = $1", [u]);
    assert.equal((profile.rows[0] as any).platform_role, "learner");
  });

  test("an active Pro subscription grants Pro; Professional grants Professional", async () => {
    const a = await createUser(db), b = await createUser(db);
    await subscribe(a, "pro", "active");
    await subscribe(b, "professional", "active");
    assert.equal(await plan(a), "pro");
    assert.equal(await plan(b), "professional");
  });

  test("billing states: trialing yes, past_due within grace yes, expired/refunded/incomplete no", async () => {
    const cases: [string, number, string][] = [
      ["trialing", 7, "pro"], ["past_due", -1, "pro"], ["past_due", -10, "free"],
      ["expired", 30, "free"], ["refunded", 30, "free"], ["incomplete", 30, "free"],
    ];
    for (const [status, endDays, expected] of cases) {
      const u = await createUser(db);
      await subscribe(u, "pro", status, endDays);
      assert.equal(await plan(u), expected, `${status} ending in ${endDays}d`);
    }
  });

  test("a canceled subscription keeps access only until the paid period ends", async () => {
    const stillPaid = await createUser(db), lapsed = await createUser(db);
    await subscribe(stillPaid, "pro", "canceled", 5);
    await subscribe(lapsed, "pro", "canceled", -1);
    assert.equal(await plan(stillPaid), "pro");
    assert.equal(await plan(lapsed), "free");
  });

  test("the browser cannot grant itself a plan (no write access to subscriptions/profiles)", async () => {
    const u = await createUser(db);
    await asUser(db, u, async () => {
      await assert.rejects(db.query(
        "insert into public.subscriptions (user_id, plan_id, status, provider, provider_subscription_id) values ($1, 'professional', 'active', 'x', 'y')", [u]));
      await assert.rejects(db.query("update public.profiles set platform_role = 'admin' where id = $1", [u]));
      await assert.rejects(db.query("select public.consume_quota($1, $2, true)", [u, randomUUID()]));
      await assert.rejects(db.query("update public.plans set daily_request_limit = 100000"));
    });
    assert.equal(await plan(u), "free");
  });
});

describe("quotas", () => {
  test("daily limit is enforced server-side and reports a clear reason", async () => {
    const u = await createUser(db);
    for (let i = 0; i < 6; i++) await db.query("delete from public.rate_buckets"); // isolate from rate limit
    const results = [];
    for (let i = 0; i < 21; i++) {
      await db.query("delete from public.rate_buckets where user_id = $1", [u]);
      results.push(await rpc(db, "consume_quota", { p_user: u, p_request_id: randomUUID(), p_premium: false }));
    }
    assert.equal(results.filter(r => r.allowed).length, 20);
    assert.deepEqual({ allowed: results[20].allowed, reason: results[20].reason }, { allowed: false, reason: "daily_limit" });
  });

  test("monthly limit is enforced", async () => {
    const u = await createUser(db);
    const month = new Date(); const monthStart = `${month.getUTCFullYear()}-${String(month.getUTCMonth() + 1).padStart(2, "0")}-01`;
    await db.query("insert into public.usage_counters values ('user', $1, 'month', $2, 300, 0)", [u, monthStart]);
    const r = await rpc(db, "consume_quota", { p_user: u, p_request_id: randomUUID(), p_premium: false });
    assert.equal(r.reason, "monthly_limit");
    const day = await db.query("select requests from public.usage_counters where subject_id = $1 and period = 'day'", [u]);
    assert.equal(day.rows.length ? (day.rows[0] as any).requests : 0, 0, "day counter rolled back with the failed month check");
  });

  test("concurrent requests cannot exceed the limit", async () => {
    const u = await createUser(db);
    await db.query("update public.plans set requests_per_minute = 1000 where id = 'free'");
    const results = await Promise.all(Array.from({ length: 40 }, () =>
      rpc(db, "consume_quota", { p_user: u, p_request_id: randomUUID(), p_premium: false })));
    await db.query("update public.plans set requests_per_minute = 6 where id = 'free'");
    assert.equal(results.filter(r => r.allowed).length, 20);
    const day = await db.query("select requests from public.usage_counters where subject_id = $1 and period = 'day'", [u]);
    assert.equal((day.rows[0] as any).requests, 20);
  });

  test("per-minute rate limit", async () => {
    const u = await createUser(db);
    const results = [];
    for (let i = 0; i < 7; i++) results.push(await rpc(db, "consume_quota", { p_user: u, p_request_id: randomUUID(), p_premium: false }));
    assert.equal(results[6].reason, "rate_limited");
  });

  test("the same request id is never charged twice", async () => {
    const u = await createUser(db);
    const id = randomUUID();
    const first = await rpc(db, "consume_quota", { p_user: u, p_request_id: id, p_premium: false });
    const again = await rpc(db, "consume_quota", { p_user: u, p_request_id: id, p_premium: false });
    assert.equal(first.allowed, true);
    assert.equal(again.reason, "duplicate_request");
  });

  test("a failed model call gives its quota back exactly once", async () => {
    const u = await createUser(db);
    const id = randomUUID();
    await rpc(db, "consume_quota", { p_user: u, p_request_id: id, p_premium: false });
    assert.equal(await rpc(db, "release_quota", { p_user: u, p_request_id: id }), true);
    assert.equal(await rpc(db, "release_quota", { p_user: u, p_request_id: id }), false);
    const day = await db.query("select requests from public.usage_counters where subject_id = $1 and period = 'day'", [u]);
    assert.equal((day.rows[0] as any).requests, 0);
  });
});

describe("premium allowance", () => {
  test("Free and Pro have no premium requests", async () => {
    const free = await createUser(db), pro = await createUser(db);
    await subscribe(pro, "pro", "active");
    for (const u of [free, pro]) {
      const r = await rpc(db, "consume_quota", { p_user: u, p_request_id: randomUUID(), p_premium: true });
      assert.equal(r.reason, "premium_not_included");
    }
  });

  test("Professional premium usage is tracked separately and capped at allowance minus safety margin", async () => {
    const u = await createUser(db);
    await subscribe(u, "professional", "active");
    await db.query("update public.plans set monthly_premium_limit = 5, premium_safety_margin = 2, requests_per_minute = 100 where id = 'professional'");
    const premium = [];
    for (let i = 0; i < 4; i++) premium.push(await rpc(db, "consume_quota", { p_user: u, p_request_id: randomUUID(), p_premium: true }));
    assert.deepEqual(premium.map(r => r.allowed), [true, true, true, false]);
    assert.equal(premium[3].reason, "premium_limit");
    assert.equal(premium[2].premium_remaining, 0);
    const normal = await rpc(db, "consume_quota", { p_user: u, p_request_id: randomUUID(), p_premium: false });
    assert.equal(normal.allowed, true, "ordinary tutoring continues after the premium allowance is used");
    const m = await db.query("select requests, premium_requests from public.usage_counters where subject_id = $1 and period = 'month'", [u]);
    assert.deepEqual(m.rows[0], { requests: 4, premium_requests: 3 });
    await db.query("update public.plans set monthly_premium_limit = 200, premium_safety_margin = 10, requests_per_minute = 30 where id = 'professional'");
  });
});

describe("billing events", () => {
  test("a replayed event is not applied twice", async () => {
    const u = await createUser(db);
    const event = { id: "evt_replay_1", type: "subscription.created", occurred_at: new Date().toISOString(),
      subscription: { provider_subscription_id: "sub_replay", user_id: u, plan_id: "pro", status: "active", current_period_end: iso(30) } };
    assert.equal(await rpc(db, "process_payment_event", { p_provider: "test", p_event: event, p_raw: {} }), "processed");
    assert.equal(await rpc(db, "process_payment_event", { p_provider: "test", p_event: event, p_raw: {} }), "duplicate");
    const subs = await db.query("select count(*)::int as n from public.subscriptions where provider_subscription_id = 'sub_replay'");
    assert.equal((subs.rows[0] as any).n, 1);
  });

  test("an older event arriving late does not undo a newer one", async () => {
    const u = await createUser(db);
    const base = { provider_subscription_id: "sub_order", user_id: u, plan_id: "pro", current_period_end: iso(30) };
    await rpc(db, "process_payment_event", { p_provider: "test", p_raw: {},
      p_event: { id: "evt_new", type: "subscription.canceled", occurred_at: iso(0), subscription: { ...base, status: "refunded" } } });
    const r = await rpc(db, "process_payment_event", { p_provider: "test", p_raw: {},
      p_event: { id: "evt_old", type: "subscription.created", occurred_at: iso(-1), subscription: { ...base, status: "active" } } });
    assert.equal(r, "stale");
    assert.equal(await plan(u), "free");
  });
});

describe("organizations", () => {
  async function makeOrg(name: string, plan = "pro") {
    const r = await db.query<{ id: string }>(
      "insert into public.organizations (name, slug, plan_id, purchased_seats) values ($1, $2, $3, 50) returning id",
      [name, name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), plan]);
    return r.rows[0].id;
  }

  test("a learner with an assigned seat in a pilot org gets the org plan; suspended orgs grant nothing", async () => {
    const org = await makeOrg("Pilot University");
    const u = await createUser(db);
    await db.query("insert into public.org_members (org_id, user_id) values ($1, $2)", [org, u]);
    assert.equal(await plan(u), "pro");
    await db.query("update public.organizations set status = 'suspended' where id = $1", [org]);
    assert.equal(await plan(u), "free");
  });

  test("an active org needs a live org subscription", async () => {
    const org = await makeOrg("Paid College");
    await db.query("update public.organizations set status = 'active' where id = $1", [org]);
    const u = await createUser(db);
    await db.query("insert into public.org_members (org_id, user_id) values ($1, $2)", [org, u]);
    assert.equal(await plan(u), "free");
    await rpc(db, "process_payment_event", { p_provider: "test", p_raw: {}, p_event: { id: `evt_${randomUUID()}`, type: "subscription.created",
      subscription: { provider_subscription_id: `org_${org}`, org_id: org, plan_id: "pro", status: "active", current_period_end: iso(30) } } });
    assert.equal(await plan(u), "pro");
  });

  test("org pool limit applies on top of learner limits", async () => {
    const org = await makeOrg("Small Pool School");
    await db.query("update public.organizations set monthly_request_limit = 2 where id = $1", [org]);
    const a = await createUser(db), b = await createUser(db);
    await db.query("insert into public.org_members (org_id, user_id) values ($1, $2), ($1, $3)", [org, a, b]);
    const r1 = await rpc(db, "consume_quota", { p_user: a, p_request_id: randomUUID(), p_premium: false });
    const r2 = await rpc(db, "consume_quota", { p_user: b, p_request_id: randomUUID(), p_premium: false });
    const r3 = await rpc(db, "consume_quota", { p_user: a, p_request_id: randomUUID(), p_premium: false });
    assert.deepEqual([r1.allowed, r2.allowed, r3.reason], [true, true, "org_limit"]);
  });

  test("one organization cannot see another's members, sessions or dashboard", async () => {
    const orgA = await makeOrg("Alpha University"), orgB = await makeOrg("Beta University");
    const adminA = await createUser(db), learnerB = await createUser(db);
    await db.query("insert into public.org_members (org_id, user_id, role) values ($1, $2, 'org_admin')", [orgA, adminA]);
    await db.query("insert into public.org_members (org_id, user_id) values ($1, $2)", [orgB, learnerB]);
    await db.query("insert into public.tutoring_sessions (user_id, org_id, title) values ($1, $2, 'secret')", [learnerB, orgB]);

    await asUser(db, adminA, async () => {
      const members = await db.query("select org_id from public.org_members");
      assert.ok(members.rows.every((m: any) => m.org_id === orgA), "only own org roster visible");
      const orgs = await db.query("select id from public.organizations");
      assert.deepEqual(orgs.rows.map((o: any) => o.id), [orgA]);
      const sessions = await db.query("select id from public.tutoring_sessions");
      assert.equal(sessions.rows.length, 0, "cannot read other users' sessions");
    });
    await assert.rejects(rpc(db, "org_dashboard", { p_actor: adminA, p_org: orgB, p_month: "2026-10-01" }), /forbidden/);

    // Signed-in users can't probe other people's roles through the RPC API.
    await asUser(db, learnerB, async () => {
      await assert.rejects(db.query("select public.is_org_admin($1, $2)", [orgA, adminA]), /permission denied/);
      await assert.rejects(db.query("select public.is_platform_admin($1)", [adminA]), /permission denied/);
    });
    const own = await rpc(db, "org_dashboard", { p_actor: adminA, p_org: orgA, p_month: "2026-10-01" });
    assert.equal(own.organization.id, orgA);
  });
});

describe("account view", () => {
  test("my_account shows the caller's own plan and usage only", async () => {
    const u = await createUser(db);
    await subscribe(u, "pro", "active");
    const acct = await asUser(db, u, async () => (await db.query("select public.my_account() as a")).rows[0] as any);
    assert.equal(acct.a.plan, "pro");
    assert.equal(acct.a.limits.daily, 150);
    assert.equal(acct.a.is_admin, false);
  });
});

describe("unit economics", () => {
  test("gross margin uses revenue minus AI cost, allocated infra and fees", async () => {
    const u = await createUser(db);
    await subscribe(u, "professional", "active");
    await db.query("update public.subscriptions set provider = 'flutterwave' where user_id = $1", [u]);
    await rpc(db, "record_usage", { p: { request_id: randomUUID(), user_id: u, plan_id: "professional", provider: "anthropic",
      model: "claude-opus-5-5", premium: true, input_tokens: 1000, output_tokens: 500, est_cost_usd: 5, status: "success" } });
    const rows = await db.query<any>("select * from public.admin_unit_economics(current_date) where plan_id = 'professional'");
    const r = rows.rows[0];
    assert.equal(Number(r.est_revenue_usd), 50);
    assert.equal(Number(r.ai_cost_usd), 5);
    assert.equal(Number(r.gross_margin_pct), 90);
  });
});

describe("migrations", () => {
  test("learners read only their own learning events and cannot write any", async () => {
    const a = await createUser(db), b = await createUser(db);
    await db.query("insert into public.learning_events (user_id, kind, concepts) values ($1, 'problem_solved', '{Ohm''s law}')", [a]);
    const mine = await asUser(db, a, () => db.query<any>("select count(*)::int as n from public.learning_events"));
    const theirs = await asUser(db, b, () => db.query<any>("select count(*)::int as n from public.learning_events"));
    assert.equal(mine.rows[0].n, 1);
    assert.equal(theirs.rows[0].n, 0);
    await assert.rejects(asUser(db, b, () => db.query("insert into public.learning_events (user_id, kind) values ($1, 'practice_solved')", [b])));
    await assert.rejects(asUser(db, a, () => db.query("update public.learning_events set hints_used = 0")));
  });

  test("rollback script removes everything and the migrations re-apply cleanly", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const { join, dirname } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const root = join(dirname(fileURLToPath(import.meta.url)), "..");
    const scratch = await freshDb();
    await scratch.exec(readFileSync(join(root, "rollback", "20261024_menya_all.down.sql"), "utf8"));
    const left = await scratch.query<any>("select count(*)::int as n from pg_tables where schemaname = 'public'");
    assert.equal(left.rows[0].n, 0);
    for (const f of readdirSync(join(root, "migrations")).filter(f => f.endsWith(".sql")).sort()) await scratch.exec(migrationSql(f));
    const plans = await scratch.query<any>("select count(*)::int as n from public.plans");
    assert.equal(plans.rows[0].n, 3);
  });
});
