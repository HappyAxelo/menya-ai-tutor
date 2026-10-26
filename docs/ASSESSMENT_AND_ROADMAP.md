# Menya AI — technical assessment, pilot plan and roadmap

Date: 26 October 2026. Source inspected: `main` = `ecb4c4c` on
https://github.com/HappyAxelo/menya-ai-tutor. Live: https://happyaxelo.github.io/menya-ai-tutor/
(Supabase project `tgrihnmngbamxxjnedlc`).

"Verified" below means it was run or observed during this review; everything else is labelled.

---

## A. Current-state technical assessment

### Architecture (as it actually is)

```
Browser (React 18 + Vite 5, GitHub Pages, base /menya-ai-tutor/)
   │  Google sign-in / email link (Supabase Auth)      no AI keys in the browser
   ▼
Supabase Edge Function "api" (Deno, one function, verify_jwt off — it checks JWTs itself)
   │  validate → entitlement → session → atomic quota → route → model call
   │  → answer-leak guard → verified-solve check → persist → usage + cost record
   ├─► Groq  openai/gpt-oss-120b   (all plans today; key = server-side secret)
   ├─► Anthropic claude-opus-5-5   (Professional "premium" role; no key configured)
   ▼
Supabase Postgres (row-level security on every table; pg_cron purge after 180 days)
```

There are two apps in the repository:

| Path | What it is | Built / deployed? |
|---|---|---|
| `menya/` | The real product (sign-in, tutor, history, progress, plans, institution and admin pages) | Yes — `menya/dist` is what GitHub Pages serves |
| repository root (`App.jsx`, `main.jsx`, `index.html`, `package.json`, `vite.config.js`) | The original single-file bring-your-own-key prototype | No — but its `npm run deploy` targets the same GitHub Pages site |

### Feature status

| Component | Current implementation | Status | Problem | Recommended action |
|---|---|---|---|---|
| Build (`menya/`) | `npm ci && npm run build` | IMPLEMENTED AND VERIFIED | — | Keep; run in CI |
| Live = source | Local build hash `index-8FdvxIdA.js` equals the live bundle | IMPLEMENTED AND VERIFIED | Deploys are manual from a laptop | CI build; documented deploy |
| Root prototype | `App.jsx` with 3 unresolved conflict blocks | BROKEN (verified: parser error at line 157) | Root `npm run deploy` would publish it over the live site; it calls a retired Groq model | Resolve conflicts; make root scripts delegate to `menya/` (Phase A) |
| Merge-conflict markers in `menya/` | — | VERIFIED ABSENT | — | CI check |
| AI access | Central server-side Groq key; no student keys | IMPLEMENTED AND VERIFIED (health `tutorReady: true`; 6/6 live requests succeeded) | Groq free tier: 8,000 tokens/min, 200,000/day (verified on Groq's rate-limit page) | Owner: paid Groq tier before any class use |
| BYOK | Only in local developer mode (`import.meta.env.DEV`) | IMPLEMENTED AND VERIFIED | Dev-mode screen code still ships in the production bundle (unreachable) | Low priority |
| Auth | Google OAuth (live), email link (needs SMTP) | Google: VERIFIED to the Google consent page; signed-in use verified via DB records | Email links only reach the owner (no SMTP) | Owner: Resend (docs/OWNER_SETUP.md §5) |
| Quotas, rate limit, idempotency | Atomic SQL `consume_quota`, per-minute buckets, request ids | IMPLEMENTED AND VERIFIED (62 backend tests incl. concurrency) | — | Keep |
| Usage + cost metering | `usage_records` per request | IMPLEMENTED AND VERIFIED (live rows: avg 1,931 in / 316 out tokens, $0.00048/reply) | — | Keep |
| Spending cap | Per-plan request caps; org pool caps | IMPLEMENTED BUT UNVERIFIED live | No global daily $ cap / alert to the owner | Phase B: daily budget guard + alert |
| Request time budget | Client gives up at 60 s; server can spend 2×45 s (+rewrite) on Free, >150 s on Pro/Professional | **DEFECT (verified by reading code + live config)** | Edge function killed at the platform limit → quota stays consumed, no usage record, student sees "Not sent" | Phase A: one server deadline below the client timeout |
| Socratic policy | One shared policy (`policy.ts`), 3 server-chosen hint levels, actions (simpler, example, check, practice, summary) | IMPLEMENTED AND VERIFIED (local, real model) | Concept-vs-problem misread: "How do I differentiate x²·sin x?" got both derivative pieces | Phase B prompt + eval case |
| Answer-leak guard | Private verified answer + server check + rewrite | IMPLEMENTED AND VERIFIED (tests + live eval) | Cannot catch the tutor *wrongly rejecting* a correct answer (Spanish case 1/3) | Phase B eval + rule work |
| Misconceptions | `misconceptionDetected` text field | PARTIALLY IMPLEMENTED | Free text; no evidence/concept/type structure | Phase B structured diagnosis |
| Progress | `learning_events` written only on server-verified solves; help vs independent; practice questions | IMPLEMENTED AND VERIFIED locally; live table exists, 0 events yet | No per-concept objective, no delayed re-check | Phase B |
| "Reasoning graph", "mastery %" | Removed in the previous pass (were driven by chat activity) | VERIFIED ABSENT | — | Do not rebuild until evidence exists (see D) |
| History / persistence | Server-side sessions; sidebar; reopen + continue; refresh restores | IMPLEMENTED AND VERIFIED locally; live UI not yet exercised signed-in | — | Owner live test |
| Error states | Retry, offline banner, 60 s timeout, plan-limit messages | IMPLEMENTED AND VERIFIED locally | Rate-limit message does not say how long to wait | Phase A |
| Mobile | 375 px: no horizontal scroll, 16 px input, header fits | VERIFIED (emulated) | Not tested on a real low-end Android or 3G | Phase B device test |
| Accessibility | Labels, focus, reduced motion, text status | PARTIALLY VERIFIED (automated checks only) | No screen-reader or contrast audit | Phase B |
| Bundle | First load ≈ 142 KB gzip JS + 7 KB CSS; Markdown/KaTeX 121 KB gzip lazy on first reply | VERIFIED | Acceptable on 3G (~2–4 s) | Keep; measure on device |
| Tests | 62 backend (PGlite), 7 frontend logic, live multilingual eval (8 cases) | VERIFIED | No CI; no UI-level tests; eval set small | Phase A CI; Phase B dataset |
| Dependencies | `npm audit --omit=dev`: 4 low (KaTeX prototype-pollution affecting `trust`, which Menya leaves off) | VERIFIED | Dev-only tooling: 6 high (local dev server) | Track; no forced upgrades |
| Hosting availability | Supabase **Free** project | VERIFIED | Free projects pause after 1 week of inactivity (Supabase pricing page) | Owner: Supabase Pro ($25/mo) before the pilot |

---

## B. Findings register

Severity: P0 = blocks a pilot / risks harm; P1 = must fix before pilot; P2 = before institutional rollout; P3 = later.

| # | Finding | Severity | Evidence | Impact | Remediation | Verification |
|---|---|---|---|---|---|---|
| F1 | Groq free tier: 8K tokens/min ≈ 3 replies/min for everyone | P0 | Groq rate-limit docs; eval exhausted the daily limit on 25 Oct | A class of 50 gets "unavailable" within a minute | Owner upgrades Groq; confirm limits on the account's limits page | Load test: 20 concurrent students, 0 rate-limit errors |
| F2 | Supabase Free pauses after 7 idle days | P0 (for pilot) | Supabase pricing page | Pilot outage after a quiet week | Owner upgrades to Pro | Project shows Pro; no pause |
| F3 | Server time budget exceeds client and platform limits | P1 | `tutorService.ts` 2 tries × `timeout_ms` (45–90 s) + rewrite; client 60 s | Charged-but-failed requests; lost usage records | One request deadline (55 s) shared by all model calls; client 75 s | New tests with a hanging provider |
| F4 | Root prototype: conflict markers + deploy script aimed at the live site + retired model | P1 | `App.jsx:157,225,298`; root `package.json` `deploy` | A mistaken `npm run deploy` at the root replaces the product | Resolve conflicts (Groq side); root scripts delegate to `menya/` | Root parses; root `npm run build` builds `menya/` |
| F5 | No CI | P1 | No `.github/workflows` | Regressions reach `main` unnoticed | GitHub Actions: tests, build, conflict-marker and secret checks | Workflow green on push |
| F6 | Rate-limit errors don't tell the student when to retry | P2 | 503 body has no wait time | Students retry immediately and fail again | Pass `retry_after_seconds`; UI shows it | Test |
| F7 | Concept-vs-problem misread leaks method + pieces | P1 (pedagogy) | Local test 25 Oct | Undermines "earn the solution" | Policy rule + eval case | Eval |
| F8 | Tutor can reject a correct answer under another convention | P1 (pedagogy) | Eval: Spanish case 1/3 | Wrongly marks students wrong | Rules added; needs dataset + human review | Eval ≥ 9/10 on convention cases |
| F9 | Misconception output is unstructured | P2 | `policy.ts` schema | Can't evaluate or aggregate | Structured fields (statement, concept, type, evidence) | Unit + eval |
| F10 | No global spend guard / owner alert | P2 | No such code | Surprise bill if abused | Daily budget in `app_settings` + admin alert | Test |
| F11 | Email sign-in limited to owner | P2 | Supabase built-in mailer | Students without Google can't sign in | Owner: Resend | Manual test |
| F12 | No consent, feedback or research export for a study | P1 (pilot) | Not present | Can't run an ethical pilot | Phase B | Review with ethics board |

---

## C. Recommended architecture for a controlled pilot

Keep the current architecture. It already has what a 50–100 student pilot needs; adding services would
add cost and failure points without adding evidence.

| Component | Keep / change | Why |
|---|---|---|
| React on GitHub Pages | Keep | Free, CDN, no server to run |
| Supabase Auth (Google) | Keep | Students already have Google accounts |
| One Edge Function | Keep; fix the time budget | Serverless suits bursty class use; no idle cost |
| Postgres + RLS | Keep; upgrade project to Pro | Needed for history, quotas, metering, progress |
| Groq gpt-oss-120b | Keep; paid tier | $0.15/$0.60 per M tokens (verified), fast |
| Monitoring | Supabase logs + `usage_records` + admin page; add a free error tracker later | Enough for 100 students |
| Not now | Kubernetes, microservices, separate API server, graph DB, LMS integration | No demonstrated need |

---

## D. AI tutoring improvement plan

Current sequence (implemented): first reply asks what the student knows → one step per reply →
three server-chosen hint levels (concept → relationship → set-up step with a blank) → check answer →
worked example of a *different* problem on request → full solution earned (solved, or 3 hints + an
attempt, or 2 genuine attempts) → practice question → summary.

Next steps, in order:

1. **Request-type routing fix (F7).** Treat "how do I [verb] <specific expression>" as a problem, not a
   concept question. Add 6 eval cases.
2. **Structured misconception diagnosis (F9).** Replace the free-text field with
   `{ studentStatement, misconception, concept, kind: "misconception" | "slip" | "incomplete" | "ambiguous", evidence, followUp }`.
   Only `misconception` counts as one; slips and incomplete answers are handled differently.
3. **Answer-checking robustness (F8).** Convention/ambiguity cases in the dataset; a second-pass self-check
   when the model is about to mark a numeric answer wrong that differs only by an off-by-one, rounding or unit.
4. **Evaluation dataset (Phase B).** 60–80 labelled multi-turn cases across maths (algebra, calculus,
   probability, statistics), physics, CS and EE, plus behaviour cases (direct-answer requests, bypass
   attempts, repeated mistakes, long conversations). Rubric of 10 dimensions scored 0–2 by two raters on a
   20% sample, model-graded on the rest with spot checks. Same questions to a general assistant for comparison.
5. **Mastery model (after the dataset exists).** Per concept: verified solves, independent solves,
   practice solves, hints/examples used, last success, and a *delayed re-check* (a practice question
   ≥ 3 days later). Show three separate things: tutor's estimate (labelled as such), demonstrated
   performance (server-verified), and assessment results (pilot pre/post tests). No single "mastery %".
6. **Concept map (instead of the removed reasoning graph).** Only once concepts are normalised per course
   (a small curated list per pilot course with prerequisites). Until then, a graph would be decorative.

---

## E. Security and privacy plan

**BYOK vs central access.** Students no longer enter keys. BYOK remains only for local development.

| | A: student keys (old) | B: central backend (current) |
|---|---|---|
| Onboarding | Create a provider account, paste a key | Sign in with Google |
| Key exposure | Key in the browser; any XSS or extension can read it | Key only in Supabase secrets |
| Cost control | None (student pays, or leaks) | Per-user, per-plan, per-institution quotas; metered |
| Institutional control | None | Seats, pools, reports |
| Abuse | Unbounded | Rate limit, quotas, idempotent requests |
| Verdict | Demo only | Required for a pilot (in place) |

In place: server-side secret; JWT verified per request; input validation (UUIDs, lengths, enums);
RLS on every table; private answer never sent to the browser; CORS limited to the site; message
retention 180 days; data export and account deletion; no message content in logs.

To add before the pilot: global daily spend guard (F10), consent text and research-data export
(F12), privacy policy reviewed for Rwanda's data-protection law (Law No. 058/2021) by a qualified person.

---

## F. Testing plan

| Layer | What | Where | Status |
|---|---|---|---|
| Database rules | entitlements, quotas, concurrency, RLS, billing states, rollback | `supabase/tests/db-rules.test.ts` | Passing (verified) |
| Tutor pipeline | routing, fallbacks, leak guard, hints, actions, verified solves, practice, time budget | `supabase/tests/tutor-service.test.ts` | Passing; time-budget tests added in Phase A |
| API | auth, CORS, webhooks, admin/org routes | `supabase/tests/api.test.ts` | Passing |
| UI logic | actions, history mapping, progress, grouping | `menya/tests/chat.test.mjs` | Passing |
| AI behaviour | multilingual live eval | `menya/scripts/eval-tutor.mjs` | 7/8 last full run; dataset to grow (D4) |
| CI | all of the above except live eval | `.github/workflows/ci.yml` | Added in Phase A |
| Manual | learner journey on a real Android phone on 3G; screen reader (TalkBack) | checklist below | Not done |

Manual learner-journey checklist (each step: expected result, pass/fail): sign in with Google → ask a
problem → wrong answer via *Check my answer* (mistake named, value withheld) → hint ×3 (each more
specific) → correct answer (verified chip) → *Try a similar question* → solve without help → Progress
shows "Shown on your own" → close tab, reopen on another device → conversation in the sidebar, continue
it → airplane mode → offline banner → reconnect → retry works.

---

## G. University pilot plan (50–100 students)

**Scope.** One university, two first-year courses with problem-based content (e.g. Calculus I and
Circuit Analysis I), 4 weeks, 3–4 topics per course with written learning objectives.

**Design: within-subject crossover.** Each student uses Menya for half the topics and their usual study
method for the other half; the assignment is counterbalanced (group 1: Menya for topics A and C; group 2: Menya
for topics B and D). This controls for student ability and needs fewer students than two separate groups.

**Measures.**
- Pre-test and post-test per topic (parallel forms, same difficulty), including one *transfer* item
  (unfamiliar problem) per topic.
- Delayed retention test 2–3 weeks after the last topic.
- Usage: sessions, verified solves, hints/examples used, abandonment (`usage_records`, `learning_events`).
- Experience: SUS usability questionnaire, short frustration rating, 8–10 interviews.
- Cost per student (from `usage_records`).

**Sample size.** For a paired comparison (Menya topics vs usual-study topics) with α = 0.05 and 80% power:
effect d = 0.4 needs ≈ 52 students; d = 0.3 needs ≈ 90. Plan for 80–100 enrolled to allow ~20% drop-out.
A two-group design would need ≈ 64 *per group* for d = 0.5. Treat any result as a pilot estimate,
not proof of effectiveness.

**Ethics and consent.** Approval from the university's research ethics committee; written consent;
participation voluntary and not graded; data pseudonymised for analysis; students can withdraw and
delete data.

**Acceptance thresholds (proposed, to agree with the university).**

| Metric | Threshold | Why |
|---|---|---|
| Availability during the pilot | ≥ 99% of scheduled hours | Students lose trust after one failed session |
| Tutor request error rate | < 2% (excluding plan limits) | Measured in `usage_records` |
| Median reply time | < 6 s; 95th percentile < 15 s | Longer waits break the study flow on mobile |
| SUS usability score | ≥ 70 | Standard "good" benchmark |
| Session completion | ≥ 60% of problems reach a verified solve or summary | Abandonment signals confusion or frustration |
| Learning | Post-test gain on Menya topics ≥ usual-study topics, CI reported | The core claim; no significance claimed in advance |
| AI cost | ≤ $0.50 per student per month | Sustainable for institutional pricing (see H) |
| Privacy | Zero incidents; consent for 100% of analysed data | Non-negotiable |
| Support | < 1 support request per 10 students per week | Measures onboarding quality |

---

## H. Cost model

Verified prices (26 Oct 2026): Groq `openai/gpt-oss-120b` $0.15 per M input, $0.075 cached input,
$0.60 per M output (Groq model page). Supabase Pro from $25/month incl. 100,000 MAU, 8 GB disk,
2 M Edge Function calls ($2 per extra million), 250 GB egress (Supabase pricing page).
Everything else is an **illustrative assumption**.

Measured: 1,931 input + 316 output tokens per reply on short conversations ($0.00048).
Assumed for planning (longer conversations carry more history): **3,500 input + 400 output tokens per
exchange, +10% for answer-leak rewrites → ≈ $0.00085 per exchange.**

| Assumption | Value |
|---|---|
| Sessions per active student per month | 8 |
| Exchanges per session | 12 |
| Exchanges per student per month | 96 |
| Session length | ~15 min |
| Peak hour | 10% of monthly actives, 12 exchanges/hour each |

| Monthly actives | AI cost | Platform (illustrative) | Total / month | Per student | Peak load |
|---|---|---|---|---|---|
| 100 | $8 | Supabase Pro $25 | ≈ $35 | $0.35 | 10 students → ~2 req/min → ~8K tokens/min (= Groq free cap) |
| 1,000 | $82 | $25 | ≈ $110 | $0.11 | ~20 req/min, ~80K tokens/min |
| 10,000 | $820 | $25 + compute upgrade ~$60 + error tracking ~$30 | ≈ $950 | $0.10 | ~200 req/min, ~0.8M tokens/min (needs agreed Groq limits) |
| 100,000 | $8,200 | ~$500–800 (larger compute, storage, ~$30 extra function calls) | ≈ $9,000 | $0.09 | ~2,000 req/min, ~8M tokens/min (enterprise agreement, second provider) |

Per tutoring session ≈ $0.01. Per verified solve (≈ 8 exchanges) ≈ $0.007.

**Cost levers (in order of safety for quality):** keep conversation context to the last N turns (already
`context_turns`); Groq cached input for the fixed system prompt (–50% on that part); skip the rewrite call
when no answer is at risk (already); per-student caps (in place); route only genuinely hard work to stronger
models (in place). Do not shorten the tutoring policy to save tokens: it is the product.

**Commercial recommendation for Rwanda.** Lead with **university licences** (per enrolled student per
semester; AI cost is ~$0.10–0.35 per student per month, so a licence in the low single dollars per student
per semester covers AI, hosting and support), with a **free student tier** capped per day for
acquisition. The current $15/$50 monthly student plans are priced for international markets; for Rwandan
students, offer a local-currency plan paid by mobile money only after a payment provider is chosen.

---

## I. Prioritised roadmap

Effort is in engineer-days for one developer familiar with the code; ranges, not commitments.

| Task | Problem | Evidence | Pri | Phase | User impact | Approach | Deps | Effort | Cost | Acceptance | Verification | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Free capacity chain (no cost) | F1 | Groq limits are per model | P0 | A | More free capacity for early adopters | gpt-oss-120b → gpt-oss-20b → qwen3.8-27b; skip retries on a rate-limited model; cache-friendly prompt order | — | 0.5 | Free | Busy model hands over at once | 2 new tests | **Done in code; not deployed** |
| Groq paid tier | F1 | Groq limits | P1 (when a class uses it) | B | Tutor available to a whole class | Owner upgrade | — | 0.1 | Low (usage) | Limits page shows higher TPM | 20-user load test | Deferred (owner: no costs yet) |
| Keep-alive (no cost) | F2 | Pricing page | P0 | A | No pause on the free plan | Scheduled GitHub Action reads the DB every 3 days | — | 0.2 | Free | Project never paused | Workflow runs | **Added** |
| Supabase Pro | F2 | Pricing page | P2 | C | Backups, no pause risk | Owner upgrade | — | 0.1 | $25/mo | Plan = Pro | Dashboard | Deferred (owner: no costs yet) |
| Request deadline | F3 | tutorService | P1 | A | No charged-but-failed replies | Shared deadline; client 75 s | — | 0.5 | Free | Response < 60 s; quota released | 4 new tests (fail on old code, pass on new) | **Done in code; not deployed** |
| Root prototype | F4 | App.jsx | P1 | A | Live site can't be overwritten by mistake | Resolve; delegate scripts | — | 0.3 | Free | Parses; root build = menya | esbuild parse + root `npm run build` | **Done** |
| CI | F5 | none | P1 | A | Fewer regressions | GitHub Actions | — | 0.5 | Free | Green on push | GitHub Actions run 40302119332: 3/3 jobs passed | **Done** |
| Rate-limit wait time | F6 | api | P2 | A | Clear "try in N s" | Pass retry-after | F3 | 0.3 | Free | Message shows seconds | Test | **Done in code; not deployed** |
| Concept-vs-problem | F7 | test | P1 | B | Earned solutions hold | Policy + eval | — | 1 | Low | 6/6 eval | Eval | Not started |
| Eval dataset + rubric | D4 | 8 cases | P1 | B | Evidence of quality | JSON dataset, grader | — | 5–8 | ~$5 tokens | 60+ cases, κ ≥ 0.6 | Report | Not started |
| Structured misconceptions | F9 | schema | P2 | B | Specific feedback | Schema + UI | Eval | 2–3 | Free | Eval dimension ≥ 1.5/2 | Eval | Not started |
| Spend guard + alert | F10 | none | P2 | B | Bounded cost | Daily budget check | — | 1 | Free | Requests stop at budget | Test | Not started |
| Consent + research export | F12 | none | P1 | B | Ethical pilot | Consent screen, pseudonymised export | Ethics | 2–3 | Free | Approved by ethics board | Review | Not started |
| Feedback (👍/👎 + comment) | pilot | none | P2 | B | Student voice | Table + UI | — | 1 | Free | Stored per reply | Test | Not started |
| Device + accessibility audit | — | not done | P2 | B | Works on cheap phones | Android 3G, TalkBack | — | 2 | Free | Checklist pass | Manual | Not started |
| Teacher dashboard (course view) | — | org page exists | P2 | C | Lecturers see class gaps | Extend org dashboard | Concepts | 3–5 | Free | Lecturer sign-off | UAT | Not started |
| Delayed re-check + concept list | D5 | — | P2 | C | Real retention evidence | Scheduled practice | Dataset | 3–5 | Low | Shown in progress | Test | Not started |
| Localisation framework | — | strings inline | P3 | D | Kinyarwanda/French UI | i18n string table | — | 3–5 | Free | 2 locales | Manual | Not started |
| Load test + second provider | — | — | P2 | D | Scale | k6 test; fallback provider | Groq tier | 3–5 | Low | 500 concurrent OK | Load report | Not started |

---

## J. Final recommendation

1. **Biggest problem:** capacity and availability, not code. On the free Groq and Supabase tiers, a
   single class would exhaust one model's AI limit within a minute, and the backend pauses after a quiet
   week. For early adopters this is handled at no cost (three-model free chain, prompt caching,
   keep-alive); a whole class at once still needs a paid AI tier later.
2. **Fix immediately:** upgrade Groq and Supabase (owner, ~$25/month + usage); the request time budget;
   the root prototype that can overwrite the live site; CI. (The code items are done in Phase A; the
   time-budget fix goes live only when the API is redeployed.)
3. **Retain:** the central backend, quotas and metering, the shared tutoring policy and answer guard,
   server-verified progress, saved conversations.
4. **Redesign:** misconception output (structured), request-type routing, and the progress model
   (per-concept evidence with delayed re-checks) once the evaluation dataset exists.
5. **Don't build yet:** reasoning graph, mastery percentages, LMS integration, microservices, offline AI,
   a second frontend, native apps.
6. **For a 50–100 student pilot:** the two upgrades, the evaluation dataset at ≥ 60 cases with an
   acceptable score, consent + ethics approval, pre/post tests written with the course lecturers, a
   device test on low-end Android, and one supervised dry run with 5–10 students.
7. **For institutional deployment:** university licence model, course-level concept lists, lecturer
   dashboard, data-processing agreement, support process, privacy review under Rwandan law.
8. **To justify 10,000 students:** a pilot showing learning gains at least equal to usual study with
   lower or equal time, SUS ≥ 70, < 2% errors, cost ≤ $0.50/student/month, and a second university.
9. **For international expansion:** replicated results in 2–3 institutions (ideally one outside Rwanda),
   delayed-retention evidence, localisation, and a model/provider strategy with a fallback.
10. **Minimum credible budget and team (illustrative):** for the next 6 months, one full-stack engineer
    (you, or part-time hire), one learning-science/assessment collaborator at the university (part-time),
    and a lecturer per pilot course; cash costs ≈ $40–60/month infrastructure + AI during the pilot,
    plus ethics/consent administration and any participant incentives.
