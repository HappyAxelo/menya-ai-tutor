# Menya — AI Tutor

Menya is a Socratic AI tutor: it helps learners understand by guiding them to answers with
accurate, specific hints, in their own language (English, French, Kinyarwanda, Kiswahili,
Spanish and more), instead of handing answers over.

The app lives in [`menya/`](menya/) (React + Vite) and the backend in
[`supabase/`](supabase/) (Postgres + one Edge Function).

## What it does

- **Guided tutoring**: one step at a time; concept questions get a direct explanation; problems
  are guided, never solved for the learner.
- **Three progressive hints per problem**: concept → relationship → next step, chosen by the server.
- **Learner actions** under each reply: explain more simply, worked example (a similar problem
  with a different answer), check my answer, similar practice question, summary.
- **Accurate hints**: the model solves each problem privately first; a server-side guard stops
  replies that would reveal the final answer.
- **Worked solutions are earned**: shown after the learner solves it, after all three hints plus
  a genuine attempt, or on request after two genuine attempts (institutions can turn them off).
- **Real progress**: a solve is recorded only when the learner's own answer matches the tutor's
  verified answer (checked on the server). Practice questions solved without hints or worked
  examples show a topic as understood. Messages and explanations never count.
- **History**: every conversation is saved to the account. A sidebar (a drawer on phones) lists
  them by day; opening one continues it where it stopped, and a page refresh reopens it.
- **Any language**: replies follow the learner's language, or a language they pick.
- **Plans**: Free, Pro and Professional with server-enforced daily, monthly and
  advanced-reasoning allowances. Limits are shown to learners; nothing is "unlimited".
- **Institutions**: seats, invitations, roster CSV import, aggregate learning analytics
  (never individual conversations), shared monthly allowance.
- **Admin**: usage, estimated AI cost, estimated revenue and gross margin by plan, provider
  health, plan and model configuration, audit log, CSV export.
- **Privacy**: data export and account deletion; message retention limit.

## Two ways to run it

| Mode | When | How |
|---|---|---|
| **Commercial** | Production | `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` set; accounts, plans and server-side tutoring |
| **Developer** | Trying the tutor | No backend config; paste your own Groq key (held in memory only) |

```bash
cd menya && npm install && npm run dev      # developer mode on http://localhost:5173/
```

Full stack locally without a Supabase account, and production deployment: see
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Status: not yet ready for paying customers

Working and tested: entitlements, quotas, premium allowance, model routing and fallbacks,
the answer guard, institutions, admin reports, webhook verification and idempotency, account
deletion. **Still required before taking money:**

1. A Supabase project on a paid plan, with migrations applied and the `api` function deployed.
2. A payment provider that can onboard the business, plus its adapter (see [docs/BILLING.md](docs/BILLING.md)).
   Until then checkout clearly says online payment isn't available.
3. Custom SMTP for sign-in and invitation emails.
4. Native-speaker review of Kinyarwanda and Kiswahili tutoring quality
   (see [docs/EVALUATION.md](docs/EVALUATION.md)).
5. Terms of service, privacy policy and refund policy; then a load test of quota enforcement
   against the real database.

## Documentation

- [Architecture and request flow](docs/ARCHITECTURE.md)
- [Deployment, operations, local models, backups](docs/DEPLOYMENT.md)
- [Billing and payment providers](docs/BILLING.md)
- [Tutoring quality evaluation](docs/EVALUATION.md)

## Tests

```bash
cd supabase && npm install && npm test      # 51 tests on real Postgres (PGlite), mocked model providers
cd menya && npm run build                   # production build
cd menya && npm run eval                    # live tutoring evaluation (needs GROQ_API_KEY in menya/.env)
```

## License

MIT
