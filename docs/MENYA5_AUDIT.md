# Menya 5.0 audit: where the tutor stands against the university brief

Written 13 November 2026, before any change on branch `claude/menya-5-learning-engine`.

## How it was audited

- **Code**: every file under `supabase/functions/_shared/`, the learner pages in `menya/src/`, the migrations that define the learning tables, and the existing docs.
- **Tests**: 364 backend tests and 31 web tests, all passing before this work.
- **Live site** (`menyaneza.com`, guest access, 13 November 2026, 4 messages): a differentiation lesson, a wrong answer, "I don't know", and a Kirchhoff's-laws circuit problem.

Not audited: the signed-in pages on the live site (no account was created), payments, the admin dashboard beyond its code, and voice.

## What already works

| Area | Evidence |
|---|---|
| The server, not the model, chooses the teaching move | `engine/state.ts`, 11 states, unit-tested |
| Teach before asking | Seen live: idea, picture, worked example, then one question |
| "I don't know" changes approach | Seen live: a hint with the rule stated, not the same question |
| Mastery is hard to fake | `engine/mastery.ts`: two independent successes on unseen problems, one after a 2-day gap |
| Spaced review, wrong-question retries, timed practice exams | `learning.ts`, `/review/start`, `/exam/*` |
| Answer keys never reach the browser | `session_items` is service-role only |
| Plans, quotas, guest access, row-level security | SQL functions, 364 tests |
| Pictures are drawn by code from a description | Seen live: a correct series-parallel circuit |

## What fails, most serious first

| # | Finding | Evidence | Effect on a student |
|---|---|---|---|
| 1 | **A worked example was wrong, and its "check" was false.** | Live Kirchhoff reply: took the drop across the series resistor as the voltage across the parallel branches (4.29 V instead of 5.71 V), then wrote "Check: I₂ + I₄ ≈ I_total" although 2.14 + 1.07 = 3.21, not 4.29. | The student is taught a wrong method with false reassurance. Nothing on the server checks the model's arithmetic. |
| 2 | **The corrected value was given away after a wrong answer.** | Live: "the derivative of 3x² should be 6x, not 3x". | The leak guard only knows the final answer (6x + 5), not the step. The student copies instead of repairing the mistake. |
| 3 | **Verified practice covers 12 topics, none of them physics.** | `engine/bank.ts`: no integration, differential equations, matrices, probability, complex numbers, Newton's laws, projectiles, Kirchhoff, induction or waves. `calc.basic_derivatives` is listed with no questions at all. | For most of a first-year syllabus, practice problems are model-written, unmarked, and can never count toward mastery, review or exams. |
| 4 | **Kirchhoff's laws were never stated** in a lesson the student asked for by name. | Live reply used series/parallel reduction only. | The named topic was not taught. |
| 5 | **Lessons are thin for university work.** | Live: the power rule was used before it was stated; no reason why a constant disappears; verification was "g′(1) = 10, which matches the slope". | Method without meaning. |
| 6 | **Maths is not typeset.** | `policy.ts` forbids LaTeX; live replies show `x^2`, `x^{n-1}`, `R_total`. KaTeX is shipped but unused by tutor replies. | Hard to read; looks unfinished. |
| 7 | **Exams mark right or wrong only.** | `markMockExam`: no marks, no credit for working. | Not how university papers are marked. |
| 8 | **No learning stages.** | The map has five levels of *strength*, not exposure → understanding → application → retention → mastery. | A student can't see what kind of evidence is missing. |
| 9 | **No formula notebook or flashcards.** | Not built (`RETENTION_ROUND` §9). | Recall of formulas and their conditions is not trained. |
| 10 | **No prerequisite diagnostic before a topic.** | Prerequisites are only revisited after repeated failure. | Gaps are found late. |
| 11 | **No exam readiness statement.** | Only "N of M topics strong". | No plain account of what is weak and why. |
| 12 | Interface defects | Each lesson card starts with a stray "—"; worked-example steps arrive on one line so step-by-step reveal doesn't work; a reply to "I don't know" is labelled "Hint 3 of 3" while the button says 3 left; the welcome card still says "It asks before it tells"; a guest is told conversations are "saved to your account". | Confusing, and one line contradicts how Menya now teaches. |
| 13 | Topic lists are hard-coded in two pages | `StudyPage.jsx`, `ExamPage.jsx` | New topics would not appear. |

## Limits that this work does not remove

- **No live-model evaluation can be run from this machine**: there is no AI provider key here. Changes to what the model is told are tested with a scripted model only.
- **Free-form answers are still judged by the model** outside the question bank.
- **Notes search is by words**, not meaning. No citations from textbooks.
- **Voice** is dictation only. No spoken replies.
- **No evidence of learning gains exists.** See `EVALUATION_PLAN.md`.
- French, Kinyarwanda and Kiswahili have had no fluent review.

## Priorities chosen

1. Check the model's arithmetic on the server, and stop corrected values leaking (findings 1, 2).
2. Widen the verified bank to first-year maths, physics, engineering and computing (3).
3. Learning stages, topic-level support, prerequisite diagnostic (8, 10).
4. Formula notebook with recall, exam marks with credit for working, readiness statement (7, 9, 11).
5. Subject teaching structure for maths and physics in the instructions (4, 5). Unverified until run against the live model.
6. Interface defects and readable maths (6, 12, 13).
