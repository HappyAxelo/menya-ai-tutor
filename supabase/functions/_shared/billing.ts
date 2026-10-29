// ============================================================
// Billing provider boundary.
//
// Only a webhook whose signature verifies may change a subscription.
// Returning from a checkout page grants nothing.
//
// Implemented: "test" (HMAC-signed provider-neutral events, for test
// mode and integration tests) and "irembopay" (Rwanda: mobile money and
// cards; one payment buys one month or one year). See docs/BILLING.md.
// ============================================================

export interface NormalizedEvent {
  id: string;
  type: string;
  occurred_at?: string;
  subscription: null | {
    provider_subscription_id: string;
    provider_customer_id?: string;
    user_id?: string;
    org_id?: string;
    plan_id: string;
    interval?: "month" | "year";
    status: "incomplete" | "trialing" | "active" | "past_due" | "canceled" | "expired" | "refunded";
    current_period_start?: string;
    current_period_end?: string;
    cancel_at_period_end?: boolean;
  };
}

export class WebhookSignatureError extends Error {}

export interface CheckoutRequest {
  userId: string;
  email: string | null;
  planId: string;
  interval: "month" | "year";
  successUrl: string;
  cancelUrl: string;
}

export interface BillingProvider {
  name: string;
  // Throws WebhookSignatureError if the request is not authentic.
  verifyWebhook(headers: Headers, rawBody: string): Promise<NormalizedEvent>;
  createCheckout(req: CheckoutRequest): Promise<{ url: string }>;
  createPortal(customerId: string, returnUrl: string): Promise<{ url: string }>;
}

const enc = new TextEncoder();

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig), b => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signTestWebhook(secret: string, rawBody: string, timestamp = Math.floor(Date.now() / 1000)): Promise<string> {
  return `t=${timestamp},v1=${await hmacHex(secret, `${timestamp}.${rawBody}`)}`;
}

// Header: menya-signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">
export function testBillingProvider(secret: string, toleranceSeconds = 300, now = () => Date.now()): BillingProvider {
  if (!secret || secret.length < 32) throw new Error("BILLING_TEST_WEBHOOK_SECRET must be at least 32 characters");
  return {
    name: "test",
    async verifyWebhook(headers, rawBody) {
      const header = headers.get("menya-signature") ?? "";
      const parts = Object.fromEntries(header.split(",").map(p => p.split("=", 2) as [string, string]));
      const t = Number(parts.t);
      if (!parts.v1 || !Number.isFinite(t)) throw new WebhookSignatureError("missing signature");
      if (Math.abs(now() / 1000 - t) > toleranceSeconds) throw new WebhookSignatureError("signature too old");
      const expected = await hmacHex(secret, `${t}.${rawBody}`);
      if (!timingSafeEqual(expected, parts.v1)) throw new WebhookSignatureError("bad signature");
      let event: NormalizedEvent;
      try { event = JSON.parse(rawBody); } catch { throw new WebhookSignatureError("malformed body"); }
      if (typeof event?.id !== "string" || typeof event?.type !== "string") throw new WebhookSignatureError("malformed event");
      return event;
    },
    async createCheckout() {
      throw new Error("The test billing provider has no checkout. Send signed test events with scripts/send-test-webhook.mjs.");
    },
    async createPortal() {
      throw new Error("The test billing provider has no customer portal.");
    },
  };
}

// ------------------------------------------------------------
// IremboPay (https://irembopay.gitbook.io/irembopay-api-docs).
// Checkout creates an invoice and sends the learner to its payment page.
// IremboPay has no automatic renewal: each PAID notification grants one
// period (a month or a year) from the payment time. The invoice's
// transactionId carries the plan, interval and learner, so the webhook
// needs nothing else: MNY-<plan code><interval code>-<user id hex>-<time>.
// Webhook header: irembopay-signature: t=<ms>,s=<hex HMAC-SHA256 of "<t>#<raw body>">,
// keyed with the merchant secret key.
// ------------------------------------------------------------
export interface IremboPayPlan { code: string; amount: number }  // product code from the IremboPay portal, price in the account currency

export interface IremboPayConfig {
  secretKey: string;
  paymentAccount: string;                       // paymentAccountIdentifier from the portal (sets the currency)
  plans: Record<string, IremboPayPlan>;         // keys "pro:month", "pro:year", "professional:month", ...
  sandbox?: boolean;
  fetchImpl?: typeof fetch;
  now?: () => number;
  toleranceSeconds?: number;
}

const PLAN_CODES: Record<string, string> = { pro: "PRO", professional: "PRF" };
const INTERVAL_CODES: Record<string, string> = { month: "M", year: "Y" };
const TXN_RE = /^MNY-(PRO|PRF)(M|Y)-([0-9a-f]{32})-[0-9a-z]+$/;

export function iremboPayTransactionId(userId: string, planId: string, interval: "month" | "year", now = Date.now()): string {
  const plan = PLAN_CODES[planId], int = INTERVAL_CODES[interval];
  if (!plan || !int) throw new Error(`plan ${planId}/${interval} cannot be sold through IremboPay`);
  return `MNY-${plan}${int}-${userId.replace(/-/g, "").toLowerCase()}-${now.toString(36)}`;
}

function parseTransactionId(id: string) {
  const m = TXN_RE.exec(id ?? "");
  if (!m) return null;
  const hex = m[3];
  return {
    planId: Object.keys(PLAN_CODES).find(k => PLAN_CODES[k] === m[1])!,
    interval: (m[2] === "Y" ? "year" : "month") as "month" | "year",
    userId: `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`,
  };
}

export async function signIremboPayWebhook(secretKey: string, rawBody: string, timestampMs = Date.now()): Promise<string> {
  return `t=${timestampMs},s=${await hmacHex(secretKey, `${timestampMs}#${rawBody}`)}`;
}

export function iremboPayProvider(cfg: IremboPayConfig): BillingProvider {
  if (!cfg.secretKey) throw new Error("IREMBOPAY_SECRET_KEY is required");
  if (!cfg.paymentAccount) throw new Error("IREMBOPAY_PAYMENT_ACCOUNT is required");
  const base = cfg.sandbox ? "https://api.sandbox.irembopay.com" : "https://api.irembopay.com";
  const doFetch = cfg.fetchImpl ?? fetch, now = cfg.now ?? Date.now, tolerance = cfg.toleranceSeconds ?? 300;
  return {
    name: "irembopay",
    async verifyWebhook(headers, rawBody) {
      const parts = Object.fromEntries((headers.get("irembopay-signature") ?? "").split(",")
        .map(p => p.trim().split("=", 2) as [string, string]));
      const t = Number(parts.t);
      if (!parts.s || !Number.isFinite(t)) throw new WebhookSignatureError("missing signature");
      if (Math.abs(now() - t) > tolerance * 1000) throw new WebhookSignatureError("signature too old");
      const expected = await hmacHex(cfg.secretKey, `${parts.t}#${rawBody}`);
      if (!timingSafeEqual(expected, parts.s.toLowerCase())) throw new WebhookSignatureError("bad signature");
      let body: any;
      try { body = JSON.parse(rawBody); } catch { throw new WebhookSignatureError("malformed body"); }
      const d = body?.data;
      if (typeof d?.invoiceNumber !== "string" || typeof d?.transactionId !== "string") throw new WebhookSignatureError("malformed event");
      const id = `${d.invoiceNumber}:${d.paymentStatus ?? "UNKNOWN"}`;
      const txn = parseTransactionId(d.transactionId);
      const planCfg = txn ? cfg.plans[`${txn.planId}:${txn.interval}`] : undefined;
      // Only a paid invoice for one of our plans, at the configured price and account, grants anything.
      const genuine = txn && planCfg && d.paymentStatus === "PAID" && d.paymentAccountIdentifier === cfg.paymentAccount &&
        Number(d.amount) >= planCfg.amount;
      if (!genuine) return { id, type: `invoice.${String(d.paymentStatus ?? "unknown").toLowerCase()}`, subscription: null };
      const start = new Date(d.paidAt ? Date.parse(d.paidAt) : now());
      const end = new Date(start);
      if (txn!.interval === "year") end.setUTCFullYear(end.getUTCFullYear() + 1); else end.setUTCMonth(end.getUTCMonth() + 1);
      return {
        id, type: "invoice.paid", occurred_at: start.toISOString(),
        subscription: {
          provider_subscription_id: d.transactionId, provider_customer_id: d.customer?.email ?? undefined,
          user_id: txn!.userId, plan_id: txn!.planId, interval: txn!.interval, status: "active",
          current_period_start: start.toISOString(), current_period_end: end.toISOString(), cancel_at_period_end: true,
        },
      };
    },
    async createCheckout(req) {
      const plan = cfg.plans[`${req.planId}:${req.interval}`];
      if (!plan) throw new Error(`no IremboPay product configured for ${req.planId}:${req.interval}`);
      const expires = new Date(now() + 24 * 3600 * 1000).toISOString().replace("Z", "+00:00");
      const res = await doFetch(`${base}/payments/invoices`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "irembopay-secretKey": cfg.secretKey, "X-API-Version": "2" },
        body: JSON.stringify({
          transactionId: iremboPayTransactionId(req.userId, req.planId, req.interval, now()),
          paymentAccountIdentifier: cfg.paymentAccount,
          paymentItems: [{ code: plan.code, quantity: 1, unitAmount: plan.amount }],
          description: `Menya AI ${req.planId} (${req.interval === "year" ? "1 year" : "1 month"})`,
          expiryAt: expires,
          language: "EN",
          ...(req.email ? { customer: { email: req.email } } : {}),
        }),
      });
      const data = await res.json().catch(() => null);
      const url = data?.data?.paymentLinkUrl;
      if (!res.ok || typeof url !== "string") throw new Error(`IremboPay invoice failed (HTTP ${res.status})`);
      return { url };
    },
    async createPortal() {
      throw new Error("IremboPay has no customer portal: learners renew by paying again.");
    },
  };
}

export interface BillingEnv {
  BILLING_PROVIDER?: string;            // unset = online payments disabled
  BILLING_TEST_WEBHOOK_SECRET?: string;
  IREMBOPAY_SECRET_KEY?: string;
  IREMBOPAY_PAYMENT_ACCOUNT?: string;
  IREMBOPAY_PLANS?: string;             // JSON: {"pro:month":{"code":"PI-...","amount":5000}, ...}
  IREMBOPAY_ENV?: string;               // "sandbox" (default) or "production"
}

export function buildBillingProvider(env: BillingEnv): BillingProvider | null {
  switch (env.BILLING_PROVIDER) {
    case undefined:
    case "":
      return null;
    case "test":
      return testBillingProvider(env.BILLING_TEST_WEBHOOK_SECRET ?? "");
    case "irembopay":
      return iremboPayProvider({
        secretKey: env.IREMBOPAY_SECRET_KEY ?? "", paymentAccount: env.IREMBOPAY_PAYMENT_ACCOUNT ?? "",
        plans: JSON.parse(env.IREMBOPAY_PLANS || "{}"), sandbox: env.IREMBOPAY_ENV !== "production",
      });
    default:
      throw new Error(`Billing provider "${env.BILLING_PROVIDER}" has no adapter yet. See docs/BILLING.md.`);
  }
}
