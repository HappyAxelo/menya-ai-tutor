# Product audit — 25 October 2026

Scope: the live site (https://happyaxelo.github.io/menya-ai-tutor/), `menya/src`, the `api` Edge
Function and the database migrations. Written before the refinement pass; each item notes what
was done about it.

## What already works (kept)

- Google sign-in; no API key anywhere in the student journey. The provider key is a Supabase
  secret, every tutor request is authenticated, quota-checked (atomic, per day/month/minute) and
  metered server-side. The browser bundle contains no secret (checked by scanning `dist/`).
- Server-side answer guard: the model reports its private final answer, the server refuses
  replies that leak it, and the private answer is never sent to the browser.
- Multilingual replies, three progressive hints per problem, learner level and reply-length
  settings, export, account data download and deletion, 180-day message retention.

## Problems found

| # | Area | Finding | Action |
|---|------|---------|--------|
| 1 | Progress | "Mastery" bars rose whenever the model *mentioned* a concept, scaled by its own praise score. Ten fixed topics (Ohm's law, Recursion…) regardless of what the student studied. Not real. | Removed. Progress is now computed from server-verified solves (see below). |
| 2 | Progress | "Reasoning graph" built from slices of the student's own text whenever it contained "formula/law/theorem". Decorative. | Removed. |
| 3 | Progress | Analytics summary said misconceptions "were caught and corrected"; nothing checked the correction. Counters lived in tab memory and vanished on refresh. | Removed; replaced by the progress page. |
| 4 | Copy | Footnote "Your progress is saved to your account" — conversations were stored but could not be reopened, and mastery was never stored. Plan feature "Your sessions saved to your account" had the same gap. | Sessions can now be reopened from History; footnote rewritten. |
| 5 | Tutoring | Pop-up praise toast ("Excellent reasoning!", "Great progress!") driven by a model score. Robotic. | Removed. |
| 6 | Tutoring | Only one action (hint). Worked solutions only after all 3 hints — a student who made real attempts and asked for the method was stuck. | Added: explain more simply, worked example (a *similar* problem), check my answer, similar practice question, summary. Worked solution also earned after two genuine attempts. |
| 7 | Tutoring | No retry after a failure; no request timeout; no offline notice. | Retry button on errors, 60 s timeout, offline banner. |
| 8 | Pricing | "Choose Pro" opened nothing (billing not configured) and only then explained. | The page asks the server whether checkout exists; if not, it says so up front and offers email. |
| 9 | Design | Gradient text in headings, radial glow background, glowing gradient buttons, hover lift on cards, shimmering "Thinking…", a second visual system on account/pricing pages (cyan→violet titles, mono uppercase labels). | Restrained to one system: solid accent colour, brand gradient only in the logo, plain headings, one set of components across pages. |
| 10 | First run | Hero promised "Bring any problem"; four example prompts in four languages but no explanation of how the tutor behaves or what is stored. | Short "how it works" (dismissible), three intent shortcuts, a subject picker, and a one-line data notice linking the privacy policy. |
| 11 | Content | Code blocks had no copy button; hint control messages would show as raw `[HINT REQUEST …]` text if history were displayed. | Copy button on code blocks; control messages shown as short labels. |
| 12 | Accessibility | Progress drawer tabs had no `aria-controls`; the error state was colour-only; the "Hint" pips conveyed count by colour only. | Rebuilt components with text labels for status, visible focus, labelled controls. |

Not found: fake testimonials, ratings, user counts or partnerships. None were present.

## Progress model (new)

A *solve* is recorded only when (a) the model marks the student's latest answer as correct and
(b) the server confirms that the student's own text contains the private verified answer.
Concept explanations, hints and message counts never count. Practice questions solved without
hints are shown separately as *demonstrated understanding*; problems solved with help are shown
as *completed*. Concept questions with no single answer produce no progress events.

Limitation, stated in the UI: the check relies on the tutor's own solution, which can be wrong.

## Out of scope / needs the owner

- Online payment (provider not chosen), custom SMTP for email sign-in, native-speaker review of
  non-English replies, legal review of the privacy policy, load testing.

## Verification (local, 25 October 2026)

- Backend tests: 62 passing (`cd supabase && npm test`), including new cases for learner
  actions, verified solves (wrong value, unclaimed right value, double counting), practice
  questions, worked examples counted as help, worked solutions after two attempts, and
  row-level security on `learning_events`. The pg_cron migration now loads in the test database
  through a stub (it had broken the suite).
- Frontend tests: 6 passing (`cd menya && npm test`) for action availability, history
  rendering and progress aggregation.
- Driven in a browser against the local backend with the real model: question → wrong answer
  checked (mistake named, value withheld) → correct answer verified → practice question →
  practice solved → Progress page and History show exactly those two solves → conversation
  reopened and continued with a summary. Backend stopped mid-request: plain error with a
  working "Try again". Offline: banner, send disabled. 375 px wide: no horizontal scroll, all
  header controls on screen, 16 px input (no iOS zoom).
- Found and fixed during testing: a practice question after a solve was reported as already
  solved; a "similar" worked example used numbers giving the same answer as the learner's
  problem, and numbered its steps with emoji.
- Production build: no provider keys or service-role key in `dist/`; base path `/menya-ai-tutor/`.

## Capacity risk found during testing

Groq's free tier allows 200,000 tokens per day for `openai/gpt-oss-120b`. A tutor reply uses
roughly 2,000–3,000 tokens, so the free tier serves on the order of 70–100 replies per day **in
total across all students**. The local eval exhausted it. Before inviting students, move the
Groq account to a paid tier (or add a second provider key) — no code change is needed.

## Not verified

- The live site still runs the previous version until the deployment steps in the summary are
  done. Screen-reader testing with real assistive technology, slow-network testing on a real
  phone, and native-speaker review of non-English replies have not been done.
- Leftover from the original repository: `App.jsx`, `main.jsx`, `index.html` and `owl.svg` at the
  repository root are the old single-file app and are not built or deployed.
