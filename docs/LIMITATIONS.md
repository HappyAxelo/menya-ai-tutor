# Limitations: what is not implemented or not verified

Stated plainly so nobody overclaims. Updated 31 October 2026.

## Not implemented

- **Course materials: word search only.** Learners can add their own notes (*My notes*); the tutor
  receives the passages that share words with the question (Postgres full-text search). Questions
  phrased very differently from the notes may miss the right passage (no semantic search). Scanned
  PDFs and images can't be stored as notes. Whether the live model always cites the page when it
  uses a passage is not yet measured.
- **Practice exams cover only the 12 bank objectives**, are marked right / wrong (no partial
  credit, working is not graded), and Big-O / Boolean topics have few distinct questions.
- **No parental consent or age-specific experience** yet; needed before marketing to schools
  with learners under 18.
- **No teacher or class roles** (institutions have seats and an aggregate dashboard only).
- **Sandboxed code execution.** Programming checks are deterministic tracing and Big-O items;
  student code is **never executed**. Running student code needs an isolated sandbox service
  (not on the API server), which is not set up.
- **Free-form problems are not deterministically verified** unless the learner's final result
  matches the tutor's private answer, or it is a chemical equation. For other free-form work the
  verdict is "unknown" and the model's judgement is used, with its low-confidence diagnoses
  ignored. Deterministic verification covers the 11 bank templates only.
- **Bank coverage is small** (12 objectives, 11 templates). Many first-year topics (Kirchhoff's
  laws with multiple loops, integration, data structures beyond loops, Karnaugh maps…) have no
  templates yet; for those, practice problems are model-written and not verified.
- **Automatic recurring payments.** IremboPay has no subscriptions in the API used here; each
  payment buys one period, and paying early starts the new period at the payment time (unused
  days of the old period are not carried over).
- **More than one HPC job at a time.** The server routes to one registered HPC address.
  Several jobs (load balancing) would need a list of addresses.

- **Small templates run out of unseen variants.** Some templates have few distinct questions
  (Boolean simplification 5, Big-O 4). When a learner has seen them all, "Check yourself" falls
  back to a model-written problem, which is **not** deterministically verified. Add more
  templates before relying on those objectives for mastery.

- **Voice in Kinyarwanda.** Whisper (used for voice notes) doesn't support Kinyarwanda. For
  Kinyarwanda, Menya uses the browser's own speech recognition (Chrome, Edge) when the browser
  offers it; otherwise the recording goes to Whisper, which will transcribe it poorly. Not tested
  with native speakers.
- **Attachments**: up to 5 files and ~8,000 characters of their text per message (Groq free-tier
  token limits); longer files are cut, and the tutor is told so. Videos and old Office formats
  (.doc/.ppt/.xls) are not read. Scanned PDFs: only the first 3 pages are read (as images).
  Handwriting recognition depends on the vision model and photo quality.

## Implemented but not yet verified in production

- **IremboPay**: built from the public API documentation and tested against signed sample
  notifications; **not yet tried against the IremboPay sandbox** (needs merchant credentials).
  Run one sandbox payment end to end before going live (docs/BILLING.md).
- **Slurm deployment**: scripts are syntax-checked and the self-test was exercised against a
  stand-in server; **not yet run on a real cluster**. Cluster policies differ (outbound internet
  from compute nodes, job length, modules). Follow docs/HPC.md and check `check-network.sh` first.
- **Open models on the HPC**: tutoring quality of `gpt-oss-120b` / `gpt-oss-20b` served by vLLM
  has not been measured with Menya's test suites. Run `supabase/dev/try-long-conversations.ts`
  against the HPC model before routing students to it.
- **Translations**: the interface's Kinyarwanda and Kiswahili texts (including the new engine
  texts) need review by native speakers.
- **Learning outcomes**: no evidence yet. See docs/EVALUATION_PLAN.md. Do not claim Menya
  improves grades or learning until a study shows it.

## Known behaviours to watch

- The model's wording varies between runs; the engine fixes the teaching move, not the exact text.
- A correct answer typed with no reasoning is not counted until the learner explains it; some
  learners may find the follow-up question repetitive.
- Free Groq limits are shared by all learners; heavy testing can slow live use for a few hours.
