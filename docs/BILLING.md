# Billing

## IremboPay (Rwanda: mobile money and cards) — implemented, needs sandbox confirmation

`iremboPayProvider` in `supabase/functions/_shared/billing.ts`, following the public API docs
([create invoice](https://irembopay.gitbook.io/irembopay-api-docs/apis/invoice/openapi),
[payment notifications](https://irembopay.gitbook.io/irembopay-api-docs/apis/payment/payment-notifications)).

How it works:
1. Learner chooses a plan → `POST /billing/checkout` creates an IremboPay **invoice**
   (`POST /payments/invoices`, header `irembopay-secretKey`, `X-API-Version: 2`) and returns its
   `paymentLinkUrl`; the learner pays there (MTN/Airtel mobile money or card).
2. IremboPay calls `POST {API}/billing/webhook` with header `irembopay-signature: t=<ms>,s=<hex>`;
   Menya verifies HMAC-SHA256 of `<t>#<raw body>` with the secret key (5-minute tolerance).
3. Only `paymentStatus: "PAID"`, to **your** payment account, for at least the configured price,
   with a Menya transaction id, grants anything: one month or one year from the payment time.
   Replays are ignored (idempotent by invoice number).

Setup (owner):
1. Get an IremboPay merchant account; in the merchant portal create a **payment account** (RWF)
   and one **product** per plan and period (e.g. Pro monthly, Pro yearly, Professional monthly).
2. Set the webhook/callback URL to
   `https://tgrihnmngbamxxjnedlc.supabase.co/functions/v1/api/billing/webhook`.
3. Supabase → Edge Functions → Secrets:

   | Secret | Example |
   |---|---|
   | `BILLING_PROVIDER` | `irembopay` |
   | `IREMBOPAY_SECRET_KEY` | from the merchant portal |
   | `IREMBOPAY_PAYMENT_ACCOUNT` | your payment account identifier |
   | `IREMBOPAY_PLANS` | one entry per plan and period sold: `pro:month`, `pro:semester`, `pro:year`, `exam:two_weeks`, `professional:month`, e.g. `{"pro:month":{"code":"PI-...","amount":10},"pro:semester":{"code":"PI-...","amount":35},"pro:year":{"code":"PI-...","amount":90},"exam:two_weeks":{"code":"PI-...","amount":8},"professional:month":{"code":"PI-...","amount":25}}` (amounts in the payment account's currency: these are USD; use the RWF equivalents with an RWF account) |
   | `IREMBOPAY_ENV` | `sandbox` first, `production` when verified |

4. Set the same prices in the `plans` table (`price_monthly_cents`/`price_yearly_cents` in RWF ×100
   or as your display convention, `currency = 'RWF'`), so the pricing page shows what is charged.
5. **Sandbox test**: buy Pro monthly with a sandbox payment; check the admin page shows the
   learner on Pro and `payment_events` has one processed row. Then switch `IREMBOPAY_ENV`.

Limits: no automatic renewal (learners pay again); paying early starts the new period at the
payment time; refunds are handled in the IremboPay portal and the plan must then be ended by
an admin (grant a 0-day plan or wait for expiry).

## Status

The billing boundary is complete and tested:

- `BillingProvider` interface (`supabase/functions/_shared/billing.ts`): `verifyWebhook`,
  `createCheckout`, `createPortal`.
- Webhook pipeline: signature verification → provider-neutral event →
  `process_payment_event()` (idempotent, ignores stale events, audited).
- A `test` provider that accepts HMAC-SHA256-signed events, for test mode and integration tests.
- With `BILLING_PROVIDER` unset, checkout returns `501 billing_not_configured` and the pricing
  page tells learners that online payment isn't available yet and offers the contact form.
  Nothing pretends a payment happened.

Returning from a checkout page grants nothing; only a verified webhook changes a subscription.

## Choosing a provider (verify eligibility first)

Menya is operated from Rwanda and sells internationally. Eligibility depends on the legal
entity and bank account, so **confirm with each provider before building an adapter**.
What public sources said on 2026-10-24:

| Provider | What we found | Fit |
|---|---|---|
| Stripe | Not available to Rwanda-registered businesses directly; founders commonly use a US entity via Stripe Atlas ([Zenind](https://www.zenind.com/help/post/how-to-open-a-stripe-account-in-rwanda-what-is-actually-possible-in-2026)) | Only with a foreign entity |
| Paddle | Merchant of record (handles international sales tax). Rwanda isn't on its published sanctions list, but the full seller table needs confirming ([Paddle countries](https://www.paddle.com/help/start/intro-to-paddle/which-countries-are-supported-by-paddle), [supported countries](https://developer.paddle.com/concepts/sell/supported-countries-locales)) | Strong for international card subscriptions, if it onboards you |
| Flutterwave | Operates in Rwanda (cards, MTN/Airtel mobile money). Its recurring "payment plans" need a tokenizable method, which in practice means **cards only** ([payment plans](https://developer.flutterwave.com/docs/recurring-payments/payment-plans), [recurring overview](https://developer.flutterwave.com/docs/recurring-payments/overview)) | Good locally; mobile-money users would renew manually |

A practical path is a merchant of record (Paddle or similar) for international card
subscriptions, plus a local provider for mobile money with manual monthly/annual renewal
(each payment extends `current_period_end`). Both fit the same interface.

## Adding a provider adapter

1. Implement `BillingProvider` in `billing.ts`:
   - `verifyWebhook(headers, rawBody)`: check the provider's signature with its webhook secret
     (constant-time compare, timestamp tolerance), then map the payload to `NormalizedEvent`
     (`id`, `type`, `occurred_at`, `subscription{provider_subscription_id, user_id|org_id,
     plan_id, interval, status, current_period_start/end, cancel_at_period_end}`).
   - `createCheckout(...)`: create a hosted checkout carrying the user id and plan id in the
     provider's metadata, so the webhook can be mapped back to the user.
   - `createPortal(...)`: link to the provider's customer portal (cancel, update card).
2. Register it in `buildBillingProvider()` and add its secrets to `supabase/.env.example`.
3. Map provider states to Menya states: active, trialing, past_due (payment failed, retrying),
   canceled (access until period end), expired, refunded.
4. Add tests like `tests/api.test.ts` → "billing webhooks" using recorded sample payloads.
5. Run in the provider's **test mode** end to end before switching to live keys.
6. Set `payment_fee_pct` in `app_settings` so gross-margin reports include fees.

## Test mode today

```bash
# supabase/.env
BILLING_PROVIDER=test
BILLING_TEST_WEBHOOK_SECRET=<at least 32 random characters>
```

Send a signed event (the header is `menya-signature: t=<unix>,v1=<hex HMAC of "t.body">`;
`signTestWebhook()` in `billing.ts` produces it). Never enable the test provider on a
production project.
