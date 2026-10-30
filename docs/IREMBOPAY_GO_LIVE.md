# IremboPay: from the meeting to the first real payment

Menya already contains the IremboPay connection (`supabase/functions/_shared/billing.ts`).
It is switched off until five secrets are set in Supabase. Nothing in the code needs to
change on Monday: you collect four pieces of information from IremboPay, type them into
Supabase, make one test payment, then switch to real money.

The connection was built from IremboPay's public API documentation and is covered by
automated tests, but it has **not yet talked to the real IremboPay sandbox** (that needs
your merchant account). The sandbox payment in step C is the first real check.

---

## A. Take to the meeting

**Documents** (ask IremboPay to confirm the exact list when you book; for a business
merchant account these are usually):

- National ID or passport of the owner / directors
- RDB certificate of incorporation (company) or business registration
- TIN (RRA tax number)
- Bank account details where the money should be settled (bank letter or statement)
- A short description of the business: *online tutoring for first-year ICT and engineering
  students; digital subscriptions; website https://menyaneza.com*

**What Menya sells** (they will ask):

| Plan | Period | Price (USD) | Key in Menya |
|---|---|---|---|
| Pro | 1 month | $10 | `pro:month` |
| Pro | 1 semester (4 months) | $35 | `pro:semester` |
| Pro | 1 year | $90 | `pro:year` |
| Exam Pass | 2 weeks | $8 | `exam:two_weeks` |
| Professional | 1 month | $25 | `professional:month` |

Each payment buys one period. There is no automatic renewal: the learner pays again
when the period ends. This is simple one-off invoices, which IremboPay supports.

## B. Questions to ask (write the answers here)

1. **Merchant account:** what is needed to open it, and how long does approval take?
   → ______________________
2. **Sandbox:** can I get sandbox (test) access today, before the account is approved?
   Which test phone numbers or cards work in the sandbox? → ______________________
3. **Secret key:** where do I find the *secret key* in the portal (sandbox and
   production are different keys)? → ______________________
4. **Payment account identifier:** what is my `paymentAccountIdentifier`, and in which
   currency is that account? → ______________________
5. **Currency:** can I have a **USD** payment account, or only **RWF**?
   (If only RWF, I charge the RWF equivalent of my prices; see section D.)
   → ______________________
6. **Products / payment items:** I need one product code per row of the table above
   (5 codes). Do I create them in the portal myself, or do you create them?
   Must each product have a fixed price? → ______________________
7. **Notifications (webhook / callback URL):** where do I register it? Mine is:
   `https://tgrihnmngbamxxjnedlc.supabase.co/functions/v1/api/billing/webhook`
   Is the notification signed with the header `irembopay-signature` using my secret key?
   → ______________________
8. **API version:** Menya calls `POST /payments/invoices` with header `X-API-Version: 2`.
   Is version 2 right for a new merchant? → ______________________
9. **Return to the website:** after paying, can the student be sent back to
   `https://menyaneza.com/?checkout=done` automatically (a redirect / return URL on the
   invoice)? → ______________________
10. **Payment methods:** MTN MoMo, Airtel Money, cards: which are on by default?
    → ______________________
11. **Fees:** what percentage or fixed fee per transaction, per method?
    → ______________________ (enter it later as `payment_fee_pct` so the admin page shows real margins)
12. **Settlement:** how often is money paid to my bank, and is there a minimum?
    → ______________________
13. **Refunds:** how do I refund a student, and can it be done from the portal?
    → ______________________
14. **Support contact** for technical questions during integration: → ______________________

## C. After the meeting: switch it on (sandbox first)

1. **Make the 5 products** in the IremboPay portal (sandbox) and note each code.
2. **Make the `IREMBOPAY_PLANS` value:** open `IremboPay plan helper.html` (in the
   Desktop folder), type the 5 codes, the account currency and, for RWF, today's exchange
   rate. Press *Copy*. (Or write it by hand: see the example below.)
3. **Supabase dashboard → Edge Functions → Secrets** (project `tgrihnmngbamxxjnedlc`), add:

   | Name | Value |
   |---|---|
   | `BILLING_PROVIDER` | `irembopay` |
   | `IREMBOPAY_ENV` | `sandbox` |
   | `IREMBOPAY_SECRET_KEY` | the **sandbox** secret key from the portal |
   | `IREMBOPAY_PAYMENT_ACCOUNT` | the payment account identifier |
   | `IREMBOPAY_PLANS` | the text from the helper |

   No code change or redeploy is needed. The server reads secrets when it starts, which
   happens again within a few minutes; if step 5 still shows the old state after ~10
   minutes, redeploy the `api` function once (Edge Functions → `api` → Deploy).
4. **Register the webhook URL** in the IremboPay portal:
   `https://tgrihnmngbamxxjnedlc.supabase.co/functions/v1/api/billing/webhook`
5. **Check the setup:** sign in at https://menyaneza.com → account menu →
   **Administration** → card **Payments (IremboPay setup check)**. It must say
   `irembopay — sandbox`, show no orange warnings, and every row must say *can be paid*.
   A row that says *not set up* has no product in `IREMBOPAY_PLANS`; the pricing page
   simply hides that pay button.
6. **One test payment, end to end:** sign in with a *second* (non-admin) account →
   Plans → *Pay … / month* on Pro → pay on the IremboPay sandbox page with their test
   number → come back to Menya. Within a minute that account's plan must show **Pro**,
   and on the admin page **Billing webhooks → Received (24h)** goes up by 1.
   If the plan doesn't change: Supabase → Edge Functions → `api` → **Logs**, search for
   `webhook_rejected` or `checkout_failed` (the reason is written there; no keys are logged).
7. **Go live:** create the same 5 products in **production**, then change three secrets:
   `IREMBOPAY_ENV` = `production`, `IREMBOPAY_SECRET_KEY` = the production key,
   `IREMBOPAY_PLANS` = the production codes (and `IREMBOPAY_PAYMENT_ACCOUNT` if it differs).
   Register the same webhook URL for production. The admin card now says
   **PRODUCTION (real money)**. Make one small real payment yourself to confirm.

To switch online payment off at any time: delete `BILLING_PROVIDER`. The pricing page
goes back to "email us"; plans already paid for keep running to the end of their period.

## D. Currency

Menya's prices are stored in US dollars. IremboPay charges in the currency of the
payment account, using the `amount` you put in `IREMBOPAY_PLANS`.

- **USD account:** amounts are the dollar prices: 10, 35, 90, 8, 25.
- **RWF account:** amounts are the francs to charge, e.g. at 1 USD = *R* RWF, Pro month
  = 10 × *R*, rounded to a friendly number. The helper page does this. The website still
  shows dollar prices, so it is worth adding "(paid in RWF at about … RWF)" to your
  announcement, or changing the displayed prices later.

Menya only grants the plan if the amount paid is **at least** the configured amount, the
payment is `PAID`, and it went to your payment account; anything else is ignored.

## E. Example `IREMBOPAY_PLANS`

```json
{"pro:month":{"code":"PI-xxxx","amount":14500},
 "pro:semester":{"code":"PI-xxxx","amount":50500},
 "pro:year":{"code":"PI-xxxx","amount":130000},
 "exam:two_weeks":{"code":"PI-xxxx","amount":11600},
 "professional:month":{"code":"PI-xxxx","amount":36000}}
```

(The amounts above are only an illustration at 1 USD ≈ 1,450 RWF; use the codes from the
portal and your own amounts.)

Mistakes are safe: a bad entry is left out and listed in orange on the admin Payments card,
and the tutor keeps working even if the whole value is wrong.
