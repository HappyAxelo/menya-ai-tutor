# Plans and subscriptions

How plans, limits and payments work. The plans table in the database is the one source: the server
enforces it and the pricing page and dashboard display it. Change a limit in **Admin → Plan limits**.

| | Free | Pro | Exam Pass | Max |
|---|---:|---:|---:|---:|
| Price | $0 | $5 / month | $5 / 14 days | $8 / month |
| Tutor messages a day | 20 | 150 | 1,000 | 1,000 |
| Tutor messages a month | 300 | 3,000 | 10,000 | 20,000 |
| Pictures and diagrams a day | 1 | 3 | 10 | 10 |
| Conversation length | 30 | 80 | 120 | 150 |
| Conversation memory setting | 10 | 24 | 30 | 40 |
| Explanations | Standard | Detailed | Detailed | Detailed |
| Saved course notes | 3 | 30 | 30 | 30 |
| Messages a minute | 6 | 15 | 20 | 30 |
| Practice exams a day | 30 | 30 | 30 | 30 |

The plan's internal id stays `professional`: IremboPay's product key `professional:month`, transaction
code `PRF` and existing records use it. Learners see "Max". All plans use the same AI model.

## Rules

- **Counters** are per account in the database, by UTC day and month, so logging out or changing device
  changes nothing. UTC midnight is 2:00 AM in Kigali.
- **Expiry** is automatic: a plan counts only while its period is live, then the learner drops to whatever
  else is live, or Free. History stays.
- **Renewing** is manual. IremboPay doesn't support recurring mobile money through its API, so each payment
  buys one period. There is a reminder in the app in the last 3 days. There are no emails yet.
- **Paying early** for the same plan adds the new time to the end of what's left.
- **Upgrading or adding an Exam Pass** starts when payment is confirmed. Days left on the other plan keep
  counting down at the same time; if any remain when the new plan ends, that plan carries on. They aren't
  refunded or moved. This is stated on the pricing page.
- **Buying a lower plan** that would end before a live higher plan is refused before any money moves.
- **Cancelling** means not paying again. Refunds are by hand (IremboPay only refunds duplicates).

**Status** shown to learners comes from `subscriptions` (active, cancelled, expired) and `payments`
(pending, paid, failed, cancelled; pending older than 25 hours shows as not completed).

## Payments

Nothing about how Menya talks to IremboPay changed in this update: same endpoints, headers, invoice
request, transaction reference, signature check, setting names and direct invoice check. Added:

- `payments` table: a row when checkout starts (pending), updated by authenticated notifications only.
- `createCheckout` also returns the reference and amount it already sent, so the row can be written.
- Renewal arithmetic in the webhook route, and a refusal for purchases that couldn't be used.

**A plan is granted only when** the notification is correctly signed, is `PAID`, is for our account at the
configured amount or more, and IremboPay's own invoice record confirms all of that. A browser redirect
grants nothing. Duplicates are ignored, and a paid record can't later turn into failed.

**Amounts:** what students pay is `IREMBOPAY_PLANS` in Supabase, not the dollar price on the page. Set it
to the francs for $5, $5 and $8 with the helper page. The pay buttons show those francs.

### Differences found between IremboPay's documents

Handled safely, but ask IremboPay to confirm:

1. **Payment statuses.** Their email says they notify failed and cancelled payments; the API documentation
   lists only `NEW` and `PAID`, and doesn't give the words used. Menya grants only on `PAID`, and records
   `FAILED`, `CANCELLED` and `CANCELED` in the history. Anything else stays pending, then shows as not completed.
2. **Payment method names.** The docs list `MTN_MOMO` etc.; their sample notification shows `MOMO_PUSH`. Menya
   stores whatever is sent, so revenue by method may show both.
3. **Test keys.** The docs say they are shared at signup; the email says after the onboarding fee.

Not yet tried against IremboPay's real sandbox, which needs the onboarding fee.

## Deploying this update

1. Apply `supabase/migrations/20261103000018_menya_pro_exam_max.sql`. The running server keeps working with it.
2. Deploy the `api` function pinned to the commit. No new secrets.
3. Publish the site (`cd menya && npm run deploy`).
4. Check: `/plans` shows Max at 800 and pictures of 1, 3, 10, 10; the pricing page reads correctly.

**Rollback:** the steps are in the migration's header. Redeploy the previous function commit and republish
the previous site. Dropping `payments` loses payment history, so export it first once real payments exist.

**Environment variables:** none new. `BILLING_PROVIDER`, `IREMBOPAY_SECRET_KEY`, `IREMBOPAY_PAYMENT_ACCOUNT`,
`IREMBOPAY_PLANS`, `IREMBOPAY_ENV` and optional `IREMBOPAY_CURRENCY` are unchanged. **External:** in the
IremboPay portal the three products' prices must match `IREMBOPAY_PLANS`.

## Not done

- Reminders are in the app only. Email or SMS needs a sending service.
- Voice, photo and picture use is counted but not priced, so AI cost per student leaves it out.
- Voice and photo limits are one setting for every plan (60 and 30 a day), not per plan.
- Heavy users are listed for review (`heavy_user_daily_requests`, default 300 messages a day); nothing is
  blocked automatically beyond the published limits, and no alert is sent.
