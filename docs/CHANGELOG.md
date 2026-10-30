# Change log

## Prices (30 October 2026, branch `pricing`)

Owner's prices, in US dollars: **Free** $0; **Pro** $10 / month, $35 / semester (4 months,
save 13%), $90 / year (save 25%); **Exam Pass** $8 for 2 weeks, practically unlimited
(1,000 replies a day, fair use) and ranked above Pro while it lasts; **Professional** $25 / month.
New billing periods `semester` and `two_weeks`; checkout refuses periods a plan isn't sold for;
IremboPay invoices and notifications handle them (4 months, 14 days); the admin revenue estimate
counts them; the admin plan editor can change them. The pricing page lists every period with its
own pay button and the saving against monthly. Wording made honest: "practically unlimited
(fair use)", and the page no longer says "nothing is unlimited".

IremboPay charges in the payment account's currency: with an RWF account, set the RWF amounts in
`IREMBOPAY_PLANS` (or open a USD account, which IremboPay supports) so they match these prices.

## Own domain: menyaneza.com (30 October 2026, branch `custom-domain`)

The site is served at **https://menyaneza.com** ("menya neza" = "know well"). DNS points to
GitHub Pages (4 A + 4 AAAA records, `www` CNAME); HTTPS certificate issued by GitHub;
`www.menyaneza.com` and the old `happyaxelo.github.io/menya-ai-tutor/` link redirect to it.
The site is built at the domain root (`public/CNAME`); the API (version 10) allows the new
origins and keeps github.io during the move. Sign-in needs the new URLs in Supabase Auth
(Site URL and Redirect URLs).

## Voice input and file attachments (29 October 2026, branch `voice-and-files`)

**Voice.** A microphone button records the question (noise suppression, echo cancellation,
live level meter, up to 3 minutes); Groq Whisper large-v3 (turbo as fallback), nudged toward
STEM vocabulary, writes it into the message box to check, edit and send. Kinyarwanda uses the
browser's own recogniser when available. Test: a spoken "A 12-volt battery is connected across a
4-ohm resistor. What current flows through it?" was transcribed exactly in 1.4 s (the turbo model
alone wrote "Watt current"; the full model with the subject hint fixed it).

**Attachments.** Paperclip, drag and drop, or paste. Read instantly in the browser: PDF (pdf.js;
scanned PDFs go to the image reader), Word, PowerPoint, Excel (read from their XML, no library),
text, code, CSV, JSON, Jupyter notebooks. Photos/scans/screenshots: a Groq vision model
(`qwen/qwen3.8-27b`) copies out the problem exactly, without solving it; audio files are
transcribed. The tutor receives the text as clearly marked student material (never as
instructions), works out the problem and starts guiding. Test with real models: a handwriting-
style photo ("R1 = 30 Ω and R2 = 33 Ω in series to a 5 V battery…") was read exactly in 1.4 s,
and the tutor opened with "What is the total resistance…?" (DIAGNOSE) in 2.1 s.

**Limits and privacy.** Per-learner daily allowance for voice notes (60) and images (30), kept
apart from the tutoring quota (`media_usage`). Documents never leave the device; photos and
audio go to Groq to be read and are not stored. Privacy page updated.

**Fix.** Chat bubbles for "I'm stuck", "Check yourself" and reviews showed raw label keys
(`action.verify`); now labelled in all four languages, with a test that catches it.

**Tests.** Backend 118 (5 new), frontend 22 (4 new, including real compressed Word, PowerPoint
and Excel files). The readers were also checked in a real browser engine (PDF made by Edge,
Office files, a photo, drag and drop).

## Scaling up: tutoring engine, feedback and analytics, IremboPay, HPC (29 October 2026, branch `scale-and-engine`)

**Tutoring engine** (docs/ENGINE_DESIGN.md). The server decides each turn's teaching move before
the model writes it: states DIAGNOSE, GUIDE, HINT, EXPLAIN, MODEL, PRACTISE, VERIFY, REVIEW,
MASTERED; a 0–5 help ladder chosen from evidence (misconception, repeats, why the learner is
stuck, attempts); Learn and Explain modes; the model's structured assessment is validated and the
server's own check always wins. A deterministic bank (12 objectives, 11 templates: algebra,
calculus, circuits, digital logic, programming) serves unseen problems with verified answers and
detects misconceptions from the wrong answers they produce. Mastery is a Beta estimate from
verified evidence only, needing independent and delayed successes, with spaced reviews.

**Interface.** Learn/Explain switch; "I'm stuck" (where to start / a step / my mistake / the
idea); "Check yourself" after a solve; private scratchpad; "Checked: correct / not right yet";
objective and mastery line under replies; reviews on the welcome screen; learning objectives
on the progress page. All in English, Kinyarwanda, French and Kiswahili.

**Feedback and admin.** Bad / Fair / Good on every reply ("Thanks for the feedback"); admin
overview of learners by plan (free, pro, professional), activity, solves and feedback;
"Download Excel" (.xlsx: Summary, Users, Feedback).

**Payments: IremboPay** adapter (invoice checkout, signed notifications, one period per
payment). Built from the public docs; needs a sandbox payment before going live.

**HPC.** `hpc/` kit for a Slurm cluster (vLLM, self-test, tunnel, registration heartbeat,
automatic resubmission); free-plan requests use it and fall back to Groq when it's gone.

**Tests.** Backend 113 (31 new: the ten scenarios, the bank, the pipeline, feedback, analytics,
IremboPay, HPC). Frontend 18. Real-model demonstration: docs/DEMO.md. It found two problems that
were fixed: a "Check yourself" problem could repeat the practice question (different seeds, same
text; now tracked by question text, product-rule variety increased), and replies proposed
model-written problems instead of the verified ones (now forbidden).

**Not done / not verified:** see docs/LIMITATIONS.md (course-material retrieval, code sandbox,
IremboPay sandbox, a real Slurm run, native-speaker review, learning outcomes).

## Tutor training round, browser tab title (29 October 2026, branch `tutor-training`)

**Browser tab.** Shows the logo and "Menya AI" on the welcome screen, and the conversation's first
question (shortened) once a conversation starts, like ChatGPT and Claude.

**Training method.** The models are hosted free on Groq and can't be fine-tuned without cost and a
large dataset. "Training" here means: a larger set of realistic conversations run through the real
pipeline (`supabase/dev/try-long-conversations.ts`, suites `core`, `extra`, `current`: 16
conversations, 53 turns), fix what fails (rules and server checks), re-run.

**Failures found and fixed.**
- "Help me understand Ohm's law with 9 V and 3 Ω" was answered with the student's own result. Rule:
  numbers in an "understand" request make it a problem; explain with different numbers that give a
  different result, then let the student compute theirs.
- An unbalanced equation ("H2 + O2 → 2H2O") was called correct and counted as solved. The server
  now counts atoms exactly (`chemistry.ts`). An unbalanced equation is never confirmed or counted
  as solved; the model gets a second look with the counts, and if it still insists, the student
  gets a fixed "not balanced yet" message instead.
- The tutor invented a news story ("last week the president announced…"). New rule: no internet,
  nothing after its training data; say so, never invent; these are factual questions, not problems.
  Re-run: all 6 current-information questions (English and Kinyarwanda) answered honestly.
- Leak guard: "20 m/s" in the question counted as the student having said "20 m" (the answer), so an
  "explain more simply" reply that spelled out the answer got through. Units now match whole.
- Leak guard no longer blocks the tutor confirming a correct attempt in another form (the factored
  derivative was replaced by a "you're close" message). Solves still need the server's answer match.
- A first-message fallback that made sense ("Let's work through it together…") instead of "You're
  close, carry out the step…".

**Results (real model).** Final full run: 13 of 16 conversations fully passed. The three flagged were
two false alarms in the check itself (a curly apostrophe; a correct, caveated 2022 World Cup answer)
and the physics leak fixed above. Focused re-run of the core four: average-speed answer accepted and
cross-checked, current-information answers honest; one Ohm's-law example happened to give the same
result as the student's problem (rule tightened); 3 turns failed on Groq's free-tier limits.
Backend tests 76/76 (4 new), frontend 17/17 (1 new).

**Limit reached.** These runs used most of a day's free Groq allowance, which live students share.
Run the suites sparingly (`SUITE=core|extra|current`), ideally at quiet hours.

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
