# Deployment and operations

## Components

| Part | Where it runs | Config |
|---|---|---|
| Web app (`menya/`) | GitHub Pages (static) | `menya/.env` → `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (public values) |
| Database, auth | Supabase project | `supabase/migrations/` |
| API (`supabase/functions/api`) | Supabase Edge Functions | secrets from `supabase/.env.example` |
| Models | Groq, Anthropic (hosted); optional self-hosted OpenAI-compatible server | secrets + `model_configs` table |

## Environment variables

**Web app** (`menya/.env`, baked in at build time, public):

| Variable | Meaning |
|---|---|
| `VITE_SUPABASE_URL` | `https://<ref>.supabase.co`. Leave empty for developer mode. |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key (public by design; RLS protects data). |

**Edge Function secrets** (`supabase secrets set --env-file supabase/.env`, never committed):

| Variable | Meaning |
|---|---|
| `APP_URL` | Public web app URL (invite/checkout links). |
| `ALLOWED_ORIGINS` | Comma-separated browser origins allowed to call the API. |
| `GROQ_API_KEY` | Enables the `small`/`medium`/`strong` roles. |
| `ANTHROPIC_API_KEY` | Enables the `premium` role. |
| `LOCAL_LLM_BASE_URL`, `LOCAL_LLM_API_KEY`, `LOCAL_LLM_JSON_MODE` | Optional self-hosted OpenAI-compatible server (`local_small` role). |
| `BILLING_PROVIDER`, `BILLING_TEST_WEBHOOK_SECRET` | Billing; leave empty until a live adapter exists (BILLING.md). |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected by Supabase. A provider without a
key is skipped by the router; the admin page shows provider health.

## First deployment

Prerequisites: [Supabase CLI](https://supabase.com/docs/guides/local-development), Node 22.18+
(tests run TypeScript directly), a Supabase project. Use a **paid** Supabase plan before taking
payments: free projects pause after inactivity.

```bash
# 1. Database
supabase link --project-ref <ref>
supabase db push                      # applies supabase/migrations in order

# 2. API secrets and function
cp supabase/.env.example supabase/.env   # fill in real values
supabase secrets set --env-file supabase/.env
supabase functions deploy api            # verify_jwt=false is set in config.toml on purpose

# 3. Auth (Supabase dashboard → Authentication)
#    - Site URL and redirect URLs: your GitHub Pages URL
#    - Configure a custom SMTP sender: the built-in mailer is rate-limited and not for production
```

4. **First platform admin**: sign in once through the app, then in the SQL editor run:
   `update public.profiles set platform_role = 'admin' where email = 'you@example.com';`
   There is no default admin account or password.

5. **Web app**:

```bash
cd menya
cp .env.example .env        # set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm ci
npm run deploy              # vite build + gh-pages
```

6. **Scheduled jobs** (SQL editor, requires the `pg_cron` extension):

```sql
select cron.schedule('menya-purge', '15 3 * * *', $$select public.purge_old_messages()$$);
```

## Updating

- Schema: add a new file in `supabase/migrations/` (never edit an applied one), then `supabase db push`.
- API: `supabase functions deploy api`.
- Limits, prices, model assignments: admin page or `admin_update_plan` / `admin_update_model`
  (audited). No redeploy needed; the API caches model configs for 60 s.

## Rollback

- Web app: redeploy the previous commit (`git checkout <sha> && npm run deploy`).
- API: redeploy the previous commit of `supabase/functions`.
- Database: migrations are forward-only. `supabase/rollback/20261024_menya_all.down.sql` drops
  everything these migrations create; it **destroys data**, so use it only on a fresh or test
  project. In production, write a new corrective migration and restore from backup if needed.

## Local development

- **Developer mode** (no backend): `cd menya && npm run dev`, then paste a Groq key.
- **Full stack, no Supabase account needed**:

```bash
cd supabase && npm ci && npm run dev:local        # real API + real SQL in memory on :54321
cd menya && VITE_SUPABASE_URL=http://localhost:54321 VITE_SUPABASE_ANON_KEY=local npm run dev
```

  Sign-in is emulated: in the browser console set the session for a seeded user (learner
  `00000000-0000-4000-8000-000000000001`, admin `…0002`) under `localStorage["sb-localhost-auth-token"]`.
  Model calls are real if `GROQ_API_KEY` is in `menya/.env`.
- **Tests**: `cd supabase && npm test` (51 tests, real Postgres via PGlite, mocked providers).
- **Tutoring evaluation** (live, costs tokens): `cd menya && npm run eval` (see EVALUATION.md).

## Local models (self-hosted)

**Measured environment (2026-10-24):** the only machine available is a laptop with an Intel
Core Ultra 7 155U, Intel integrated graphics (no NVIDIA GPU, no CUDA), 15.5 GB RAM, Windows 11,
Ollama installed. It cannot serve Qwen3-8B/14B/32B to concurrent users, so the `local_small`
role ships **disabled** and all tiers use hosted APIs.

To add a GPU server later:

1. Rent a GPU and measure before committing. Rough weight memory is parameters × bytes per
   parameter (FP16 ≈ 2 bytes; 4-bit ≈ 0.5–0.6 bytes), **plus** KV cache, which grows with
   context length and concurrent sessions. Benchmark on the real card rather than trusting
   this estimate.
2. Serve an OpenAI-compatible endpoint: vLLM for concurrent production traffic, Ollama for a
   single-user pilot. Put it behind TLS and an API key; never expose it to browsers.
3. Set `LOCAL_LLM_BASE_URL` / `LOCAL_LLM_API_KEY` (and `LOCAL_LLM_JSON_MODE=json_object` if
   the server lacks JSON-schema support), then point a role at it and enable it:
   `admin_update_model(actor, 'local_small', '{"model":"qwen3:4b","enabled":true}')`.
4. Run `npm run eval` against it (EVALUATION.md) and compare with the hosted model before routing
   real learners to it. Record time to first token, tokens per second, latency under concurrent
   sessions, VRAM, and educational quality.
5. Local inference is **not free**: put the monthly server, storage, monitoring and maintenance
   cost into `app_settings.monthly_infra_cost_usd` so gross-margin reports include it.

## Monitoring

- **Admin page**: AI spend vs budget, error rate and p95 latency (24 h), heavy users, provider
  health, unit economics and gross margin by plan, webhook counts, audit log, CSV export.
- **Structured logs**: the API logs JSON lines (route, status, duration, provider errors,
  webhook rejections) to the Supabase function logs. Message content and keys are never logged.
- **Alerts**: `admin_usage_alerts()` thresholds live in `app_settings`
  (`monthly_ai_budget_usd`, `user_daily_cost_alert_usd`). Wire them to email or Slack with a
  scheduled function or an external uptime monitor polling `/functions/v1/api/health`.

## Troubleshooting

| Symptom | Check |
|---|---|
| Tutor says "temporarily unavailable" | Admin → provider health; function logs for `provider_error` (kind: auth = bad key, rate_limited = provider quota, timeout) |
| 401 from every API route | `SUPABASE_URL` / service key secrets; the browser session expired (sign in again) |
| CORS errors in the browser | `ALLOWED_ORIGINS` must contain the exact page origin |
| Learner stuck on Free after paying | `payment_events` row status/error; webhook signature rejections in logs |
| Invites not received | SMTP not configured: the institution page shows links to share instead |

## Backup and recovery

- Enable Supabase point-in-time recovery (paid plans) or daily backups, and test a restore into
  a scratch project each quarter.
- Critical tables: `subscriptions`, `payment_events`, `organizations`, `org_members`,
  `usage_records`, `plans`, `model_configs`, `audit_logs`.
- After a restore, replay missed payment webhooks from the provider dashboard. Processing is
  idempotent, so replays are safe.

## Secrets and rotation

- Provider keys and the service-role key live only in Edge Function secrets. The browser has
  only the public anon key.
- To rotate: create the new key at the provider, `supabase secrets set NAME=new`, redeploy or
  wait for the next cold start, then revoke the old key.
- The audit found no secrets in this repository's history. `menya/.env` and `supabase/.env`
  are git-ignored.

## Privacy and retention

- Learners can download all their data (Account → Download my data) and delete their account
  (cascades to profile, sessions, messages and memberships; usage counts are kept anonymised).
- Messages older than `message_retention_days` (default 180) are purged by the scheduled job.
- Organisation admins see aggregates only. Platform admins can see usage and cost per user,
  not conversations.
