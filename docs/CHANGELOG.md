# Change log

## New logo, Claude-style welcome, whole interface in the chosen language (28 October 2026, branch `brand-welcome-i18n`)

**Logo.** The owner's "m with a question mark" mark (the middle one of the three) is redrawn as SVG and
used everywhere: header, chat avatar, sign-in, favicon, app icons (192/512/maskable/Apple), social
preview image. Brand colour #251F8C, lighter #B3AEFF on dark backgrounds so the mark stays visible.
Wordmark "Menya AI" in Nunito.

**Welcome.** An empty chat now opens like Claude: a greeting for the time of day on the learner's own
clock ("Good morning, Aline" 5–11, afternoon 12–16, evening 17–21, "Still up" 22–4, first name from the
Google profile), "What are you working on today?", and the message box in the centre with the three
starting points and subject examples underneath. After the first message the box moves to the bottom.
The greeting updates every minute. On phones the page no longer opens scrolled past the greeting.

**Language.** Changing the language now changes the whole interface, not only the tutor's replies:
chat, buttons, hints counter, errors, settings, history, progress, account, plans and the sign-in
page (which gained its own language picker). Full translations: English, Kinyarwanda, French,
Kiswahili (about 250 strings each, `menya/src/locales.js`). With "Match my language" the interface
follows the language of the current conversation, or the device language before the first message.
Other reply languages keep the English interface. Server errors are shown in the interface language
using their error codes. Staff-only pages (organisation, admin) stay in English.

**Tests.** Frontend 16/16 (8 new: language choice, "match my language", greeting by hour, fallback,
every locale has every string with the same {placeholders}, hints-left count). Backend 71/71.
`supabase/dev/try-long-conversations.ts` runs long real-model conversations (results below).

**Long real-model conversations (28 October 2026, 4 conversations, 32 turns, turns paced 12 s apart
like a student typing; 64/67 automatic checks; 0 free-tier retries; replies in 1–4 s).**
- Hints get more specific in order and never give the answer away: 1 names the idea (n = m/M; "use
  the SUVAT formula"), 2 gives the formula with the values, 3 leaves only the last blank.
- The context holds across 13 turns: the tutor still worked on the same problem and knew the earlier
  steps (for example, "you used only the first term of s = ut + ½at²").
- Wrong answers get a specific diagnosis: "multiply instead of divide" in French, "forgot to subtract 5"
  in Kinyarwanda. Correct answers are confirmed and recorded as solved (Kinyarwanda, French).
- The reply language held for every turn (English, Kinyarwanda, French chosen).
- Questions about recent facts: no invented answers. Python release → "check python.org". President of
  Rwanda → correct name, and the tutor said it has no news after its training data.
- **Problem found and fixed: a correct answer by a different method was rejected.** "Average speed
  10 m/s × 2 s = 20 m" is right, but the tutor insisted on its own formula. Fix (backend, needs the api
  function redeployed): a rule that any valid method counts, plus a server check. When the student's final
  result (after their last "=") equals the verified answer but the reply says "not right", the
  tutor is asked once to re-check the method (`statesAnswer`, `recheckRequest`). A wrong working that
  only quotes a given value ("20 × 2 = 40") does not trigger it. Rerun: the same turn is now confirmed
  ("average speed (20 + 0)/2 = 10 m/s × 2 s = 20 m"); physics 28/28, all four conversations 65/67.
  Backend tests 72/72 (1 new).
- "Help me understand Ohm's law with 12 V and 4 Ω" was treated as a concept and answered with 3 A
  straight away (concept-vs-problem routing, already listed for Phase B).
- The Kinyarwanda summary mixed "you" and "he/she" once: wording needs a native speaker's review.

**Still open.** Translations need review by native speakers (Kinyarwanda first). The tutor has no
internet access: it cannot know news or releases after its training data, and is instructed to say so.

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
