# Visual-first, adaptive and multilingual tutor upgrade

Written 9 November 2026. This describes what was built on top of the existing Menya, what was tested and how, and what is still not done.

**Status: built and tested in the working copy. Not committed, not deployed, and not yet run against the production model.**

## 1. The existing architecture

| Part | What it is |
|---|---|
| Web app | React and Vite in `menya/`, hosted on GitHub Pages |
| Server | One Supabase Edge Function (`supabase/functions/api`) over shared TypeScript in `_shared/` |
| Data | Postgres with row-level security; plans, quotas, guest access and payment records are in SQL |
| Model | `gpt-oss-120b` on Groq (free tier), with fallbacks; a university HPC route is prepared |
| Tutoring | `engine/state.ts` picks a teaching move on the server; the model writes it; the server verifies answers, guards against leaks and tracks mastery |
| Payments | IremboPay (`billing.ts`). **Not touched.** |

## 2. Weaknesses found

| Weakness | Where | Effect |
|---|---|---|
| The tutor was told to ask before teaching | `policy.ts`: "Don't give the formula or do any of the working yet"; the `DIAGNOSE` state | The main complaint: questions before the student could answer them |
| Replies capped at about 4 sentences | `policy.ts` | No room for an explanation plus an example |
| A wrong answer of unknown cause led to another question | `state.ts` | Interrogation |
| Eight picture kinds, offered only on some turns | `diagram.ts` | No fractions, truth tables, flowcharts, biology or chemistry |
| Everyone defaulted to "University" | `settings.js` | Secondary students got university language |
| Replies were one long block | `App.jsx` | Text-dense on a phone |
| No record of how teaching went, beyond verified solves | `learning_events` | Teaching could not be measured |
| The leak guard missed `x = 4.` with a full stop | `answerGuard.ts` (bug found by a new test) | The answer could get through in the commonest form. Fixed. |

## 3. How a lesson now works

**SHOW → EXPLAIN → DEMONSTRATE → GUIDE → ASK → EVALUATE → ADAPT** is enforced by code, not only requested in a prompt.

1. `state.ts` decides the move. A new problem is now `TEACH`. `PREREQ` is new: repeated failure goes back to what the topic depends on.
2. `engine/pedagogy.ts` decides the shape of the reply, picks a visual that suits the topic and reads what the answer is evidence of.
3. The model writes the lesson. It fills in a private `teachingPlan` first (goal, prior knowledge, prerequisite, visual, example, question).
4. The server checks the result. **A reply that asks before it teaches gets one rewrite.**

| Situation | What Menya does |
|---|---|
| New problem | Idea, picture, worked example on a different case, then one question about the first step |
| Quick fact or greeting | A short answer, no lesson |
| Correct | Says why, then goes harder |
| Partly right | Names what's right, explains the gap, smaller example, targeted question |
| Wrong | Names the likely misunderstanding, a new explanation, an easier question |
| Wrong repeatedly | Explain another way, then worked example, then the prerequisite |
| "I don't know" | Hint, explanation, worked example, prerequisite, full solution. Never the same question. |
| Solved with help, failed alone | Recorded as "can't apply yet"; demonstrates the step that broke down. No mastery. |

Help follows six levels: conceptual reminder, small hint, more specific hint, partly completed solution, worked example, full explanation.

Mastery keeps its existing strict rule: two independent successes on unseen problems, one of them after a break. One assisted answer never counts.

## 4. The visual engine

The model describes what to show. **Code does the drawing**, so no model-written SVG, HTML or script reaches a browser. Pictures display through `<img>`, where a browser runs no scripts, and every one passes an allowlist check on the server and again in the app.

| Subject | Visuals built |
|---|---|
| Maths | Fraction bars, number lines with jumps and intervals, coordinate geometry on one true scale, plotted graphs with a slider, triangles |
| Physics | Force diagrams, plus the circuit and energy kinds below |
| Biology | Checked illustrations: photosynthesis, plant cell, animal cell |
| Chemistry | Particle view of a reaction (**refuses an unbalanced equation**), energy diagram, molecules, atoms, states of matter |
| Computer science | Flowcharts with loops, step-through arrays |
| Electronics | Circuits, gate diagrams and truth tables **worked out from the expression**, waveforms |
| Geography | Water cycle, volcano cross-section, climate graphs |
| Statistics | Histograms (computed from data), scatter plots with a computed best-fit line, bars |
| General | Timelines, comparison tables, process flows |

What can't be drawn correctly is refused. The model gets one chance to correct its description, then the lesson continues in words.

Components: `VisualExplanation`, `InteractiveLearningVisual` and the table view (`menya/src/lesson/VisualExplanation.jsx`); `LessonSections` and `StepByStepExample` (`LessonMessage.jsx`). Renderers: `diagram.ts`, `visuals.ts`, `visualTemplates.ts`, with shared helpers in `svgKit.ts`. Every kind goes through one pipeline, so there are no per-subject implementations. **No new dependency and no image-generation cost.**

To inspect them all: `cd supabase && node dev/visual-gallery.ts out.html French`

## 5. Language and level

`_shared/language.ts`. Only the rules that apply to this learner are sent.

- **Français facile** applies to all French below advanced university level. It uses the brief's example of what to avoid.
- **Accessible English**: short sentences, one idea per paragraph, words defined on first use.
- **Kinyarwanda**: natural teacher-like explanation, everyday Rwandan examples, and a rule never to invent a term. Picture labels use only everyday Kinyarwanda words; scientific terms stay in English rather than being translated by guesswork.
- **Levels**: lower secondary, upper secondary, university introductory and advanced, plus "work it out for me", now the default. The level comes from the student's choice, then what they say ("I'm in S2"), then their profile. Unknown means an accessible start, never "university".
- The student's language is what they chose or wrote. Rwanda is never treated as meaning Kinyarwanda. Changing language mid-lesson continues the same lesson.
- Language gets plainer when a student says they're lost or presses "Explain more simply".
- `readability()` flags dense text in logs and tests. It is a rough screen and does not judge quality.

## 6. Interface

A reply is split into numbered cards: *Understand the idea*, *See how it works*, *Worked example*, *Try it yourself*. The question card stands out. Worked examples reveal a step at a time. Visuals open in a larger view with zoom. A simple question still gets a plain short reply.

New help actions, behind one "More ways to help" button: another way, smaller steps, a similar problem solved, test my understanding. Existing ones stay in view.

Sections are markers inside the normal message text (`lessonFormat.ts`), so the leak guard, citation checks, saved history and exports all keep working. Old conversations display as before.

## 7. Database

Two migrations: `20261109000023_menya_teaching_events.sql`, and `20261109000024_menya_free_three_pictures.sql`, the owner's decision to give the Free plan 3 pictures a day (was 1).

It adds `teaching_events`: concept introduced, visual shown, example shown, hint requested, response submitted, misconception detected, explained again, independent answered, mastery assessed. **Only the kind of event is stored, never what anyone wrote.** Row-level security lets learners read their own and write none. Guest sign-up, "forget my learning data" and data export all include it. The tutor keeps working if the table doesn't exist yet.

Recent events shape the next conversation: a learner who has needed a lot of help starts with smaller steps.

**The Free plan's picture limit is the only plan setting that changed.** No other limit, price or payment setting did, and a test asserts it.

## 8. Test results

Run on 9 November 2026.

| Suite | Result |
|---|---|
| Backend before this work | 298 passed |
| Backend now (`cd supabase && npm test`) | **347 passed, 0 failed** (Free plan's 3 pictures included) |
| Web now (`cd menya && npm test`) | **31 passed, 0 failed** |
| Production build | Succeeds. Main bundle 149.9 KB gzipped, up from 142.7 KB. |

**What these tests prove.** `tests/teaching-scenarios.test.ts` runs all 13 scenarios through the real pipeline and database with a *scripted* model. That shows the server chooses the right move, sends the right instructions, rewrites question-first replies, keeps answers protected and doesn't give away mastery. `tests/visuals.test.ts` shows the visuals are computed correctly and nothing unsafe gets out.

**What they do not prove.** A scripted model can't show how well a real model teaches. Existing tests whose assertions described the old ask-first behaviour were updated to the new behaviour.

**Checked by eye.** All 33 sample visuals in English and the labelled ones in French. The lesson screen in the running app at phone width, in light and dark, including step reveal, expanded view and tables, using canned replies. This found and fixed: a flowchart arrow overlapping its exit, overlapping labels, a misplaced membrane pointer, clipped French labels and an expanded view trapped in the chat column.

## 9. Known limitations and outstanding work

**Not done, and must be before relying on this:**

1. **No live-model evaluation has been run.** There is no Groq key on this machine. The local `llama3` is CPU-only with a context smaller than Menya's prompt; it timed out and would have proved nothing. Run `dev/eval-teaching.ts`; it writes every reply plus blank reviewer columns to `docs/TEACHING_EVAL_RESULTS.md`.
2. **No fluent speaker or teacher has reviewed anything.** French and Kinyarwanda quality and subject accuracy are **unvalidated**. See `docs/LANGUAGE_REVIEW.md`.
3. **Whether real models follow the lesson format is unknown.** A model that ignores the markers still works, as a plain reply.
4. **Reply length against the 2,000-token output limit is unmeasured.** Lessons are longer than old replies. If the evaluation shows failed or cut-off replies, raise `max_output_tokens` in Admin → Models.

**Limits of what was built:**

- The Free plan now has 3 pictures a day, the same as Pro, so pictures are no longer a reason to upgrade to Pro. After the third, tables and worked examples continue.
- Prompts grew by about 2,100 characters (16%) plus a lesson note on teaching turns, which matters on Groq's free tier. Picture instructions shrank by 35% because only relevant kinds are sent.
- No maps: geography has cross-sections and graphs only. No anatomy beyond the two cells. Labelled pictures exist only for the six templates; other topics fall back to process diagrams or words.
- What some pictures *say* still depends on the model, for example which forces act on an object. The drawing is exact; the description is not verified.
- Teaching events have no admin dashboard yet. They can be queried in SQL.
- The picture-free developer mode (own Groq key) has no engine, so it gets no lesson sections.
- Word-based topic detection covers common topics in English and French, and fewer in Kinyarwanda.

## 10. Deployment

Deploy in this order, because the new website can read old replies but the old website would show raw `@@idea` markers.

1. **Database.** Supabase SQL editor: run `supabase/migrations/20261109000023_menya_teaching_events.sql`. (`20261109000024_menya_free_three_pictures.sql` was applied to the live database on 9 November 2026.)
2. **Website.** From `menya/`, on Windows:

```bash
npm ci
```

```bash
set CACHE_DIR=C:\ghp
```

```bash
npm run deploy
```

3. **Server.** From `supabase/`, build the bundle, then deploy `dist/api/index.ts` as the `api` function (keep Verify JWT off):

```bash
npm run bundle:api
```

**Before step 3**, run the evaluation with your key, and have reviewers read it:

In PowerShell, from the `supabase` folder:

```powershell
$env:GROQ_API_KEY = "paste your key here"
```

```powershell
node dev/eval-teaching.ts
```

To undo: the migration's header lists its rollback, and redeploying the previous function and website restores the old behaviour. Lessons already saved would then show their markers.
