// The four plans end to end: exact entitlements, expiry, payments through the real webhook route and
// the real database rules, renewal rules, and what the student dashboard reports.
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { PGlite } from "@electric-sql/pglite";
import { freshDb, createUser, rpc, asUser } from "./db.ts";
import { pgRepo } from "./pgRepo.ts";
import { handleApi, DbError, type ApiContext } from "../functions/_shared/api.ts";
import { iremboPayProvider, iremboPayTransactionId, signIremboPayWebhook, type BillingInterval } from "../functions/_shared/billing.ts";

const KEY = "sk_test_irembo", ACCOUNT = "TST-RWF";
const PLANS = { "pro:month": { code: "PI-PRO", amount: 7250 }, "exam:two_weeks": { code: "PI-EXM", amount: 7250 }, "professional:month": { code: "PI-MAX", amount: 11600 } };
let db: PGlite, ctx: ApiContext;
const emails = new Map<string, string>();
const INVOICES = new Map<string, any>();
const invoiceRequests: any[] = [];

const irembo = (async (url: string, init: RequestInit) => {
  if (init?.method === "POST") {
    invoiceRequests.push(JSON.parse(String(init.body)));
    return new Response(JSON.stringify({ data: { paymentLinkUrl: "https://checkout.sandbox.irembopay.com/x" } }), { status: 201 });
  }
  const invoice = INVOICES.get(decodeURIComponent(String(url).split("/").at(-1)!));
  return invoice ? new Response(JSON.stringify({ data: invoice }), { status: 200 }) : new Response("{}", { status: 404 });
}) as unknown as typeof fetch;

before(async () => {
  db = await freshDb();
  ctx = {
    repo: pgRepo(db),
    db: { async rpc(fn, args) { try { return await rpc(db, fn, args); } catch (err: any) { throw new DbError(err.message, err.code); } } },
    providers: {}, billing: iremboPayProvider({ secretKey: KEY, paymentAccount: ACCOUNT, plans: PLANS, sandbox: true, fetchImpl: irembo, currency: "RWF" }),
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
const call = async (method: string, path: string, token?: string, body?: unknown, headers: Record<string, string> = {}, raw?: string) => {
  const res = await handleApi(new Request(`https://x.supabase.co/functions/v1/api${path}`, { method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) }), ctx);
  return { status: res.status, body: await res.json().catch(() => null) as any };
};
// A notification exactly as IremboPay sends it, correctly signed.
let invoiceNo = 880000000000;
async function notify(userId: string, plan: string, interval: BillingInterval, over: Record<string, unknown> = {}, confirmed = true, paidAt = new Date()) {
  const amount = PLANS[`${plan}:${interval}` as keyof typeof PLANS]?.amount ?? 1;
  const data = { amount, invoiceNumber: String(++invoiceNo), transactionId: iremboPayTransactionId(userId, plan, interval, Date.now() + invoiceNo),
    paidAt: paidAt.toISOString(), paymentMethod: "MTN_MOMO", paymentAccountIdentifier: ACCOUNT, paymentStatus: "PAID", currency: "RWF",
    customer: { email: "learner@uni.test" }, ...over };
  if (confirmed) INVOICES.set(data.invoiceNumber, data);
  return send(data);
}
const send = async (data: any) => {
  const raw = JSON.stringify({ success: true, data });
  return { ...(await call("POST", "/billing/webhook", undefined, undefined, { "irembopay-signature": await signIremboPayWebhook(KEY, raw) }, raw)), data, raw };
};
const entitlement = async (u: string) => (await db.query<any>("select * from public.resolve_entitlement($1)", [u])).rows[0];
const payments = async (u: string) => (await call("GET", "/billing/history", `tok_${u}`)).body.payments;

describe("each plan gets exactly its entitlements", () => {
  const EXPECT: Record<string, number[]> = {   // day, month, conversation, memory, per minute, pictures, notes
    free: [20, 300, 30, 10, 6, 1, 3], pro: [150, 3000, 80, 24, 15, 3, 30], exam: [1000, 10000, 120, 30, 20, 10, 30], professional: [1000, 20000, 150, 40, 30, 10, 30],
  };
  test("the table holds the agreed limits and prices, and the server reports the same", async () => {
    const { plans } = (await call("GET", "/plans")).body;
    assert.deepEqual(plans.map((p: any) => p.name), ["Free", "Pro", "Exam Pass", "Max"]);
    const by = Object.fromEntries(plans.map((p: any) => [p.id, p]));
    for (const [id, want] of Object.entries(EXPECT)) {
      const p = by[id];
      assert.deepEqual([p.daily_request_limit, p.monthly_request_limit, p.max_session_turns, p.context_turns, p.requests_per_minute, p.daily_image_limit, p.material_limit], want, id);
      assert.equal(p.daily_exam_limit, 30);
    }
    assert.deepEqual([by.pro.price_monthly_cents, by.exam.price_two_weeks_cents, by.professional.price_monthly_cents], [500, 500, 800]);
    assert.deepEqual([by.free.analytics_level, by.pro.analytics_level, by.exam.analytics_level, by.professional.analytics_level], ["basic", "enhanced", "enhanced", "enhanced"]);
  });

  test("the learner's limits really change with what they paid for", async () => {
    const u = await user();
    assert.equal((await entitlement(u.id)).daily_request_limit, 20);
    await notify(u.id, "pro", "month");
    assert.equal((await entitlement(u.id)).plan_id, "pro");
    assert.equal((await entitlement(u.id)).daily_request_limit, 150);
    await notify(u.id, "professional", "month");
    const e = await entitlement(u.id);
    assert.deepEqual([e.plan_id, e.monthly_request_limit, e.max_session_turns], ["professional", 20000, 150]);
  });

  test("daily and monthly allowances are enforced by the database and reset on the next period", async () => {
    const u = await user();
    const take = () => ctx.repo.consumeQuota(u.id, randomUUID(), false) as Promise<any>;
    await db.query("insert into public.usage_counters (subject_type, subject_id, period, period_start, requests) values ('user', $1, 'day', (now() at time zone 'utc')::date, 20)", [u.id]);
    const blocked = await take();
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.reason, "daily_limit");
    await db.query("update public.usage_counters set period_start = period_start - 1 where subject_id = $1 and period = 'day'", [u.id]);
    assert.equal((await take()).allowed, true, "a new day starts again");

    const v = await user();
    await db.query("insert into public.usage_counters (subject_type, subject_id, period, period_start, requests) values ('user', $1, 'month', date_trunc('month', now() at time zone 'utc')::date, 300)", [v.id]);
    const full = await ctx.repo.consumeQuota(v.id, randomUUID(), false);
    assert.equal(full.reason, "monthly_limit");
    await db.query("update public.usage_counters set period_start = (period_start - interval '1 month')::date where subject_id = $1 and period = 'month'", [v.id]);
    assert.equal((await ctx.repo.consumeQuota(v.id, randomUUID(), false)).allowed, true, "a new month starts again");
  });

  test("notes and practice exams follow the plan, not the browser", async () => {
    const u = await user();
    const add = (n: number) => call("POST", "/materials", u.token, { title: `n${n}`, kind: "text", pages: [{ page: 1, text: "abc" }], plan: "professional", p_max: 999 });
    for (let i = 0; i < 3; i++) assert.equal((await add(i)).status, 200);
    assert.equal((await add(4)).body.error, "material_limit", "extra fields in the request change nothing");
    await notify(u.id, "pro", "month");
    assert.equal((await add(5)).status, 200, "Pro has 30");
    await db.query("update public.plans set daily_exam_limit = 1 where id = 'pro'");
    try {
      assert.equal((await call("POST", "/exam/start", u.token, { objectives: ["ee.ohms_law"], count: 3 })).status, 200);
      assert.equal((await call("POST", "/exam/start", u.token, { objectives: ["ee.ohms_law"], count: 3 })).body.error, "exam_daily_limit", "changed in one place");
    } finally { await db.query("update public.plans set daily_exam_limit = 30 where id = 'pro'"); }
  });
});

describe("payments", () => {
  test("checkout sends IremboPay the configured product, records it as pending, and the price can't be set by the browser", async () => {
    const u = await user();
    invoiceRequests.length = 0;
    const r = await call("POST", "/billing/checkout", u.token, { plan: "professional", interval: "month", amount: 1, price: 1, code: "HACK" });
    assert.equal(r.status, 200);
    assert.deepEqual(invoiceRequests[0].paymentItems, [{ code: "PI-MAX", quantity: 1, unitAmount: 11600 }]);
    assert.equal(invoiceRequests[0].paymentAccountIdentifier, ACCOUNT);
    assert.match(invoiceRequests[0].transactionId, /^MNY-PRFM-/);
    const [p] = await payments(u.id);
    assert.deepEqual([p.status, p.plan, Number(p.amount), p.currency], ["pending", "professional", 11600, "RWF"]);
    assert.equal((await entitlement(u.id)).plan_id, "free", "starting checkout grants nothing");
    assert.equal((await call("GET", "/account/export", u.token)).body.payments.length, 1, "included in the data download");
  });

  test("a confirmed payment activates the right plan and period, and is recorded as paid", async () => {
    for (const [plan, interval, name] of [["pro", "month", "PROM"], ["exam", "two_weeks", "EXMW"], ["professional", "month", "PRFM"]] as const) {
      const u = await user();
      const r = await notify(u.id, plan, interval);
      assert.equal(r.status, 200);
      assert.ok(r.data.transactionId.includes(name));
      const e = await entitlement(u.id);
      assert.equal(e.plan_id, plan);
      const days = (new Date(e.period_end).getTime() - Date.parse(r.data.paidAt)) / 864e5;
      if (interval === "two_weeks") assert.equal(days, 14, "Exam Pass lasts exactly 14 days");
      else assert.ok(days >= 28 && days <= 31);
      const [p] = await payments(u.id);
      assert.deepEqual([p.status, Number(p.amount), p.method], ["paid", PLANS[`${plan}:${interval}` as keyof typeof PLANS].amount, "MTN_MOMO"]);
    }
  });

  test("failed and cancelled payments, wrong amounts and unconfirmed notifications never grant anything", async () => {
    const u = await user();
    await notify(u.id, "pro", "month", { paymentStatus: "FAILED" });
    await notify(u.id, "pro", "month", { paymentStatus: "CANCELLED" });
    assert.equal((await entitlement(u.id)).plan_id, "free");
    assert.deepEqual((await payments(u.id)).map((p: any) => p.status).sort(), ["cancelled", "failed"]);
    assert.equal((await notify(u.id, "pro", "month", { amount: 100 })).status, 200);
    assert.equal((await notify(u.id, "pro", "month", { paymentAccountIdentifier: "OTHER" })).status, 200);
    assert.equal((await entitlement(u.id)).plan_id, "free");

    // Correctly signed, but IremboPay's own records say otherwise.
    const data = { amount: 7250, invoiceNumber: String(++invoiceNo), transactionId: iremboPayTransactionId(u.id, "pro", "month"), paidAt: new Date().toISOString(),
      paymentMethod: "MTN_MOMO", paymentAccountIdentifier: ACCOUNT, paymentStatus: "PAID", currency: "RWF" };
    INVOICES.set(data.invoiceNumber, { ...data, paymentStatus: "NEW" });
    assert.equal((await send(data)).status, 200);
    assert.equal((await entitlement(u.id)).plan_id, "free");
    // IremboPay can't be reached: the request fails, so the notification can be sent again, and nothing is granted.
    const unknown = { ...data, invoiceNumber: String(++invoiceNo), transactionId: iremboPayTransactionId(u.id, "pro", "month", Date.now() + 5) };
    assert.notEqual((await send(unknown)).status, 200);
    assert.equal((await entitlement(u.id)).plan_id, "free");
    const forged = JSON.stringify({ success: true, data });
    assert.equal((await call("POST", "/billing/webhook", undefined, undefined, { "irembopay-signature": await signIremboPayWebhook("wrong-key", forged) }, forged)).status, 401);
  });

  test("a duplicate notification activates nothing twice and a late failure can't undo a payment", async () => {
    const u = await user();
    const first = await notify(u.id, "pro", "month");
    const end = new Date((await entitlement(u.id)).period_end).getTime();
    const again = await send(first.data);
    assert.equal(again.status, 200);
    assert.equal(again.body.result, "duplicate");
    assert.equal(new Date((await entitlement(u.id)).period_end).getTime(), end, "the period didn't grow");
    assert.equal((await db.query<any>("select count(*)::int as n from public.subscriptions where user_id = $1", [u.id])).rows[0].n, 1);
    assert.equal((await db.query<any>("select count(*)::int as n from public.payments where user_id = $1", [u.id])).rows[0].n, 1);
    await send({ ...first.data, paymentStatus: "FAILED" });
    assert.equal((await payments(u.id))[0].status, "paid");
    assert.equal((await entitlement(u.id)).plan_id, "pro");
  });

  test("an Exam Pass or a month expires by itself and the learner drops to their remaining plan or Free", async () => {
    const u = await user();
    await notify(u.id, "pro", "month");
    await notify(u.id, "exam", "two_weeks");
    assert.equal((await entitlement(u.id)).plan_id, "exam", "the pass applies while it lasts");
    await db.query("update public.subscriptions set current_period_end = now() - interval '1 minute' where user_id = $1 and plan_id = 'exam'", [u.id]);
    assert.equal((await entitlement(u.id)).plan_id, "pro", "unused Pro time carries on");
    await db.query("update public.subscriptions set current_period_end = now() - interval '1 minute' where user_id = $1", [u.id]);
    const e = await entitlement(u.id);
    assert.deepEqual([e.plan_id, e.daily_request_limit], ["free", 20]);
    const acct = (await asUser(db, u.id, () => db.query<any>("select public.my_account() as a"))).rows[0].a;
    assert.ok(["pro", "exam"].includes(acct.expired_plan.plan), "the dashboard can offer to renew");
    assert.equal((await db.query<any>("select count(*)::int as n from public.subscriptions where user_id = $1", [u.id])).rows[0].n, 2, "history is kept");
  });

  test("renewing early adds to the time already paid for", async () => {
    const u = await user();
    await notify(u.id, "pro", "month");
    const firstEnd = new Date((await entitlement(u.id)).period_end).getTime();
    await notify(u.id, "pro", "month");
    const days = (new Date((await entitlement(u.id)).period_end).getTime() - firstEnd) / 864e5;
    assert.ok(days >= 28 && days <= 31, `added ${days} days`);
  });

  test("money isn't taken for a lower plan that could never be used; upgrades and useful purchases are allowed", async () => {
    const u = await user();
    await notify(u.id, "professional", "month");
    const refused = await call("POST", "/billing/checkout", u.token, { plan: "exam", interval: "two_weeks" });
    assert.equal(refused.status, 409);
    assert.equal(refused.body.error, "higher_plan_active");
    assert.ok(refused.body.until);
    assert.equal((await call("POST", "/billing/checkout", u.token, { plan: "professional", interval: "month" })).status, 200, "renewing Max is fine");

    const v = await user();
    await notify(v.id, "pro", "month");
    assert.equal((await call("POST", "/billing/checkout", v.token, { plan: "professional", interval: "month" })).status, 200, "Pro to Max");
    assert.equal((await call("POST", "/billing/checkout", v.token, { plan: "exam", interval: "two_weeks" })).status, 200, "an Exam Pass on top of Pro");
    const w = await user();
    await notify(w.id, "exam", "two_weeks");
    assert.equal((await call("POST", "/billing/checkout", w.token, { plan: "pro", interval: "month" })).status, 200, "Pro outlasts a 14-day pass");
  });

  test("existing subscriptions and payment logs are untouched by the update", async () => {
    const u = await user();
    await rpc(db, "process_payment_event", { p_provider: "flutterwave", p_raw: {}, p_event: { id: randomUUID(), type: "subscription.created",
      subscription: { provider_subscription_id: randomUUID(), user_id: u.id, plan_id: "professional", status: "active", current_period_end: new Date(Date.now() + 40 * 864e5).toISOString() } } });
    assert.equal((await entitlement(u.id)).plan_id, "professional");
  });
});

describe("the dashboard and the admin see what the database has", () => {
  test("usage numbers match the records", async () => {
    const u = await user();
    await notify(u.id, "pro", "month");
    await db.query("insert into public.usage_counters (subject_type, subject_id, period, period_start, requests) values ('user', $1, 'day', (now() at time zone 'utc')::date, 18), ('user', $1, 'month', date_trunc('month', now() at time zone 'utc')::date, 40)", [u.id]);
    await rpc(db, "media_allow", { p_user: u.id, p_kind: "diagram", p_cap: 3 });
    await call("POST", "/materials", u.token, { title: "n", kind: "text", pages: [{ page: 1, text: "abc" }] });
    const a = (await asUser(db, u.id, () => db.query<any>("select public.my_account() as a"))).rows[0].a;
    assert.deepEqual([a.used.daily, a.used.monthly, a.used.images, a.used.notes], [18, 40, 1, 1]);
    assert.deepEqual([a.limits.daily, a.limits.monthly, a.limits.images, a.limits.notes], [150, 3000, 3, 30]);
    assert.equal(a.subscription_status, "active");
  });

  test("revenue comes from payment records, for administrators only", async () => {
    const learner = await user();
    assert.equal((await call("GET", "/admin/revenue", learner.token)).status, 403);
    const admin = await user();
    await db.query("update public.profiles set platform_role = 'admin' where id = $1", [admin.id]);
    const before = (await call("GET", "/admin/revenue", admin.token)).body;
    const count = (b: any, plan: string) => b.subscribers_by_plan.find((p: any) => p.plan === plan).paying;
    const amount = (b: any) => Number(b.revenue_30d.find((r: any) => r.currency === "RWF")?.amount ?? 0);
    const u = await user();
    await notify(u.id, "exam", "two_weeks");
    await notify(u.id, "exam", "two_weeks");
    await notify(u.id, "pro", "month", { paymentStatus: "FAILED" });
    const r = (await call("GET", "/admin/revenue", admin.token)).body;
    assert.equal(count(r, "exam"), count(before, "exam") + 1);
    assert.equal(amount(r) - amount(before), 14500);
    assert.equal(r.exam_pass_sales_30d - before.exam_pass_sales_30d, 2);
    assert.equal(r.new_subscriptions_30d - before.new_subscriptions_30d, 1);
    assert.equal(r.renewals_30d - before.renewals_30d, 1);
    assert.equal(r.failed_payments_30d - before.failed_payments_30d, 1);
    assert.ok(r.by_method_30d.some((m: any) => m.method === "MTN_MOMO"));
    assert.ok("cost_month_usd" in r.ai && "heavy_users" in r);
  });
});

describe("no false claims", () => {
  test("nothing students can read promises a better model or unlimited use", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "menya");
    const files: string[] = [join(root, "public", "privacy.html"), join(root, "src", "locales.js"), join(root, "src", "plans.js"), join(root, "src", "PlansView.jsx")];
    for (const f of readdirSync(join(root, "src", "commercial"))) if (statSync(join(root, "src", "commercial", f)).isFile()) files.push(join(root, "src", "commercial", f));
    const banned = /stronger model|strongest|Advanced reasoning on hard|Anthropic|\bUnlimited\b|Illimit[ée]|Bila Kikomo|Renews on/;
    for (const f of files) {
      const hit = readFileSync(f, "utf8").split("\n").find(l => banned.test(l));
      assert.equal(hit, undefined, `${f}: ${hit}`);
    }
  });
});
