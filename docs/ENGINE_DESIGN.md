# Tutoring engine design

Menya does not hand the conversation to a language model. For every turn the **server**
decides the teaching move from what it can verify, then the model writes that move in the
learner's language, and the server checks the result again before it reaches the learner.

```
learner message ──► verify (bank marking / answer match / chemistry) ──► decideTurn() ──► engine note
                                                                                         │
     reply ◄── leak guard ◄── reconcile model assessment with server check ◄── model writes the move
       │
       └─► learning profile (verified evidence only) ─► spaced review schedule
```

## Components (separated as the brief asks)

| Concern | Where |
|---|---|
| Conversation management | `tutorService.ts` (sessions, messages, quota, routing, retries) |
| Tutoring state and transitions | `engine/state.ts` — `decideTurn`, `selectHintLevel` (pure, unit-tested) |
| Student knowledge state | `engine/mastery.ts` + table `learner_objectives` |
| Assessment generation | `engine/bank.ts` (templates + seeds) |
| Answer verification | `engine/bank.ts` marking, `engine/expr.ts` (symbolic/Boolean), `chemistry.ts`, `answerGuard.ts` |
| Hint selection | `engine/state.ts` — `selectHintLevel`, `HINT_LADDER` |
| Progress tracking | `assessment_attempts`, `learner_objectives`, `learning_events` |
| Course content retrieval | **Not implemented** (no official course materials available yet) — see LIMITATIONS |
| User interface | `menya/src/App.jsx`, `ProgressPage.jsx` |
| Subscription and usage | `billing.ts` (IremboPay), quota SQL functions |

## States and transitions

| State | Meaning | Entered when |
|---|---|---|
| DIAGNOSE | Find out what the learner knows / what the problem needs | first message of a problem; "I don't know where to start" |
| GUIDE | One focused question on the next step | default continuation; wrong answer with unknown cause; answer unreadable; correct answer **without reasoning** (justify first) |
| HINT | A clue at the chosen ladder level | hint button; a diagnosed misconception (first time); stuck on a step; asked for the answer too early |
| EXPLAIN | Teach a prerequisite or the idea directly | "I don't understand the idea"; "explain more simply"; **Explain mode**; answer requested after genuine attempts; still stuck after a worked example |
| MODEL | Work a similar problem with different numbers, then hand back | worked-example button; the **same misconception twice**; three or more wrong attempts |
| PRACTISE | A related bank problem | practice button; independent success that isn't yet mastery |
| VERIFY | An unseen problem solved **alone** | after a guided solve ("Check yourself") |
| REVIEW | An earlier objective after a delay | review prompt (welcome screen / progress page) |
| MASTERED | Provisional mastery recorded | the mastery rule is met by this attempt |

The rules live in `decideTurn()` in this order: Explain mode → explicit actions (practice,
verify, review, summary, example, simpler) → verified correct → stuck reason → answer
requested → hint button → verified incorrect (misconception / repeats / attempts) → new
problem → unreadable → continue. The model never chooses the state.

## Hint ladder (0–5)

| Level | Help |
|---|---|
| 0 | Reflective question: name the concept/relationship (Menya doesn't name it) |
| 1 | Directional: point to the principle, formula, construct or law |
| 2 | Conceptual: explain the principle in general terms |
| 3 | Partial worked step: do one step, the learner does the next |
| 4 | Analogous worked example with different numbers and a different result |
| 5 | Full explanation (only after genuine attempts, in Explain mode, or when withholding stops learning) |

`selectHintLevel` is not a counter: a named misconception starts at 1; the same misconception
again jumps to 4; "I don't understand the idea" starts at 2; "stuck on a step" at 3; repeated
failure after level 3 moves to 4. The hint **button** never goes past 3; level 5 is only reached
through the rules above, and Learn mode never reaches it before two genuine attempts.

## The model's structured assessment, validated

Each reply includes a private `assessment` (verdict, reasoning validity, misconception,
confidence 0–1, prerequisite gap, objective from a fixed list). `parseAssessment` rejects
malformed output; `reconcile` applies three rules:

1. If the server verified the answer, the **server wins**. A model that calls a verified-wrong
   answer right gets a second look with the facts; if it still insists, a fixed "not yet"
   message is sent instead. A verified-right answer the model rejects gets a second look too.
2. A diagnosis with confidence < 0.6 or "unclear" reasoning is **not acted on** or recorded;
   the engine asks a diagnostic question instead.
3. Internal state (assessment, answer keys, engine rationale) never reaches the browser; the
   response carries only the state name, help level, verified verdict and mastery summary.

## Verified assessment bank

`engine/bank.ts`: 11 templates over 12 objectives (linear equations; product and chain rule;
Ohm's law, series circuits, voltage dividers; binary↔decimal; Boolean simplification; loop
tracing; Big-O). Each template has a learning objective, difficulty, reference solution
computed from the seed, rubric, expected intermediate steps, misconception catalogue and a
marking function:

- numbers with units and SI prefixes (`250 mA` = `0.25 A`), with relative tolerance;
- symbolic answers by **evaluation at random points** (a factored derivative is accepted);
- Boolean answers by **full truth table**, plus a literal count for "simplified";
- loop outputs and Big-O by exact comparison.

Misconceptions are detected by computing the answer each misconception produces (V×R,
u′·v′, reversed bits, including `range()`'s stop value…). Items are generated from fresh
random seeds and recorded in `served_items`, so a "Check yourself" problem is genuinely
unseen. Reference answers live in `session_items`, which learners cannot read. If an answer
can't be read, the verdict is "unreadable" and nothing is recorded.

## Learning profile and mastery

Per learner and objective (`learner_objectives`): a Beta(α, β) estimate, counts of
independent / guided / incorrect / delayed successes, misconceptions seen, next review date.

- Evidence weights: delayed independent success 1.5; independent 1; practice 0.5; guided 0.3
  (minus 0.1 per hint); a bare correct answer with no reasoning at most 0.2. Failures add 1
  (independent) or 0.5 (guided) to β.
- **Provisional mastery**: estimate ≥ 0.8, lower 90 % bound ≥ 0.6, ≥ 2 independent successes on
  unseen problems, and ≥ 1 of them at least two days after the previous success.
- Later failures lower the estimate, so mastery is lost again when evidence shows a gap.
- Reviews: after a success 1 → 3 → 7 → 21 → 60 days; after a failure, the next day.
- Conversation length, number of chats and self-reported confidence never count.

## Tests

`supabase/tests/engine.test.ts` covers the ten scenarios in the brief (first-time correct,
common misconception, repeated wrong answers, asking for the answer in Learn mode, Explain
mode, prerequisite, correct guess without reasoning, guided success but failed unseen check,
returning after several days, uncertain/incorrect model evaluation), the hint ladder, and the
bank (every template × 40 seeds marks its own answer correct; misconception detection; unseen
variants). `engine-pipeline.test.ts` runs the engine inside the real pipeline with a scripted
model and the real database rules.
