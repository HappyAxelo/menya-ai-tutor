// ============================================================
// Billing provider boundary.
//
// Only a webhook whose signature verifies may change a subscription.
// Returning from a checkout page grants nothing.
//
// Implemented: "test" (HMAC-signed provider-neutral events, for test
// mode and integration tests). Not implemented yet: a live provider —
// the business must first confirm which provider can onboard it (see
// docs/BILLING.md). Adding one means writing an adapter with the same
// interface; nothing else changes.
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

export interface BillingEnv {
  BILLING_PROVIDER?: string;            // unset = online payments disabled
  BILLING_TEST_WEBHOOK_SECRET?: string;
}

export function buildBillingProvider(env: BillingEnv): BillingProvider | null {
  switch (env.BILLING_PROVIDER) {
    case undefined:
    case "":
      return null;
    case "test":
      return testBillingProvider(env.BILLING_TEST_WEBHOOK_SECRET ?? "");
    default:
      throw new Error(`Billing provider "${env.BILLING_PROVIDER}" has no adapter yet. See docs/BILLING.md.`);
  }
}
