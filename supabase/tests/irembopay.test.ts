// IremboPay adapter: invoice creation, notification signatures, and a paid
// invoice granting the plan through the real database rules.
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import { freshDb, createUser, rpc } from "./db.ts";
import { iremboPayProvider, iremboPayTransactionId, signIremboPayWebhook, WebhookSignatureError } from "../functions/_shared/billing.ts";

const KEY = "sk_test_irembo_merchant_secret";
const ACCOUNT = "TST-RWF";
const PLANS = { "pro:month": { code: "PI-PRO-M", amount: 5000 }, "pro:year": { code: "PI-PRO-Y", amount: 50000 } };
const NOW = Date.parse("2026-10-29T08:00:00Z");

function notification(userId: string, over: Record<string, unknown> = {}) {
  return JSON.stringify({ success: true, data: {
    amount: 5000, invoiceNumber: "880123456789", transactionId: iremboPayTransactionId(userId, "pro", "month", NOW - 60_000),
    createdAt: "2026-10-29T09:59:00.000+02:00", paidAt: "2026-10-29T10:00:00.000+02:00", paymentMethod: "MOMO_PUSH",
    paymentReference: "REF1", customer: { email: "learner@uni.test" }, paymentItems: [{ unitAmount: 5000, quantity: 1, code: "PI-PRO-M" }],
    paymentAccountIdentifier: ACCOUNT, paymentStatus: "PAID", currency: "RWF", ...over } });
}

const headers = async (body: string, t = NOW) => new Headers({ "irembopay-signature": await signIremboPayWebhook(KEY, body, t) });

describe("IremboPay", () => {
  let db: PGlite;
  before(async () => { db = await freshDb(); });

  test("checkout creates an invoice with the configured product and returns its payment link", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ success: true, data: { paymentLinkUrl: "https://checkout.sandbox.irembopay.com/880123" } }), { status: 201 });
    }) as unknown as typeof fetch;
    const pay = iremboPayProvider({ secretKey: KEY, paymentAccount: ACCOUNT, plans: PLANS, sandbox: true, fetchImpl, now: () => NOW });
    const userId = "6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f";
    const { url } = await pay.createCheckout({ userId, email: "learner@uni.test", planId: "pro", interval: "month", successUrl: "", cancelUrl: "" });
    assert.equal(url, "https://checkout.sandbox.irembopay.com/880123");
    assert.equal(calls[0].url, "https://api.sandbox.irembopay.com/payments/invoices");
    const h = calls[0].init.headers as Record<string, string>;
    assert.equal(h["irembopay-secretKey"], KEY);
    assert.equal(h["X-API-Version"], "2");
    const body = JSON.parse(String(calls[0].init.body));
    assert.equal(body.paymentAccountIdentifier, ACCOUNT);
    assert.deepEqual(body.paymentItems, [{ code: "PI-PRO-M", quantity: 1, unitAmount: 5000 }]);
    assert.match(body.transactionId, /^MNY-PROM-6f1c2d3e4a5b4c6d8e9f0a1b2c3d4e5f-/);

    await assert.rejects(pay.createCheckout({ userId, email: null, planId: "professional", interval: "month", successUrl: "", cancelUrl: "" }),
      /no IremboPay product configured/);
  });

  test("notifications must carry a fresh, valid signature", async () => {
    const pay = iremboPayProvider({ secretKey: KEY, paymentAccount: ACCOUNT, plans: PLANS, now: () => NOW });
    const body = notification("6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f");
    await assert.rejects(pay.verifyWebhook(new Headers(), body), WebhookSignatureError);
    await assert.rejects(pay.verifyWebhook(await headers(body.replace("5000", "50")), body), WebhookSignatureError, "body changed");
    await assert.rejects(pay.verifyWebhook(await headers(body, NOW - 10 * 60_000), body), /too old/);
    const wrongKey = new Headers({ "irembopay-signature": await signIremboPayWebhook("another-key", body, NOW) });
    await assert.rejects(pay.verifyWebhook(wrongKey, body), /bad signature/);
  });

  test("only a PAID invoice, to our account, at the full price, grants anything", async () => {
    const pay = iremboPayProvider({ secretKey: KEY, paymentAccount: ACCOUNT, plans: PLANS, now: () => NOW });
    const id = "6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f";
    for (const over of [{ paymentStatus: "NEW" }, { paymentAccountIdentifier: "OTHER-RWF" }, { amount: 100 }, { transactionId: "SOMEONE-ELSE-123" }]) {
      const body = notification(id, over);
      assert.equal((await pay.verifyWebhook(await headers(body), body)).subscription, null, JSON.stringify(over));
    }
    const body = notification(id);
    const ev = await pay.verifyWebhook(await headers(body), body);
    assert.equal(ev.subscription!.user_id, id);
    assert.equal(ev.subscription!.plan_id, "pro");
    assert.equal(ev.subscription!.current_period_start, "2026-10-29T08:00:00.000Z");
    assert.equal(ev.subscription!.current_period_end, "2026-11-29T08:00:00.000Z");
  });

  test("a paid notification upgrades the learner to Pro for one month; a repeat does nothing", async () => {
    const learner = await createUser(db);
    const pay = iremboPayProvider({ secretKey: KEY, paymentAccount: ACCOUNT, plans: PLANS, now: () => Date.now() });
    const body = notification(learner, { paidAt: new Date().toISOString() });
    const ev = await pay.verifyWebhook(await headers(body, Date.now()), body);
    assert.equal(await rpc(db, "process_payment_event", { p_provider: "irembopay", p_event: ev, p_raw: JSON.parse(body) }), "processed");
    assert.equal(await rpc(db, "process_payment_event", { p_provider: "irembopay", p_event: ev, p_raw: JSON.parse(body) }), "duplicate");
    const ent = (await db.query<any>("select * from public.resolve_entitlement($1)", [learner])).rows[0];
    assert.equal(ent.plan_id, "pro");
  });
});
