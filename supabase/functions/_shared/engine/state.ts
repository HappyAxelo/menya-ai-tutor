// The tutoring state machine. It decides the teaching move for each turn
// BEFORE the language model is called; the model only writes that move in
// the learner's language. Pure functions: every rule here is unit-tested.
//
// States:   DIAGNOSE  find out what the learner knows / what the problem needs
//           GUIDE     ask for the next reasoning step
//           HINT      a clue at a chosen ladder level (never the answer)
//           EXPLAIN   teach a prerequisite or clear up a misconception
//           MODEL     work a similar, different problem, then hand back
//           PRACTISE  a related problem from the bank
//           VERIFY    an unseen problem, solved without help (mastery evidence)
//           REVIEW    an earlier objective, after a delay (retention evidence)
//           MASTERED  provisional mastery recorded
//
// Hint ladder (0-5), chosen from evidence rather than a counter:
//   0 reflective question · 1 directional hint · 2 conceptual hint
//   3 partial worked step · 4 analogous worked example · 5 full explanation

export type EngineState = "DIAGNOSE" | "GUIDE" | "HINT" | "EXPLAIN" | "MODEL" | "PRACTISE" | "VERIFY" | "REVIEW" | "MASTERED";
export type Mode = "learn" | "explain";
export type StuckReason = "start" | "step" | "mistake" | "concept";
export type EngineAction = "message" | "hint" | "simpler" | "example" | "check" | "practice" | "summary" | "verify" | "review" | "stuck";
export type CheckedVerdict = "correct" | "incorrect" | "unreadable" | "unknown";

export const HINT_LADDER: Record<number, string> = {
  0: "Reflective question: ask the learner to name the relevant concept, quantity or relationship. Do not name it yourself.",
  1: "Directional hint: point to the principle, formula, construct or law that applies, without using it on their numbers.",
  2: "Conceptual hint: explain the principle in general terms (why and when it applies), without applying every step to their problem.",
  3: "Partial worked step: carry out ONE important step on their problem and ask them to do the next one. Stop before the result.",
  4: "Analogous worked example: fully solve a similar problem with DIFFERENT numbers whose result differs, then ask them to apply it to theirs.",
  5: "Full explanation: give the complete worked solution with the reason for each step, then offer a new similar problem to try alone.",
};

export interface TurnContext {
  mode: Mode;
  action: EngineAction;
  stuck?: StuckReason | null;
  newProblem: boolean;               // first message of a conversation
  attempts: number;                  // the learner's attempts on the current problem (including this one)
  hintsUsed: number;                 // hint-button presses on the current problem
  verdict: CheckedVerdict;           // what the SERVER verified about this attempt
  misconception: string | null;      // diagnosed by the server (bank item) or the previous turn's validated assessment
  previous: { state: EngineState | null; hintLevel: number | null; misconception: string | null; sameMisconceptionCount: number };
  askedForAnswer: boolean;           // "just tell me the answer"
  unexplained: boolean;              // a bare answer with no working
  itemKind: "practice" | "verify" | "review" | null;  // a bank item is being answered
  masteredNow: boolean;              // mastery rule satisfied after this attempt
  objectiveKnown: boolean;           // the bank has items for the current objective
}

export interface TurnPlan {
  state: EngineState;
  hintLevel: number | null;
  revealAllowed: boolean;            // the reply may contain the full solution
  presentItem: "practice" | "verify" | "review" | null;  // serve a bank problem instead of model-written content
  rationale: string;                 // why (for logs, tests and the demonstration)
}

const plan = (state: EngineState, hintLevel: number | null, rationale: string, extra: Partial<TurnPlan> = {}): TurnPlan =>
  ({ state, hintLevel, revealAllowed: false, presentItem: null, rationale, ...extra });

// The next hint level: lowest level likely to help, higher when evidence says the last one didn't.
export function selectHintLevel(ctx: TurnContext): number {
  const prev = ctx.previous.hintLevel ?? -1;
  if (ctx.misconception && ctx.previous.sameMisconceptionCount >= 1) return Math.max(prev + 1, 4); // the same error again: show, don't tell
  if (ctx.misconception) return Math.max(prev + 1, 1);                                            // a named error: point at it directly
  if (ctx.stuck === "concept") return Math.max(prev, 2);
  if (ctx.stuck === "step") return Math.max(prev, 3);
  if (ctx.attempts >= 3 && prev >= 3) return 4;
  return Math.min(Math.max(prev + 1, ctx.action === "hint" ? 1 : 0), 3);
}

export function decideTurn(ctx: TurnContext): TurnPlan {
  // Explain mode: direct instruction is the point; afterwards offer independent practice.
  if (ctx.mode === "explain" && !["practice", "verify", "review"].includes(ctx.action)) {
    return plan("EXPLAIN", 5, "Explain mode: the learner chose direct explanation", { revealAllowed: true });
  }
  if (ctx.action === "practice") return plan("PRACTISE", null, "learner asked for practice", { presentItem: ctx.objectiveKnown ? "practice" : null });
  if (ctx.action === "verify") return plan("VERIFY", null, "independent check on an unseen problem", { presentItem: ctx.objectiveKnown ? "verify" : null });
  if (ctx.action === "review") return plan("REVIEW", null, "spaced review of an earlier objective", { presentItem: "review" });
  if (ctx.action === "summary") return plan(ctx.previous.state ?? "GUIDE", null, "summary requested");
  if (ctx.action === "example") return plan("MODEL", 4, "learner asked for a worked example of a similar problem");
  if (ctx.action === "simpler") return plan("EXPLAIN", Math.max(ctx.previous.hintLevel ?? 0, 2), "learner found the last reply hard: re-explain more simply, no further toward the answer");

  // A verified answer to a bank item or the current problem.
  if (ctx.verdict === "correct") {
    if (ctx.unexplained) return plan("GUIDE", 0, "correct answer with no reasoning: ask the learner to justify it before counting it");
    if (ctx.masteredNow) return plan("MASTERED", null, "mastery rule met (independent and delayed evidence)");
    if (ctx.itemKind === "verify" || ctx.itemKind === "review") return plan("PRACTISE", null, "independent success recorded; more evidence needed before mastery");
    return plan("VERIFY", null, "solved with guidance: confirm, then offer an unseen problem to try alone");
  }

  if (ctx.action === "stuck") {
    if (ctx.stuck === "start") return plan("DIAGNOSE", 0, "stuck at the start: find what the learner knows and what the problem asks");
    if (ctx.stuck === "concept") return plan("EXPLAIN", selectHintLevel(ctx), "missing concept: teach the prerequisite briefly, then hand back");
    if (ctx.stuck === "mistake") return plan("GUIDE", 1, "can't find a mistake: ask them to check one specific step");
    return plan("HINT", selectHintLevel(ctx), "stuck on a step: show one step, they do the next");
  }

  // Asking for the answer in Learn mode: earned after genuine effort, otherwise the next small step.
  if (ctx.askedForAnswer) {
    if (ctx.attempts >= 2 || ctx.hintsUsed >= 3) return plan("EXPLAIN", 5, "answer requested after genuine attempts: full explanation, then a new problem", { revealAllowed: true });
    return plan("HINT", selectHintLevel(ctx), "answer requested too early: decline kindly, offer Explain mode, give the next smallest hint");
  }

  if (ctx.action === "hint") return plan("HINT", selectHintLevel(ctx), "hint requested");

  if (ctx.verdict === "incorrect") {
    if (ctx.misconception && ctx.previous.sameMisconceptionCount >= 1) {
      return plan("MODEL", 4, "the same misconception again: change approach and work an analogous example");
    }
    if (ctx.misconception) return plan("HINT", selectHintLevel(ctx), "a diagnosed misconception: target it with the smallest useful hint");
    if (ctx.attempts >= 4 && (ctx.previous.hintLevel ?? 0) >= 4) {
      return plan("EXPLAIN", 5, "still stuck after an analogous example: full explanation, then an independent problem", { revealAllowed: true });
    }
    if (ctx.attempts >= 3) return plan("MODEL", 4, "several wrong attempts: a worked example of a similar problem");
    return plan("GUIDE", selectHintLevel(ctx), "wrong answer, cause unknown: ask a diagnostic question about one step");
  }

  if (ctx.newProblem) return plan("DIAGNOSE", 0, "new problem: diagnose prior knowledge before teaching");
  if (ctx.verdict === "unreadable") return plan("GUIDE", 0, "the answer couldn't be read: ask for it in a checkable form");
  return plan("GUIDE", ctx.previous.hintLevel, "continue: one focused question on the next step");
}

// ---------- The model's structured assessment, validated ----------
export interface Assessment {
  verdict: "correct" | "partly" | "incorrect" | "not_an_attempt";
  reasoning: "valid" | "flawed" | "unclear" | "none";
  misconception: string | null;
  confidence: number;               // 0..1, the model's confidence in its diagnosis
  prerequisiteGap: string | null;
  objective: string;                // an objective id or "other"
}

export const ASSESSMENT_SCHEMA = (objectiveIds: string[]) => ({
  type: "object",
  properties: {
    verdict: { type: "string", enum: ["correct", "partly", "incorrect", "not_an_attempt"] },
    reasoning: { type: "string", enum: ["valid", "flawed", "unclear", "none"] },
    misconception: { anyOf: [{ type: "string" }, { type: "null" }] },
    confidence: { type: "number" },
    prerequisiteGap: { anyOf: [{ type: "string" }, { type: "null" }] },
    objective: { type: "string", enum: [...objectiveIds, "other"] },
  },
  required: ["verdict", "reasoning", "misconception", "confidence", "prerequisiteGap", "objective"],
  additionalProperties: false,
});

export function parseAssessment(raw: unknown, objectiveIds: string[]): Assessment | null {
  const a = raw as Record<string, unknown> | null;
  if (!a || typeof a !== "object") return null;
  const verdicts = ["correct", "partly", "incorrect", "not_an_attempt"], reasonings = ["valid", "flawed", "unclear", "none"];
  if (!verdicts.includes(a.verdict as string) || !reasonings.includes(a.reasoning as string)) return null;
  const confidence = Number(a.confidence);
  return {
    verdict: a.verdict as Assessment["verdict"], reasoning: a.reasoning as Assessment["reasoning"],
    misconception: typeof a.misconception === "string" && a.misconception.trim() ? a.misconception.trim().slice(0, 200) : null,
    confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0,
    prerequisiteGap: typeof a.prerequisiteGap === "string" && a.prerequisiteGap.trim() ? a.prerequisiteGap.trim().slice(0, 200) : null,
    objective: objectiveIds.includes(a.objective as string) ? (a.objective as string) : "other",
  };
}

// Reconcile the model's view with what the server verified. The server wins; a
// low-confidence diagnosis is not acted on (ask a diagnostic question instead).
export interface Reconciled { verdict: CheckedVerdict; misconception: string | null; contradiction: boolean; trustDiagnosis: boolean }
export function reconcile(checked: CheckedVerdict, serverMisconception: string | null, a: Assessment | null, replyType: string): Reconciled {
  const modelSaysRight = a ? a.verdict === "correct" : replyType === "affirmation";
  const contradiction = (checked === "correct" && a?.verdict === "incorrect") || (checked === "incorrect" && modelSaysRight);
  if (checked === "correct" || checked === "incorrect") {
    return { verdict: checked, misconception: serverMisconception ?? (checked === "incorrect" && a && a.confidence >= 0.6 ? a.misconception : null), contradiction, trustDiagnosis: true };
  }
  const trust = Boolean(a && a.confidence >= 0.6 && a.reasoning !== "unclear");
  return { verdict: "unknown", misconception: trust ? a!.misconception : null, contradiction: false, trustDiagnosis: trust };
}

// "Just give me the answer" in the languages Menya supports.
export function asksForAnswer(text: string): boolean {
  return /\b(just|only)?\s*(give|tell|show|send) me the (final )?(answer|solution)\b|\bwhat('s| is) the answer\b|\banswer key\b|\bdonne(z)?[- ]moi (la )?(réponse|solution)\b|\bnipe jibu\b|\bmpa (igisubizo|ibisubizo)\b|\bmbwira igisubizo\b/i.test(text);
}

// A bare result ("42", "x = 5", "O(n)") with no reasoning around it.
export function isUnexplained(text: string): boolean {
  const t = text.trim();
  const words = t.split(/\s+/).filter(w => /[a-zA-ZÀ-ɏ]{3,}/.test(w));
  return t.length <= 24 && words.length <= 1 && !/[=→]\s*.+[=→]/.test(t);
}
