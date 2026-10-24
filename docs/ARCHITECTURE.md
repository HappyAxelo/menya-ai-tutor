# Menya architecture

## Before this upgrade (audit, 2026-10-24)

- A static React + Vite single-page app (`menya/`) deployed to GitHub Pages.
- Each student pasted their **own Groq API key** into the browser; the browser called Groq directly.
- No backend, database, accounts, plans, payments or tests.
- The repository root held a stale duplicate of the app (`App.jsx`, `index.html`, …) with
  **unresolved merge-conflict markers**; it does not build. The deployable app is `menya/`.
- No secrets were found in the Git history.

## Now

```
Browser (menya/, GitHub Pages)
  │  Supabase Auth (email link) ── session JWT
  ▼
Edge Function "api" (supabase/functions/api)          Postgres (supabase/migrations)
  ├─ authenticate JWT ─────────────────────────────►  auth.users, profiles
  ├─ resolve entitlement ──────────────────────────►  resolve_entitlement(): plans + subscriptions + org seats
  ├─ reserve quota (atomic, idempotent) ───────────►  consume_quota(): day/month/premium/org counters, rate limit
  ├─ classify difficulty → route (router.ts) ──────►  model_configs (roles, prices, fallbacks)
  ├─ call provider (providers.ts)  ── Groq / Anthropic / OpenAI-compatible local server
  ├─ answer-leak guard (answerGuard.ts), one rewrite
  ├─ persist conversation (no private fields) ─────►  tutoring_sessions, tutoring_messages
  ├─ record usage + estimated cost ────────────────►  usage_records (no message content)
  └─ respond (public fields only)
```

The browser never sees provider keys, model names, the model's private solution, or anyone
else's data. It can read only its own rows (row-level security) and can write nothing that
affects money, quotas or roles.

### Request flow for one tutor message

1. **Authentication**: the API verifies the Supabase JWT (`getUser`).
2. **Entitlement**: `resolve_entitlement(user)` picks the best live plan from a personal
   subscription, an institutional seat, or Free. Billing states are applied here (see below).
3. **Quota**: `consume_quota(user, request_id, premium)` atomically increments the daily,
   monthly, premium and organisation counters, or refuses with a reason (`daily_limit`,
   `monthly_limit`, `premium_limit`, `premium_not_included`, `org_limit`, `rate_limited`,
   `duplicate_request`). A repeated `request_id` is never charged twice.
4. **Classification**: `classifyDifficulty()` (message signals plus the model's own rating
   from the previous turn) gives `basic | standard | complex`.
5. **Routing**: `planRoute()` returns up to three candidates per plan policy (below), skipping
   disabled models, providers without credentials, and premium when the allowance is used.
6. **Model call**: the provider adapter enforces a timeout; retryable errors are retried once,
   then the next candidate is tried. If all fail, the quota reservation is released and the
   learner is told the message was not counted.
7. **Socratic validation**: the model returns its verified final answer in a private field.
   If the reply reveals it (and the learner hasn't earned a worked solution), the model is
   asked once to rewrite; if it still leaks, a safe generic next-step prompt is sent.
8. **Persistence and metering**: messages are stored without private fields; a usage record
   stores provider-reported tokens, estimated cost, latency, fallback and rewrite flags.

### Plan routing policies

| Policy | Ordinary tutoring | Complex questions | Allowed roles (incl. fallbacks) |
|---|---|---|---|
| free | `local_small` if enabled, else `small` | same | local_small, small, medium |
| pro | `medium` | `strong` | local_small, small, medium, strong |
| professional | `strong` | `premium` while allowance remains, else `strong` | all |

Roles map to concrete models in the `model_configs` table, editable by platform admins without
a code change. Configured at launch (2026-10):

| Role | Provider | Model | Notes |
|---|---|---|---|
| small | Groq | `openai/gpt-oss-20b` | reasoning effort medium; $0.075 / $0.30 per M tokens |
| medium | Groq | `openai/gpt-oss-120b` | reasoning effort medium; $0.15 / $0.60 |
| strong | Groq | `openai/gpt-oss-120b` | reasoning effort high |
| premium | Anthropic | `claude-opus-5-5` | effort medium; $4 / $20; counts against the premium allowance |
| local_small | OpenAI-compatible | `qwen3:4b` | **disabled**: no GPU server exists yet (see DEPLOYMENT.md) |

No quantization is configured: all enabled models are hosted APIs. Qwen3 sizes from the spec
are not deployed because the only available machine has no NVIDIA GPU (Intel integrated
graphics, 16 GB RAM); see "Local models" in DEPLOYMENT.md.

### Subscription states → access

| State | Paid access |
|---|---|
| `active`, `trialing` | until `current_period_end` |
| `past_due` | until `current_period_end` + `past_due_grace_days` (default 3) |
| `canceled` | until the end of the paid period only |
| `expired`, `refunded`, `incomplete` | none |

Only `process_payment_event()` (called after a webhook signature check) and audited
platform-admin grants (`provider = 'manual'`) write subscriptions. Events are idempotent
(`unique(provider, provider_event_id)`) and an older event can't undo a newer one.

### Institutions

`organizations` → `org_members` (role `org_admin | learner`, `seat_assigned`) →
`org_invitations` (only a SHA-256 of the token is stored; tokens are single-use, expire in
14 days, and work only for the invited email). Purchased seats, assigned seats, monthly
active learners and actual usage are tracked separately. An optional organisation-wide
monthly pool caps total usage on top of each learner's plan limits. Organisation admins see
aggregates (concept counts, activity), never conversation text. Every org function checks
the actor's role inside the database.

## Code map

| Path | What |
|---|---|
| `supabase/migrations/` | Schema, entitlement/quota/billing functions, RLS, grants |
| `supabase/functions/_shared/policy.ts` | The tutoring policy every model follows (also used by the web app's developer mode) |
| `supabase/functions/_shared/router.ts` | Difficulty classification and plan routing |
| `supabase/functions/_shared/providers.ts` | Provider adapters (Groq, Anthropic, OpenAI-compatible), timeouts, errors, cost estimate |
| `supabase/functions/_shared/answerGuard.ts` | Final-answer leak detection |
| `supabase/functions/_shared/tutorService.ts` | The tutor request pipeline |
| `supabase/functions/_shared/billing.ts` | Billing provider interface and the HMAC test provider |
| `supabase/functions/_shared/api.ts` | HTTP routes, auth, CORS, safe errors |
| `supabase/functions/api/index.ts` | Deno entry point wiring real clients |
| `supabase/tests/` | 51 tests on real Postgres (PGlite) with scripted providers |
| `supabase/dev/local-server.ts` | Runs the full stack locally without Supabase |
| `menya/src/App.jsx` | Tutor UI (commercial client or developer mode) |
| `menya/src/commercial/` | Sign-in, pricing, account, institution, admin pages |
| `menya/scripts/eval-tutor.mjs` | Live multilingual / multi-model tutoring evaluation |
