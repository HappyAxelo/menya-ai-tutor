# Menya product audit: 31 October 2026

Audit of the code at commit `c867680` (live as server version 12 and on menyaneza.com),
against the "learning companion" brief. It records what exists, what is weak, and what was
built in this round. Nothing here claims learning gains: there is no outcome evidence yet.

## 1. Architecture (as found)

| Layer | What it is |
|---|---|
| Website | React 18 + Vite, `menya/`. Chat (`App.jsx`), account, history, progress, pricing, admin, institution pages (`src/commercial/`). Four interface languages (`locales.js`). Static hosting on GitHub Pages. |
| API | One Supabase Edge Function `api` (Deno). Router in `_shared/api.ts`; tutoring in `_shared/tutorService.ts`. |
| Tutoring engine | `_shared/engine/`: a state machine choosing the teaching move (`state.ts`), a hint ladder 0–5, Learn / Explain modes, a deterministic question bank with misconception detection (`bank.ts`, 12 objectives, 11 templates), uncertainty-aware mastery with spaced review (`mastery.ts`). |
| Answer safety | `answerGuard.ts` keeps the private answer out of replies; leak checks; verified answers only from the bank, chemistry balancing or the remembered answer. |
| AI | Groq free tier (gpt-oss-120b → gpt-oss-20b → qwen), routing by plan and difficulty (`router.ts`), premium allowance, fallbacks, retries, time budget, cost per request in `usage_records`. Optional HPC model (vLLM). Whisper for voice; a vision model for images. |
| Data | Postgres with row-level security. Learners only read their own rows; all writes go through the server. Data export and account deletion exist. |
| Billing | Plans table, IremboPay adapter (signed webhooks, invoices), admin setup check. Not yet tried against the IremboPay sandbox. |
| Admin | Usage, cost and margin per plan, learners per plan, feedback (Bad/Fair/Good), Excel export, payments check. |

## 2. Worth preserving

- The engine's core rule: **mastery only from server-verified, independent evidence**. Chat volume,
  hints and the model's opinion never count. It is the main thing that separates Menya from a general chatbot.
- Deterministic bank with misconception catalogues: the answer key cannot be invented by a model.
- Progressive hints, Explain mode, "I'm stuck" options, a worked example followed by an unseen similar problem.
- Leak guard, plan-based routing, quota done atomically in the database, structured logs without content.
- Privacy basics: RLS, export, deletion, no keys in the browser.

## 3. Ten most important weaknesses (ranked by effect on learning and on students returning)

| # | Weakness | Why it matters |
|---|---|---|
| 1 | **Menya doesn't know who the learner is.** No education level, institution, course, curriculum, goals or exams are stored; the only "level" is a setting in the browser. | The tutor can't pitch explanations right (secondary vs university), and nothing personal carries across devices. |
| 2 | **No reason to come back without a question.** The app opens on an empty chat; due reviews are hidden in the Progress page. | Spaced review exists in the data but students never see it at the right time, so retention work doesn't happen. |
| 3 | **No study plan or exam dates.** | Students don't know what to study next, especially before exams, which is when they most need help. |
| 4 | **No exam practice.** Checks are one question at a time inside a chat. | No timed, multi-topic practice with a result breakdown; no interleaving across topics. |
| 5 | **The knowledge map is a flat table of 12 objectives** with a percentage, no subject view, no "not assessed", and the learner can't correct it. | Students can't see at a glance what they know; a wrong picture can't be fixed. |
| 6 | **Course materials are one-shot.** Attachments are read for a single message (≈8,000 characters) and forgotten; no page references. | Students can't study from their own lecture notes across sessions, and answers can't cite the notes. |
| 7 | **Verified question bank is small and only ICT/engineering** (maths basics, calculus, circuits, logic, programming). | Mastery and exams are only trustworthy where there are templates; physics, chemistry, statistics and others rely on model-written problems. |
| 8 | **No protection designed for minors** (age, guardian consent). | Required before marketing to secondary schools. |
| 9 | **No learning-outcome measurement in the product** (pre/post, delayed retention). | Can't show that Menya helps; the evaluation plan exists only on paper. |
| 10 | **Institutions have seats but no teachers, classes or class analytics.** | Limits the school/university offer. |

Other findings: the interface translations for Kinyarwanda and Kiswahili still need native review;
free-form answers outside the bank are not deterministically verified; student code is never run
(no sandbox).

## 4. What this round implements (weaknesses 1–6)

All features are wired to real database tables and server routes; no placeholder data.

1. **Learning profile** (education level, institution, programme, curriculum/exam system,
   subjects, goals, study time per weekday). Editable and clearable by the learner, included in
   the data export, deleted with the account. The tutor receives it as context (as data, with
   length limits), so explanations match the learner's level and course.
2. **Knowledge map** by subject with honest levels: *Not assessed, Started, Needs work,
   Developing, Strong*. "Strong" still requires the full mastery rule (several independent
   successes on unseen problems, one after a delay). A learner can **reset** a topic they think is
   wrong, or ask to be **tested** on it.
3. **Today**: the home page answers what to learn today, what is due for review, what is going
   badly, what is strong, and whether the learner is improving (independent successes this week
   vs last week, from verified attempts only).
4. **Study planner**: exams with dates and topics; a plan for the coming days built from what is
   due, weak or not yet assessed, fitted to the learner's daily minutes, with topics interleaved.
   It is recomputed from the current state every time, so a missed day or a poor result changes
   the plan automatically. No streaks and no guilt messages.
5. **Mock exams** from the verified bank: chosen topics (or an exam's topics), mixed order, a
   time limit, answers marked deterministically on the server. Results show correct / incorrect /
   unanswered, the misconception behind each wrong answer, time spent, and what to revise. Results
   count as independent evidence for mastery. Questions are labelled as generated practice,
   never as past papers.
6. **Course materials library**: uploaded notes are stored by page (text only), searchable, and
   the tutor is given the relevant passages with page numbers when the learner asks about their
   course, with an instruction to cite pages only from those passages and to say when something
   comes from general knowledge. Materials are private to the learner and can be deleted.

## 5. Not done in this round (stated plainly)

- Parental consent and age-specific experiences (weakness 8). Needs a policy decision on ages and
  a consent flow; not built.
- Teachers, classes and class analytics (weakness 10).
- More verified templates for physics, chemistry, statistics, biology, business (weakness 7).
  Mock exams only cover the 12 objectives with templates.
- Partial credit and reasoning-quality scores in mock exams: marking is right / wrong with the
  misconception; working is not graded.
- Outcome measurement (pre/post/delayed tests in the product) and an automated AI-quality
  evaluation set beyond the existing test suites.
- Semantic (embedding) search for materials: retrieval is Postgres full-text search, which is
  free and fast but matches words rather than meaning.
- Scanned PDFs in the library: only text-based files are stored.
