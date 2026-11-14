# Menya 5: university teaching, memory and exam readiness

Written 14 November 2026. Branch `claude/menya-5-learning-engine`, built on `claude/visual-first-tutor`.

**Status: deployed on 14 November 2026 at the owner's request (migration applied, website published, server function version 29 from this branch). A first run against the production AI model reached 7 of 20 topics and led to the fixes in section 9; a full run after those fixes is still to do, and no teacher has reviewed the replies.** The audit that led to this work is in [MENYA5_AUDIT.md](MENYA5_AUDIT.md).

## 1. What changed, in one table

| The brief asked for | What exists now | Where |
|---|---|---|
| Never present an unverified calculation as correct | The server recomputes every arithmetic line in a reply. A line that fails gets one rewrite; if it still fails the student sees "Not confirmed" with the line quoted. | `engine/mathCheck.ts`, `tutorService.ts` |
| Don't hand over the answer to a wrong step | A reply of the form "should be 6x, not 3x" is rewritten; if the model repeats it, a safe message is sent. | `answerGuard.ts` `statesCorrection` |
| Maths and physics as first-class subjects | The verified bank grew from 11 templates on 12 topics to **31 templates on 30 topics** (list below). Each is generated from a seed, marked by code, and recognises the wrong answers that named misconceptions produce. | `engine/bankStem.ts`, `engine/bankKit.ts` |
| Five levels of learning | Exposure → understanding → application → retention → mastery, each needing its own evidence. Guided successes can never look like application. | `engine/mastery.ts` `stageOf` |
| Three levels of support, per topic | Strong guidance, guided independence, independent mastery. Set from the learner's marked answers on that topic; moves both ways. | `mastery.ts` `supportLevel`, `pedagogy.ts` `SUPPORT_NOTE` |
| Diagnose before teaching | "Check what I know first": one unseen question per prerequisite, then the topic. The result names the earliest gap. | `learning.ts` `buildDiagnostic`, `POST /learn/diagnostic` |
| Teach the way the subject needs | Maths, physics and computing lessons each get their own structure (state the law by name, define symbols with units, verify with computed numbers). | `pedagogy.ts` `subjectNote` |
| Formula mastery, notebook | 28 hand-written formula cards (formula, symbols and units, when to use, conditions, origin, common mistake, recall question). The notebook shows them with the stage reached, mistakes seen and review dates. | `engine/formulas.ts`, `NotebookPage.jsx`, `GET /learn/notebook` |
| Exam marking with partial credit | Marks by difficulty (2, 3 or 4). A wrong final answer can earn method marks. Results show marks by topic and a comparison with the last attempt. | `learning.ts` `awardMarks` |
| Transparent readiness | Per exam topic, a statement of evidence in words: secure, forgetting, solved once, solved only with help, weak, not tested. No percentage, no predicted mark. | `learning.ts` `examReadiness` |
| Interactive simulation | A projectile the student controls (speed, angle, gravity), computed in the browser. | `lesson/ProjectileLab.jsx` |
| Know where you are | A five-step stage strip in the chat and on every topic, with the evidence the next step needs. | `lesson/StageSteps.jsx` |
| Readable maths | `x^2`, `x^{n-1}`, `R_1` display as x², xⁿ⁻¹, R₁. | `lib/learning.js` `prettyMath` |

Interface defects from the audit are fixed: the stray dash on lesson cards, worked-example steps arriving on one line, "Hint 3 of 3" on help that wasn't the hint button, the welcome text "It asks before it tells", the guest data note, and the hard-coded topic lists.

### Topics the bank can now check

- **Mathematics:** linear equations, 2×2 determinants, matrix multiplication, independent events, binomial distribution, complex numbers.
- **Calculus:** basic derivatives (new questions; it had none), product rule, chain rule, integrating polynomials, integration by substitution, first-order differential equations.
- **Physics:** Newton's second law, projectile motion, wave speed, Faraday's law.
- **Circuits:** Ohm's law, series circuits, voltage dividers, Kirchhoff's laws (series-parallel).
- **Engineering:** diode circuits, sampling (Nyquist), feedback steady state.
- **Digital logic:** binary ↔ decimal, Boolean simplification.
- **Computing:** loop tracing, Big-O, stacks and queues, binary search.

Integrals are marked by differentiating the student's answer numerically, so any equivalent form is accepted with or without "+ C".

## 2. How a session now runs

1. The student names a topic. If it matches a bank topic ("Kirchhoff's laws"), verified practice and the stage strip are available from the first reply.
2. Optionally, a 2–5 question diagnostic finds the earliest gap in the prerequisites.
3. The server picks the teaching move (unchanged state machine) and adds the subject structure and the support level for this topic.
4. The model writes the lesson. The server then checks, in order: answer leak, verdict against its own marking, teach-before-ask, corrected-step leak, arithmetic. Each check allows one rewrite.
5. Verified answers move the topic through the stages and set the next review date (unchanged: 1, 3, 7, 21, 60 days, back to 1 day after a failure).
6. The notebook, the study plan, Review today and exam readiness all read from those marked answers.

## 3. What was tested, and what the tests prove

Run on 14 November 2026.

| Suite | Before | Now |
|---|---|---|
| Backend (`cd supabase && npm test`) | 364 passed | **406 passed, 0 failed** |
| Web (`cd menya && npm test`) | 31 passed | **35 passed, 0 failed** |
| Web build | succeeds | succeeds; main file 166.5 KB gzipped, **up from 150.0 KB** |
| Server bundle (`npm run bundle:api`) | succeeds | succeeds |

New tests are in `supabase/tests/menya5.test.ts` and `menya/tests/learning5.test.mjs`.

**What they prove**

- Every template marks its own reference answer correct on 120 seeds, and rejects two arbitrary wrong answers.
- Reference answers for Kirchhoff, Newton, projectiles, integration, differential equations, determinants, probability, complex numbers, sampling, feedback, diodes, Faraday and binary search agree with values **worked by hand in the test file**, not taken from the templates.
- The arithmetic check catches the false line in the reply recorded from the live site, accepts the corrected working, raises no alarm on 16 true lines (units, prefixes, rounding, degrees, percentages) and skips 11 kinds of line it cannot evaluate with certainty.
- Through the real pipeline and database with a scripted model: a wrong worked example is sent back once and the corrected one is served; a model that repeats the error produces the "Not confirmed" notice; a rewrite that drops the worked example is refused; a correct reply costs no extra call; a corrected step is taken back out.
- Diagnostic, readiness, notebook and exam marks through the HTTP API, including that another learner sees none of it.

**Checked in a browser** on a local copy of the full stack with canned replies: the "Not confirmed" notice and stage strip in chat; My study with 30 topics in 7 subjects; a diagnostic from start to advice; exam marks; readiness text; the notebook with a turned card; the projectile simulation (40.8 m, 10.2 m, 2.89 s at 20 m/s and 45°, which is correct); no sideways scrolling at phone width. Screenshots could not be captured in that session, so this was verified from page content.

**What they do not prove**

- **How the real model teaches, beyond the 7 topics in section 9.** The fixes made after that run have been tested with a scripted model only.
- That any student learns more. See section 6.

## 4. Known limits

- **The arithmetic check sees numbers, not method.** It caught the live error only because the reply included a check line that failed. A wrong method with self-consistent numbers passes. It skips trigonometry without a degree sign, logarithms, and one-letter units written straight after a number.
- **Method marks are approximate.** They count intermediate results of the reference solution that appear in the student's working. Reasoning written without numbers earns nothing, and a number that matches by coincidence earns credit. Only 16 of the 31 templates list intermediate results; the rest are right or wrong.
- **The first wrong answer on a free-form problem still depends on the model** to re-explain. The server forces a new approach only from the second wrong answer (or the first, on a bank question with a recognised misconception).
- **"Understanding" is inferred** from a solve with guidance. Menya does not yet mark a student's explanation in their own words.
- **Diagnostics count toward the daily practice-exam limit** of the plan. No plan limit was changed.
- **Kinyarwanda and Kiswahili show the new labels in English.** 109 strings are listed as awaiting a fluent translator (`menya/src/locales5.js`); French is written but unreviewed. The translation test now checks that list exactly.
- **One simulation** (projectiles). Circuits and waves have computed pictures but no controls.
- **The main download grew 11 %** (16.5 KB gzipped), which matters on slow connections. Most of it is interface text.
- Formula cards exist for 28 of 30 topics (not for decimal-to-binary or loop tracing).
- Not built: semantic search over notes, textbook citations, spoken replies, marking of free-text reasoning, teacher roles, an admin view of the new data.

## 5. Evaluation with the real model

`supabase/dev/eval-menya5.ts` runs the 20 topics in the brief (six maths, six physics, four engineering, four computing) through the real pipeline: a beginner lesson, a wrong answer, "I don't know", and a harder problem. It writes every reply to `docs/MENYA5_EVAL_RESULTS.md` with what the server's checks found and blank columns for a subject teacher. The script itself was run with canned replies to confirm it works.

In PowerShell, from the `supabase` folder:

```powershell
$env:GROQ_API_KEY = "paste your key here"
```

```powershell
node dev/eval-menya5.ts
```

It makes about 80 model calls with a pause between them, so allow 15 to 20 minutes on the free tier. Read the "not holding" and "step given away" columns first, then have a maths and a physics teacher fill in the last three.

## 6. Does it help students learn? How to find out

Nothing here is evidence of learning. `EVALUATION_PLAN.md` describes a randomised trial; Menya 5 adds the instruments for it:

| Measure in the brief | How Menya 5 can now supply it |
|---|---|
| Pre-test | The diagnostic, or a practice exam on the trial topics, before any teaching |
| Post-test and delayed retention | Practice exams from unseen seeds, taken without the tutor, at the end and 3–4 weeks later |
| Unfamiliar problems | The hardest templates (Kirchhoff, substitution, binomial) held back from practice |
| Independent problem solving | Stage reached per topic: application and retention need unaided success |
| Repeated misconceptions | Mistake counts per topic in the notebook data |
| Time to mastery | Dates of first exposure and of reaching each stage |
| Confidence against competence | A one-question survey per topic beside the stage reached. Confidence is never used as evidence of learning. |

Tests should be invigilated and on paper or with the tutor switched off. A comparison group (ordinary revision, or a general assistant) is needed before any claim is made.

## 7. Deployment

Done on 14 November 2026, in this order. For the next deploy keep the same order, because the new site reads old replies but the old site doesn't know the new fields.

1. **Run the live evaluation first** (section 5) and read it.
2. **Database:** run `supabase/migrations/20261113000025_menya_diagnostic_mode.sql` in the Supabase SQL editor. It only widens the list of allowed exam modes; its header has the rollback.
3. **Website:** from `menya/`, `npm ci`, `set CACHE_DIR=C:\ghp`, `npm run deploy`.
4. **Server:** commit and push, then redeploy the `api` loader with the new commit (keep Verify JWT off).

To undo: redeploy the previous function and site. The migration can stay; nothing else depends on it.

## 8. Files

**New:** `engine/bankKit.ts`, `engine/bankStem.ts`, `engine/formulas.ts`, `engine/mathCheck.ts`, migration `20261113000025`, `tests/menya5.test.ts`, `dev/eval-menya5.ts`, `dev/demo-backend.env`, `dev/demo-web.env`; `menya/src/locales5.js`, `lib/learning.js`, `lesson/StageSteps.jsx`, `lesson/ProjectileLab.jsx`, `commercial/NotebookPage.jsx`, `tests/learning5.test.mjs`.

**Changed:** `engine/bank.ts`, `engine/expr.ts` (reads e^x; reads an answer inside a sentence), `engine/mastery.ts`, `engine/pedagogy.ts`, `learning.ts`, `api.ts`, `tutorService.ts`, `policy.ts`, `answerGuard.ts`, `lessonFormat.ts`, `dev/local-server.ts`, `dev/demo-model.ts`; `App.jsx`, `Markdown.jsx`, `i18n.js`, `locales.js`, `menya.css`, `StudyPage.jsx`, `ExamPage.jsx`, `CommercialApp.jsx`, `lib/chat.js`, `lib/backend.js`; tests `learning.test.ts`, `i18n.test.mjs`.

**Not touched:** payments, plans and limits, guest access rules, research, authentication.

## 9. First run against the production model (14 November 2026)

The owner ran `dev/eval-menya5.ts` with their key. The free tier's per-minute limit refused 13 of the 20 topics (the script then moved on instead of waiting; it now waits and retries). Seven topics got real replies: differentiation, Ohm's law, Kirchhoff's laws, waves, control, stacks and Big-O. Every reply is kept in `MENYA5_EVAL_RESULTS_RUN1_BEFORE_FIXES.md`.

**What worked:** every lesson taught before asking; the named law or rule was stated; after a wrong answer the Kirchhoff reply explained why 4 A and 2 A can't be right without giving the values; units were carried and checked in the wave and Ohm lessons.

**What failed, and what was changed**

| Seen in the run | Cause | Change |
|---|---|---|
| The Kirchhoff worked example made the same mistake as on the live site (the drop across the series resistor used as the branch voltage), this time with a check that agreed with itself. | The model does the arithmetic of its own examples. Self-consistent wrong numbers pass any arithmetic check. | **On a bank topic the worked example now comes from the server**: a problem of the same kind with every step computed by the template that marks the student. The model explains it. If it writes its own instead it is asked once to use the given one; the reply is labelled "computed by Menya" only when it did. |
| The arithmetic check recomputed 0 lines in replies full of arithmetic. | The model writes "9 V" with a narrow no-break space and uses other look-alike characters. | Those characters are normalised first. Every template's own solution steps are now run through the check in the tests. |
| "The correct derivative of 3x² is 6x." | The guard only knew the form "should be X, not Y". | "The correct … is X" is recognised too, in English and French. |
| "Give me a harder problem" was treated as another attempt at the old question. | Only the button asked for a new problem. | A typed request is treated like the button, so a checked problem is served when the topic has one. |
| After "I don't know" on a one-step problem the student got "Carry out the step you've just set up". | The reply gave the answer away, and the stand-in message assumed the student had set something up. | A student who says they don't know gets a different stand-in message (English and French; other languages keep the old one). |
| 13 topics refused as busy. | Each lesson uses a large share of the free tier's tokens per minute. | Not fixed: this is capacity, not code. The same will happen to students at busy times until a paid AI tier is used. The script now waits. |

Not changed: the "check" in the differentiation lesson ("g′(1) = 2, which matches the slope of the tangent") proves nothing. With the server's example in place this should stop for bank topics; a full run will show.

### After deploying (same day)

The first live question on the deployed site showed the model **ignoring the server's worked example twice** and writing its own (correct that time). Two changes followed, deployed as function versions 28 and 29:

- The checked example is now given to the model right beside the student's message instead of inside the longer engine note.
- If the model still writes its own, **the server replaces the worked-example section with its own computed one** (problem, method, each step on its own line, result). This happens for lessons in English only, because the server's example is written in English; in other languages the model's example stays and is not labelled as checked.

Worked-example steps are now shown all at once, each on its own line (the owner's choice), instead of one at a time behind a button.

Version 29 also stops the answer-leak guard from reading the server's own example as the student's answer (a value such as "1 A" in the example had replaced a whole lesson with a stand-in question). Checked on the live site afterwards: the Kirchhoff lesson used the server's example (30 V, 3 Ω, 20 Ω and 30 Ω: 12 Ω, 15 Ω, 2 A, 24 V, 1.2 A), named both laws, showed six steps on separate lines and carried the "computed by Menya" label. That is one question, not an evaluation: the 20-topic run is still to do.

## 10. Lesson layout like a textbook (14 November 2026, owner's request)

The owner asked for the lesson to look like a worked textbook page. Deployed the same day.

| Part | Now |
|---|---|
| See how it works | On a bank topic, an **interactive visual** that starts at the worked example's numbers: a circuit with sliders that shows every current and voltage and checks Kirchhoff's two laws live (Ohm's law, series, voltage divider, Kirchhoff); a secant line turning into the tangent (derivatives); rectangles filling the area under a curve (integrals); a block with force arrows (Newton's second law); a moving wave (v = f·λ); the projectile launch. Computed in the browser, so it doesn't use the picture allowance. Other topics keep the drawn picture. |
| Worked example | Numbered steps with a bold title ("2. Find R_parallel"), the sentence explaining the step, and each equation typeset and centred on its own line. Plain-text maths from the reply is converted for display; a line that can't be converted with confidence stays plain text. |
| Try it yourself | On a bank topic, in English: **"Test your understanding"**, a new problem of the same kind with three or four options and a "Check answer" button. The wrong options are the answers the topic's named mistakes produce (for Kirchhoff, the series-drop mistake seen on the live site). The browser never knows which option is right: the server marks the choice and the next reply explains. A wrong choice can be changed and checked again; a right one closes the check. Typed work on the student's own problem is never marked against it. |

The worked example and the check are never the student's own problem (a generated problem whose numbers all appear in the student's message is skipped).

Limits: the check exists for 25 of 31 question types (not the chain rule, decimal to binary, Boolean simplification, Big-O, matrix products or complex products, where the wrong options aren't numbers or expressions the template can name). A right pick counts as practice evidence only, at low weight, because a pick can be a guess. Not in other languages yet, because the problems are written in English.
