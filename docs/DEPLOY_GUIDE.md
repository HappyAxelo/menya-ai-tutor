# Deploying Menya AI for many students

Everything you need, in order. Each step says what you do, where, and how to check it worked.
Steps marked **(owner)** need your own accounts or credentials; nobody else can do them.

## What you already have

| Piece | Where it runs | Cost |
|---|---|---|
| Website | GitHub Pages: https://happyaxelo.github.io/menya-ai-tutor/ | free |
| API + database + sign-in | Supabase project `tgrihnmngbamxxjnedlc` | free tier |
| AI model | Groq (free tier) — and your HPC cluster once set up | free |
| Payments | IremboPay (you need a merchant account) | per-transaction fee |
| Source code, tests, docs | GitHub `HappyAxelo/menya-ai-tutor` (and this folder) | free |

## Accounts you need

1. **GitHub** (have it) — the code and the website.
2. **Supabase** (have it) — dashboard access to project `tgrihnmngbamxxjnedlc`.
3. **Groq** (have it) — the API key is already a Supabase secret.
4. **IremboPay merchant account (owner)** — https://irembopay.com; business registration (RDB),
   a payment account in RWF, products per plan.
5. **University HPC account (owner)** — with a GPU allocation; ask your HPC support team.
6. Optional: a domain name (e.g. menya.rw) and Resend for emails — later, when you choose to pay.

## Step 1 — Database update (Supabase)

Three new migrations must be applied, in order:

```
supabase/migrations/20261029000008_menya_feedback_analytics.sql
supabase/migrations/20261029000009_menya_hpc_model.sql
supabase/migrations/20261029000010_menya_tutoring_engine.sql
```

Supabase dashboard → SQL editor → paste each file → Run (or `supabase db push` with the CLI).
Check: Table editor shows `tutor_feedback`, `learner_objectives`, `assessment_attempts`.

## Step 2 — API function

Deploy `supabase/functions/api` (bundle: `cd supabase && npm run bundle:api`, then deploy
`dist/api/index.ts` with `deno.json`, **verify_jwt off**). Check:
`https://tgrihnmngbamxxjnedlc.supabase.co/functions/v1/api/health` → `{"ok":true,"tutorReady":true}`.

## Step 3 — Website

```bash
cd menya
npm ci
npm run deploy      # builds with .env.production and publishes to GitHub Pages
```

(If Windows complains "Filename too long", run `set CACHE_DIR=C:\ghp` first.)
Check: the site loads, the tab shows "Menya AI", and a conversation shows Learn / Explain.

## Step 4 — Make yourself admin (once)

Sign in on the site, then in Supabase SQL editor:
```sql
update public.profiles set platform_role = 'admin' where email = 'muyombanohappy@gmail.com';
```
Check: the account menu shows **Administration**: learners per plan (free, pro, professional),
feedback summary, and **Download Excel (learners + feedback)**.

## Step 5 — Payments with IremboPay (owner)

Follow `docs/BILLING.md` → *IremboPay*. Summary: create products in the merchant portal, set the
callback URL, add the five Supabase secrets, set prices in the `plans` table, do one **sandbox**
payment end to end, then switch `IREMBOPAY_ENV=production`.

## Step 6 — AI model on the university HPC (owner)

Follow `docs/HPC.md`. Summary: add `HPC_REGISTER_SECRET`, `LOCAL_LLM_API_KEY`,
`LOCAL_LLM_JSON_MODE` to Supabase secrets; copy the `hpc` kit to the cluster; `setup.sh`,
`check-network.sh`, `start.sh`. Check: admin → Model providers → `openai_compatible` green.

## Step 7 — Before inviting many students

- [ ] Run the tests: `cd supabase && npm test` and `cd menya && npm test` (all pass).
- [ ] Try the full flow yourself on a phone: sign in, a problem, wrong answer, "I'm stuck",
      "Check yourself", Explain mode, feedback buttons, progress page, review.
- [ ] Native speakers review the Kinyarwanda and Kiswahili texts.
- [ ] Check the free-tier limits on supabase.com/pricing and console.groq.com (database size,
      monthly active users, Edge Function invocations; Groq per-model limits) — they change. With the HPC running, free-plan
      tutoring doesn't use Groq.
- [ ] In Supabase Auth: add a custom SMTP sender if you use email links (the built-in mailer
      sends only a few emails per hour).
- [ ] Privacy page reviewed; consent wording for students.
- [ ] Watch admin → Alerts (error rate, latency) for the first week.

## Step 8 — Growing

| Students active per day | What to watch / change |
|---|---|
| up to ~100 | Free tiers are enough; HPC optional |
| 100–1,000 | Keep an HPC job running; Groq absorbs gaps; watch Supabase usage |
| 1,000+ | Supabase Pro (paid), a second HPC job (needs load balancing, see LIMITATIONS), custom domain |

For universities: create an organisation in admin (seats, roster CSV invites); their students
get the plan through the institution (no individual payments).

## Where things are documented

| Topic | File |
|---|---|
| How the tutoring engine works | `docs/ENGINE_DESIGN.md` |
| Audit of the tutoring before the engine | `docs/TUTORING_AUDIT.md` |
| Demonstration (maths, programming, electronics) | `docs/DEMO.md` |
| Evaluation plan vs general-purpose AI | `docs/EVALUATION_PLAN.md` |
| Limitations and what is unverified | `docs/LIMITATIONS.md` |
| Costs and pricing method | `docs/COSTS_AND_PRICING.md` |
| Payments (IremboPay) | `docs/BILLING.md` |
| HPC model server | `docs/HPC.md` |
| Everything that changed | `docs/CHANGELOG.md` |
