# Evaluation plan: does Menya improve independent problem solving?

**No claim about learning gains or grades may be made until this study (or a comparable one)
has been run and analysed.** What exists today is behavioural testing (docs/DEMO.md,
docs/CHANGELOG.md), which shows how the system behaves, not that students learn more.

## Question

Do first-year ICT and engineering students who practise with Menya (Learn mode) solve
**unseen** problems **without AI** better, and retain it longer, than students who practise
with a general-purpose AI assistant (ChatGPT, Claude or similar) on the same material?

## Design

- **Randomised controlled trial**, individual randomisation (stratified by baseline score and
  programme), two arms: (A) Menya Learn mode; (B) a general-purpose assistant, used as students
  normally would. Same tasks, same time on task (e.g. 3 × 45-minute sessions over 2 weeks).
- **Participants:** first-year students in at least two courses (e.g. Calculus I, Circuits I or
  Programming I) at a partner university; target 60+ per arm (see power below). Informed
  consent; ethics approval from the university's research ethics committee; participation must
  not affect course grades.
- **Topics:** objectives from `engine/bank.ts` (e.g. product rule, series circuits, loop tracing).
- **Pre-registration** of hypotheses, outcomes and analysis before data collection.

## Measures

| Measure | How | When |
|---|---|---|
| Baseline | 10-item paper test on the objectives, no AI | Week 0 |
| Post-test | Parallel-form test, **unseen items**, no AI, invigilated | End of week 2 |
| Delayed retention | Third parallel form, no AI | 3–4 weeks after post-test |
| Explaining reasoning | 2 open items marked with a rubric ("why does this step hold?") | Post and delayed |
| Help needed (Menya arm) | Hint levels, examples, Explain-mode use (`assessment_attempts`, message meta) | During |
| Time to objective | Time until first independent success on a "Check yourself" item | During |
| Incorrect tutor feedback | Random sample of 200 tutor replies per arm, double-coded by two instructors (wrong statement, wrong verdict, leaked answer) | During |
| Satisfaction / continued use | Short survey (SUS + 3 items); voluntary use in the 4 weeks after | Post, follow-up |
| Feedback ratings | Bad / Fair / Good in-app (admin Excel export) | During |

Tests are generated from the bank's templates with **seeds no participant has seen**, so both
arms face identical items; answers are marked deterministically plus rubric marking for
explanations by **markers blind to arm**.

## Analysis

- Primary outcome: post-test score, ANCOVA with baseline as covariate; effect size (Hedges' g)
  with 95 % CI. Secondary: delayed retention (same model), explanation scores, help needed.
- Power: to detect g = 0.5 (α = 0.05, power 0.8) needs about 64 per arm; plan 75 per arm for
  attrition.
- Report all pre-registered outcomes, including null or negative results.
- Distinguish **guided completion** (solved with Menya's help) from **independent mastery**
  (post-test and delayed test without AI); only the latter answers the question.

## Threats and mitigations

| Threat | Mitigation |
|---|---|
| Contamination (arm A uses ChatGPT too) | Ask, log in-app time; analyse per protocol as a secondary analysis |
| Novelty effect | Delayed test; follow-up usage |
| Instructor bias | Blind marking; pre-registered rubric |
| Item familiarity | Unseen seeds; parallel forms checked for equal difficulty in a pilot |

## Pilot first

Run a 2-week pilot with 15–20 volunteers to check the procedure, item difficulty, logging and
the incorrect-feedback rate before the full trial.
