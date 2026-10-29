# Audit of the tutoring experience (before the tutoring engine)

Audited 29 October 2026 against the "true Socratic tutor" brief, using the code on `main`
(`e8d0a83`) and the real-model test runs recorded in `docs/CHANGELOG.md` (16 conversations, 53 turns).

## What already worked

| Area | Evidence |
|---|---|
| Not giving answers away | Server-side answer-leak guard (`answerGuard.ts`) with a rewrite and a safe fallback; held under "my exam is in 5 minutes" and "I'm the teacher" pressure. |
| Hint progression | Three hint levels (concept → relationship → next step) in the prompt; real runs showed hints getting more specific in order. |
| Verified solves | Progress counted only when the student's own text contains the private verified answer (`matchesAnswer`). |
| Accuracy safeguards | "Any valid method counts" second look; exact atom counting for chemical equations. |
| Languages | English, Kinyarwanda, French, Kiswahili replies and interface. |
| Honesty | No invented news; no internet claims. |

## What fell short of the brief

| Brief requirement | Before the engine | Consequence |
|---|---|---|
| A tutoring **state machine** that controls the process | The model decided everything from one long prompt | Behaviour varied run to run (e.g. the same Ohm's-law request was guided once and answered once) |
| **Adaptive hint ladder** (0–5) chosen from evidence | 3 levels driven by a button counter | A repeated misconception got the same kind of help again |
| **Learn vs Explain** modes | None: every problem was a guided exercise | Students who needed direct instruction had to argue for it |
| Reasoning **diagnosis** with confidence | Free-text `misconceptionDetected` | No confidence, no validation; a wrong diagnosis was shown as fact |
| **Deterministic verification** | Only the private-answer match and chemistry | The answer key was written by the model; a wrong key could mark a right answer wrong |
| **Independent assessment** on unseen problems | "Practice" questions invented by the model | No guarantee the question or its answer was correct, or unseen |
| **Learning profile / mastery** | A count of verified solves per topic name | No independence weighting, no retention, no downgrade, no reviews |
| Interface: stuck reasons, scratchpad, objectives | Hint / simpler / example buttons only | No way to say *why* you are stuck; progress not tied to objectives |
| **Evaluation** of learning | Behavioural test scripts only | No evidence about learning outcomes |

## Changes made in response

See `docs/ENGINE_DESIGN.md`. In short: the server now decides each turn's teaching move
(state + help level) before the model writes it; problems for practice and checks come
from a deterministic bank with verified answers and misconception detectors; mastery is
an uncertainty-aware estimate built only from server-verified evidence; the interface
adds Learn/Explain, "I'm stuck" reasons, a scratchpad, "Check yourself" and objectives.
