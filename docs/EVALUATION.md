# Tutoring quality evaluation

Models are chosen on measured tutoring quality, not size or marketing. The same cases and
rubric are used for every candidate.

## How to run

```bash
cd menya                                   # GROQ_API_KEY in menya/.env
npm run eval                               # default model
EVAL_MODELS=openai/gpt-oss-20b,openai/gpt-oss-120b npm run eval
```

`scripts/eval-tutor.mjs` calls the model with the shared policy (`supabase/functions/_shared/policy.ts`)
**without** the server-side answer guard, so it measures the raw model. In production the guard
adds a second line of defence against answer leaks.

## Dataset

| Case | Language | What it probes |
|---|---|---|
| Ohm's law current | English | numeric problem; hints 1–3; plea for the answer; wrong answer; right answer |
| Derivative of x²·sin x | French | symbolic answer (hardest to hint without leaking) |
| Average speed | Kinyarwanda | low-resource language, full conversation |
| Newton's second law | Kiswahili | low-resource language, physics vocabulary |
| Binary search steps | Spanish | CS reasoning; an off-by-one trap (⌊log₂ n⌋ + 1) |
| "What is entropy?" | English | concept question → should explain directly, not quiz |
| "What is recursion?" | Kinyarwanda | concept explanation in a low-resource language |
| "Find the current in the circuit." | English | ambiguous / missing data → should ask, not guess |

Each full conversation is seven turns (38 model calls per model). Still missing and worth adding:
long conversations (20+ turns), questions where the tutor should admit uncertainty, and more
subjects and languages relevant to target universities.

## Rubric

Automated (in the script): reply language, final answer never stated by the tutor before the
learner gives it, reply type per turn (hint / redirect / affirmation / explanation / question).

Human review (score 0–2 each, by an educator, ideally a native speaker for each language):

1. **Correctness**: every statement and hint agrees with the right solution.
2. **Hint progression**: L1 names the concept, L2 gives the relationship, L3 sets up the step with a blank; each is more specific.
3. **Socratic behaviour**: guides without revealing; doesn't quiz when asked to explain.
4. **Diagnosis**: identifies the learner's actual mistake.
5. **Language quality**: natural, correct terminology, no word-for-word translation.
6. **Consistency**: later turns don't contradict earlier ones.

## Results (2026-10-24, Groq free tier)

| Model (Menya role) | Automated checks | Median latency* | Human review (by Claude, not an educator) |
|---|---|---|---|
| `openai/gpt-oss-20b` (small → Free) | 8/8 | 8.3 s | Accuracy slips: described recursion in Kinyarwanda as a function "entering another function" (wrong: it calls itself); misdiagnosed a multiplication error as subtraction; accepted the right binary-search answer with an invalid justification ("ceil adds 1"); French L3 hint left only `cos(x)` blank. |
| `openai/gpt-oss-120b` (medium/strong → Pro, Professional) | 8/8 | 7.8 s | Correct recursion explanation with base case; correct diagnoses ("division, not multiplication"); good blanks in L3 hints. Shared flaw: its Spanish L2/L3 hints used ⌈log₂ n⌉ (= 10) and then accepted 11 without noting the inconsistency. Minor Kinyarwanda wording slip. |

\* Includes rate-limit waits on Groq's free tier; not representative of paid-tier latency.

Earlier runs of `gpt-oss-120b` during prompt tuning (same day) found, and led to fixes for: the
first reply jumping to a Level 2 hint; hints narrating the tutor's own rules; revealing the
correct value while correcting a wrong answer; a French Level 3 hint writing out the whole
derivative (now also caught by the server-side answer guard); Kiswahili using *msongamano*
(density) for acceleration.

### Conclusions

- Both models follow the Socratic structure and reply in the learner's language, including
  Kinyarwanda and Kiswahili.
- **The smaller model makes noticeably more factual and diagnostic errors**, and a follow-up
  probe showed it **never fills the private `finalAnswer` field**, even when required, so the
  server-side leak guard cannot protect its replies (it leaked a full derivative in a live test).
  `gpt-oss-120b` reported the answer from the first hint onward. **Decision: Free now routes to
  `gpt-oss-120b`** (≈ $0.0003 more per message, ≈ $0.08 per Free user per month at the full
  allowance). The server also remembers each session's answer for turns where a model omits it.
- Maths formatting: LaTeX backslashes were corrupted on the way through the provider's JSON output
  (`\sin` → `sin`, `\(` → `(`), so the policy now asks for plain Unicode maths (x², 2x·sin x, a/b).
  The web app still renders `$…$` maths and repairs common corruption for providers that keep backslashes.
- Neither model is reliable on off-by-one reasoning; the premium tier exists for hard problems,
  but it has **not been evaluated yet** (no Anthropic key available during this work).
- Kinyarwanda and Kiswahili output must be reviewed by native-speaker educators before launch.
- Local Qwen3 models have not been evaluated (no suitable GPU); run this suite on them first.
