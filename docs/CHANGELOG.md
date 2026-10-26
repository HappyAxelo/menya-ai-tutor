# Change log

## Kinyarwanda questions answered in English (fix, 26 October 2026, branch `fix-kinyarwanda-replies`)

**What was wrong.** The app's reply-language setting defaulted to "English" and was sent with every
message as a *required* language, so the tutor answered Kinyarwanda in English and ignored "vuga
ikinyarwanda". Live data: every saved conversation had language "English", including Kinyarwanda ones.

**What changed.**
- Default is now "Match my language": reply in the language the student writes in; English only when
  unclear. Browsers that still had the old English default move to it automatically; a language picked
  after this update is kept. (`menya/src/settings.js`, labels in `SettingsPanel.jsx`, `tutor.js`)
- The server recognises Kinyarwanda, Kiswahili, French and English from common words
  (`detectLanguage`, `policy.ts`) and tells the model explicitly which language the message is in.
- A chosen language ("Always English") is kept per message, but an explicit request ("vuga
  ikinyarwanda") switches. Rules also tell the model to read the message in its own language.
- `supabase/dev/try-languages.ts` runs real conversations through the full pipeline to check this.

**Tests.** Backend 71/71 (3 new), frontend 8/8 (1 new). Real model, full pipeline: "rimwe guteranyaho
rimwe ni kangahe?" → Kinyarwanda, understood as 1 + 1; car-speed problem → Kinyarwanda through question,
hint and confirmation; English chosen → English, then "vuga ikinyarwanda" → Kinyarwanda.

**Still open.** Kinyarwanda wording quality needs a native speaker's review. The 1 + 1 reply stated the
answer inside an explanation (concept-vs-problem routing, Phase B).

## Zero-cost operation for early adopters (26 October 2026, branch `phase-a-stability`)

Decision (owner): no paid services for now. Changes so the free tiers go further:

- **Three-model free chain.** Groq's free limits are per model; when `gpt-oss-120b` is busy the
  request goes to `gpt-oss-20b`, then `qwen/qwen3.8-27b` (all support strict JSON output; qwen is
  last because it failed to produce valid JSON in 2 of 5 eval conversations on 26 Oct). A
  rate-limited model is not retried; the next one answers immediately.
  *Files:* `router.ts`, `tutorService.ts`, migration `20261026000007_menya_free_capacity.sql`.
- **Cache-friendly prompt.** Shared instructions first, per-student settings last, so Groq's automatic
  prompt cache (not counted toward its limits) covers more of every request. `cached_input_tokens`
  is now recorded per request to measure it. *Files:* `policy.ts`, `providers.ts`, `repo.ts`.
- **Keep-alive.** `.github/workflows/keep-alive.yml` reads the database every 3 days so the free
  Supabase project isn't paused.
- **Docs.** `docs/OWNER_SETUP.md` "Running at zero cost"; roadmap updated.
- **Tests:** backend 68/68 (2 new: hand-over without waiting; all three busy → wait message).
- **Not deployed.** Needs approval: one migration, then the API, then the web app.

## Phase A — stability and safety (26 October 2026, branch `phase-a-stability`)

Status: done in code and tested locally. **Not deployed**: the API change (time budget, rate-limit
message) and the web change (75 s wait) go live only after approval.

### What was wrong, why it mattered, what changed

1. **Request time budget (F3).** The browser stopped waiting after 60 s, but the server could spend
   2 × 45 s on Free (plus a rewrite call) and well over the Edge Function's 150 s limit on Pro and
   Professional (strong model 2 × 60 s, then the medium model). A killed function had already
   consumed the student's quota and wrote no usage record; the student saw "Not sent".
   *Change:* one deadline per request (`MODEL_BUDGET_MS` = 50 s) shared by every model call, retry
   and rewrite; each call's timeout is capped to the time left; no call starts with < 5 s left; if
   there is no time for an answer-leak rewrite, the safe guiding message is sent instead. The browser
   now waits 75 s for tutor requests.
   *Files:* `supabase/functions/_shared/tutorService.ts`, `menya/src/lib/backend.js`.
2. **Provider rate limits (F6).** When Groq refused for rate limits, students got a generic
   "temporarily unavailable". *Change:* error `tutor_busy` with `retry_after_seconds` from the
   provider and a message saying how long to wait; still "not counted", still retryable.
   *File:* `tutorService.ts`.
3. **Root prototype (F4).** The original single-file app at the repository root had three unresolved
   merge-conflict blocks (`App.jsx` lines 157, 225, 298: a Groq-key screen vs an Anthropic-key screen),
   failed to parse, called a retired Groq model, and its `npm run deploy` published to the same GitHub
   Pages site as the product. *Change:* conflicts resolved keeping the Groq side (the only side
   consistent with the file's own API calls), file marked as a legacy reference; root `package.json`
   scripts now run `menya/` (dev, build, deploy) and both test suites; root lockfile removed (no root
   dependencies). Nothing from the product was removed.
   *Files:* `App.jsx`, `package.json`, `package-lock.json` (deleted).
4. **CI (F5).** No automated checks existed. *Change:* `.github/workflows/ci.yml` runs on every push
   and pull request: conflict-marker check, committed-secret check, web tests + build + bundle secret
   scan, backend tests. It never deploys.
5. **Reproducible API deploys.** The API had been deployed from a hand-made bundle. *Change:*
   `npm run bundle:api` in `supabase/` produces it from the repo; `docs/DEPLOYMENT.md` explains the
   upload and how to confirm the deployed source matches.
6. **Assessment.** `docs/ASSESSMENT_AND_ROADMAP.md`: current state, findings register, architecture,
   tutoring plan, security, testing, pilot design, cost model, roadmap, recommendation.

### Tests executed (local, Windows, 26 Oct 2026)

| Command | Result |
|---|---|
| `cd menya && npm ci && npm run build` | Build OK; bundle hash identical to the live site before changes |
| `cd menya && npm test` (Node 26 and Node 24) | 7/7 pass |
| `cd supabase && npm ci && npm test` (Node 26 and Node 24) | 66/66 pass (62 before + 4 new) |
| New time-budget and rate-limit tests against the *old* `tutorService.ts` | 4/4 fail (tests detect the defect) |
| `esbuild App.jsx` (root) | Parse error at line 157 before; parses after |
| Root `npm run build`, `npm test` | Builds `menya/`; runs both suites |
| CI hygiene steps simulated locally | Conflict markers: none; committed secrets: none; bundle secrets: none |
| `npm audit --omit=dev` (menya) | 4 low (KaTeX `trust`-related; Menya leaves `trust` off). No change made |

### Remaining risks after Phase A

- Groq free tier (8K tokens/min) and Supabase Free (pauses after 7 idle days) — owner upgrades (P0).
- Fixes 1–2 are not live until the API is redeployed; fix 1's browser half until the site is redeployed.
- CI: first GitHub run (40302119332) passed all three jobs.
- No signed-in end-to-end test on the live site since the last deploy.
