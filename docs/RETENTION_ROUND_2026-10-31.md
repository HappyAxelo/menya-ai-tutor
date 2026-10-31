# Retention, personalisation and continuous learning: 31 October 2026

Second round against the "learning companion" briefs. The first round (live since 31 October,
commit `d28f86d`) is described in `PRODUCT_AUDIT_2026-10-31.md`. This file covers what the
retention brief asked for, what already existed, what this round adds, and what is still missing.

## 1. Audit (delta, verified in the code)

| Question in the brief | Finding |
|---|---|
| Where is learning history stored? | Postgres (Supabase), in structured tables keyed by the account: `learner_profiles`, `learner_objectives` (mastery estimate per topic with evidence counts and next review date), `assessment_attempts` (every server-marked answer, with the exact question's template and seed), `learner_exams`, `mock_exams`, `course_materials` + `material_chunks`, `learning_events`, conversations. Not in browser storage, not in model memory. |
| Does progress survive logout, a new device, a new conversation? | Yes: everything is read from the database by account on every request. Covered by tests that use a fresh API context per request. |
| Mastery from one answer? | No. "Strong" needs an estimate ≥ 0.8 with a lower bound ≥ 0.6, at least 2 independent successes on unseen questions and one after a 2-day delay (`engine/mastery.ts`). |
| Entitlements enforced server-side? | Yes: plan limits, premium allowance and rate limits in the database (`consume_quota`), material limits and the practice-exam cap in the API / database. Nothing in the browser decides access. |
| Keys in the frontend? | No. The browser holds only the public project address and publishable key. |

Already present before this round: profile, knowledge map with prerequisites, diagnostic and
independent checks from a verified bank, misconception detection, hint ladder, Learn / Explain
modes, "I'm stuck" (changes strategy instead of repeating questions), worked example followed by
an unseen similar problem, spaced review dates, adaptive planner with reasons, timed practice
exams with post-exam analysis, course notes with page references, feedback, cost per request.

## 2. What this round adds

| Brief item | Implementation | Files |
|---|---|---|
| Bring back incorrectly answered questions; new questions on the same concept; Review Today | **Review today** card on *My study* and an untimed review set: up to 3 questions the learner got wrong (and hasn't since got right), at least 20 hours later, followed by new unseen questions on every topic due for review. Retried questions count as practice (seen before); new ones count as review evidence, which feeds delayed retention. A wrong question leaves the list once answered correctly. | `review_retries()`, `buildReviewSet()`, `POST /review/start`, `ExamPage.jsx` (review mode), `StudyPage.jsx` |
| Country, learning preferences | `country` and `explanation_style` (steps / worked example / everyday comparison / diagrams). Given to the tutor as quoted data. | migration 14, `policy.ts` |
| Deletion controls | **Delete my learning data** (typed confirmation): profile, levels, answers, exams, practice exams, notes. Audited. Conversations and the account remain separately deletable, as before. | `delete_my_learning_data()`, `POST /learn/delete-all` |
| Topic coverage for exams | Each exam shows how many of its topics are strong, untested or weak. Not a prediction of the result. | `StudyPage.jsx` |
| Retention and learning analytics | Admin card **Retention and learning**: activation, Day-1 / Day-7 / Day-30 retention (with eligible counts), weekly / monthly active learners, independent success rate, topics retained after a delay, topics mastered, reviews done / overdue, practice exams, paid learners and lapsed subscriptions, AI cost per monthly active learner. Definitions shown next to every number. | `admin_retention_json()`, `GET /admin/retention`, `AdminPage.jsx` |
| Concurrency | Two submissions of the same exam at the same moment count once (database-level check), tested. | `submit_mock_exam()`, `learning.test.ts` |

## 3. Schema change (migration `20261031000014_menya_retention.sql`)

- `learner_profiles` + `country`, `explanation_style`.
- `mock_exams` + `mode` (`exam` | `review`).
- Functions: `review_retries`, `delete_my_learning_data`, `admin_retention_json`; `create_mock_exam`
  gains `p_mode`; `save_learning_profile` and `learning_state` updated. All service-role only.
- Rollback steps are in the migration header; the full rollback script is updated.

## 4. API

| Route | Who | What |
|---|---|---|
| `POST /review/start` | learner | builds a review set (no answer keys returned) |
| `POST /exam/submit` | learner | now also marks review sets (practice / review evidence) |
| `POST /learn/delete-all` | learner | `{ "confirm": "DELETE" }` |
| `POST /learn/profile` | learner | also `country`, `explanation_style` (validated) |
| `GET /admin/retention` | platform admin | analytics above |

## 5. Tests

144 backend tests (5 new: review set and evidence kinds, simultaneous submissions, profile fields
reaching the tutor, deleting learning data without touching another learner, analytics access and
cohort rules), 22 frontend tests, all passing. Browser check on a local copy: *My study* shows
Review today, the new profile fields and the delete control; the admin page shows the analytics.

## 6. Deployment

Same as before: apply the migration (Supabase SQL editor, or the MCP), deploy the `api` function
pinned to the commit, publish the site (`cd menya && npm run deploy`). No new secrets.

## 7. Security and privacy

- Every new route requires a signed-in learner; every database function filters by the caller's
  id; analytics require a platform administrator and return only counts (no names, emails or
  content).
- Review sets never send answer keys before submission; retried questions are regenerated on the
  server from the stored template and seed.
- Deletion is a typed, audited action; it cannot touch another learner's rows (tested).
- Profile text, notes and uploaded passages reach the model only as quoted reference data.

## 8. AI usage and cost

Nothing added in this round calls a model: review sets, marking, planning and analytics are
deterministic database and server code, so they cost nothing per use. Model cost stays per tutor
reply (Groq free tier today); the admin card now shows it per monthly active learner.

## 9. Still not done (and why)

- **Parent and teacher roles, classes, assignments.** Needs decisions on consent flows, what a
  parent may see (by default: progress summaries, never conversations) and how classes are created.
  Not built.
- **Protections for minors** (age gate, guardian consent). Not built; required before selling to
  secondary schools.
- **Flashcards and question generation from uploaded notes.** Would be model-written and not
  verifiable, so they'd need clear labelling and a review step. Not built.
- **Images and scanned PDFs as notes**: not stored (chat attachments still read them).
- **More verified topics** (physics, chemistry, statistics…): reviews and exams cover the 12 bank
  objectives only.
- **Study-plan completion rate**: the plan is recomputed, not stored, so completion isn't measured;
  reviews done / overdue is the proxy.
- **Backups and recovery**: depend on the Supabase plan; check its backup policy and export data
  regularly while on the free plan. Not tested here.
- **Load testing** with many simultaneous learners: not done.
