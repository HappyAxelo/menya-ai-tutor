// The tutoring state machine. It decides the teaching move for each turn
// BEFORE the language model is called; the model only writes that move in
// the learner's language. Pure functions: every rule here is unit-tested.
//
// States:   TEACH     a new topic or problem: explain, show and demonstrate before asking anything
//           DIAGNOSE  (older conversations only) find out what the learner knows
//           PREREQ    repeated failure: go back and teach what the topic depends on
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
//   0 conceptual reminder · 1 small hint · 2 more specific hint
//   3 partly completed solution · 4 worked example · 5 full explanation

export type EngineState = "TEACH" | "PREREQ" | "DIAGNOSE" | "GUIDE" | "HINT" | "EXPLAIN" | "MODEL" | "PRACTISE" | "VERIFY" | "REVIEW" | "MASTERED";
export type Mode = "learn" | "explain";
export type StuckReason = "start" | "step" | "mistake" | "concept";
export type EngineAction = "message" | "hint" | "simpler" | "diagram" | "example" | "check" | "practice" | "summary" | "verify" | "review" | "stuck" | "another" | "smaller" | "similar" | "test" | "quiz";
export type CheckedVerdict = "correct" | "incorrect" | "unreadable" | "unknown";

export const HINT_LADDER: Record<number, string> = {
  0: "Conceptual reminder: restate the idea just taught in one sentence, then ask them to use it.",
  1: "Small hint: point to the principle, formula, construct or law that applies, without using it on their numbers.",
  2: "More specific hint: explain how the principle applies here (why and when), without applying every step to their problem.",
  3: "Partly completed solution: carry out ONE important step on their problem and ask them to do the next one. Stop before the result.",
  4: "Worked example: fully solve a similar problem with DIFFERENT numbers whose result differs, then ask them to apply it to theirs.",
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
  previous: { state: EngineState | null; hintLevel: number | null; misconception: string | null; sameMisconceptionCount: number;
              struggleCount?: number; questionStreak?: number; wrongStreak?: number; prerequisiteVisited?: boolean };
  requestKind?: RequestKind;         // what the learner's message is asking for
  struggling?: boolean;              // "I don't know": not an attempt, and not a reason to ask again
  askedForAnswer: boolean;           // "just tell me the answer"
  unexplained: boolean;              // a bare answer with no working
  itemKind: "practice" | "verify" | "review" | null;  // a bank item is being answered
  masteredNow: boolean;              // mastery rule satisfied after this attempt
  objectiveKnown: boolean;           // the bank has items for the current objective
  attempted?: boolean;               // this message is an attempt at the problem
  guidedSuccessBefore?: boolean;     // solved this objective with help earlier
}

export interface TurnPlan {
  state: EngineState;
  hintLevel: number | null;
  revealAllowed: boolean;            // the reply may contain the full solution
  presentItem: "practice" | "verify" | "review" | null;  // serve a bank problem instead of model-written content
  rationale: string;                 // why (for logs, tests and the demonstration)
}

export type RequestKind = "concept" | "problem" | "research" | "other";

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
  if (ctx.mode === "explain" && !["practice", "verify", "review", "test"].includes(ctx.action)) {
    return plan("EXPLAIN", 5, "Explain mode: the learner chose direct explanation", { revealAllowed: true });
  }
  if (ctx.action === "practice") return plan("PRACTISE", null, "learner asked for practice", { presentItem: ctx.objectiveKnown ? "practice" : null });
  if (ctx.action === "verify" || ctx.action === "test") return plan("VERIFY", null, "independent check on an unseen problem", { presentItem: ctx.objectiveKnown ? "verify" : null });
  if (ctx.action === "review") return plan("REVIEW", null, "spaced review of an earlier objective", { presentItem: "review" });
  if (ctx.action === "summary") return plan(ctx.previous.state ?? "GUIDE", null, "summary requested");
  if (ctx.action === "example" || ctx.action === "similar") return plan("MODEL", 4, "learner asked to see a similar problem worked");
  if (ctx.action === "another") return plan("EXPLAIN", Math.max(ctx.previous.hintLevel ?? 0, 2), "learner asked for another explanation: a different approach, no further toward the answer");
  if (ctx.action === "smaller") return plan("EXPLAIN", Math.max(ctx.previous.hintLevel ?? 0, 3), "learner asked for smaller steps: split the current step and do the first piece");
  if (ctx.action === "diagram") return plan("EXPLAIN", Math.max(ctx.previous.hintLevel ?? 0, 2), "learner asked to see it as a picture: same point, drawn, no further toward the answer");
  if (ctx.action === "simpler") return plan("EXPLAIN", Math.max(ctx.previous.hintLevel ?? 0, 2), "learner found the last reply hard: re-explain more simply, no further toward the answer");

  // A verified answer to a bank item or the current problem.
  if (ctx.verdict === "correct") {
    if (ctx.unexplained) return plan("GUIDE", 0, "correct answer with no reasoning: ask the learner to justify it before counting it");
    if (ctx.masteredNow) return plan("MASTERED", null, "mastery rule met (independent and delayed evidence)");
    if (ctx.itemKind === "verify" || ctx.itemKind === "review") return plan("PRACTISE", null, "independent success recorded; more evidence needed before mastery");
    return plan("VERIFY", null, "solved with guidance: confirm, then offer an unseen problem to try alone");
  }

  if (ctx.action === "stuck") {
    if (ctx.stuck === "start") return plan("TEACH", 2, "stuck at the start: teach the idea and demonstrate the first step, don't ask what they know");
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

  // "I don't know" gets help at once, then a different approach. Never the same question again.
  if (ctx.struggling) {
    const times = (ctx.previous.struggleCount ?? 0) + 1;
    const prev = ctx.previous.hintLevel ?? 0;
    if (times === 1) return plan("HINT", Math.max(prev + 1, 2), "the learner doesn't know how to go on: give a hint now rather than asking again");
    if (times === 2) return plan("EXPLAIN", Math.max(prev, 3), "still unsure after a hint: explain it another way and carry out one step");
    if (times === 3) return plan("MODEL", 4, "still unsure after an explanation: work a similar problem in full");
    if (!ctx.previous.prerequisiteVisited) return plan("PREREQ", 4, "still unsure after a worked example: something earlier is missing, teach that first");
    return plan("EXPLAIN", 5, "help at every level hasn't landed: show the full solution with reasons, then offer a new problem", { revealAllowed: true });
  }

  if (ctx.verdict === "incorrect") {
    if (ctx.misconception && ctx.previous.sameMisconceptionCount >= 1) {
      return plan("MODEL", 4, "the same misconception again: change approach and work an analogous example");
    }
    // Followed it with help but couldn't do it alone: show where independent work broke down.
    if ((ctx.itemKind === "verify" || ctx.itemKind === "review") && ctx.guidedSuccessBefore) {
      return plan("MODEL", 4, "solved with guidance but failed alone: demonstrate the step that broke down, then an easier independent problem");
    }
    if (ctx.misconception) return plan("HINT", selectHintLevel(ctx), "a diagnosed misconception: target it with the smallest useful hint");
    if ((ctx.previous.wrongStreak ?? 0) >= 4 && !ctx.previous.prerequisiteVisited) return plan("PREREQ", 4, "repeated wrong answers: revisit what this topic depends on");
    if (ctx.attempts >= 4 && (ctx.previous.hintLevel ?? 0) >= 4) {
      return plan("EXPLAIN", 5, "still stuck after an analogous example: full explanation, then an independent problem", { revealAllowed: true });
    }
    if (ctx.attempts >= 3) return plan("MODEL", 4, "several wrong attempts: a worked example of a similar problem");
    return plan("EXPLAIN", Math.max(selectHintLevel(ctx), 2), "wrong answer, cause unknown: name the likely misunderstanding, explain it another way, ask something smaller");
  }

  // A question about an idea or the evidence is answered, not turned into a guessing game.
  if (ctx.requestKind === "research") return plan("EXPLAIN", 2, "a question about published evidence: teach from what was found, then check understanding");
  if (ctx.requestKind === "concept") return plan("EXPLAIN", 2, "the learner asked to understand an idea: explain it with an example, then check understanding");
  if (ctx.newProblem) return plan("TEACH", 2, "new problem: teach the idea and demonstrate on a similar case before asking anything");
  if (ctx.verdict === "unreadable") return plan("GUIDE", 0, "the answer couldn't be read: ask for it in a checkable form");
  // Attempts the model judged wrong (the server can't mark free-form work): change approach, then go back further.
  if (ctx.attempted && ctx.verdict === "unknown") {
    const wrong = ctx.previous.wrongStreak ?? 0;
    if (wrong >= 4 && !ctx.previous.prerequisiteVisited) return plan("PREREQ", 4, "repeated wrong answers: revisit what this topic depends on");
    if (wrong >= 3) return plan("MODEL", 4, "repeated wrong answers: a worked example of a similar problem");
    if (wrong >= 2) return plan("EXPLAIN", Math.max(ctx.previous.hintLevel ?? 0, 3), "two wrong answers in a row: explain another way and carry out one step");
  }
  // Several questions in a row without progress: stop asking and teach.
  if ((ctx.previous.questionStreak ?? 0) >= 2) return plan("EXPLAIN", Math.max(ctx.previous.hintLevel ?? 0, 3), "several questions in a row without progress: explain and carry out one step");
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
  evidence?: "understands" | "memorised" | "possible_guess" | "misconception" | "missing_prerequisite" | "cannot_apply" | "unclear";
}

const EVIDENCE_VALUES = ["understands", "memorised", "possible_guess", "misconception", "missing_prerequisite", "cannot_apply", "unclear"];
export const ASSESSMENT_SCHEMA = (objectiveIds: string[]) => ({
  type: "object",
  properties: {
    verdict: { type: "string", enum: ["correct", "partly", "incorrect", "not_an_attempt"] },
    reasoning: { type: "string", enum: ["valid", "flawed", "unclear", "none"] },
    misconception: { anyOf: [{ type: "string" }, { type: "null" }] },
    confidence: { type: "number" },
    prerequisiteGap: { anyOf: [{ type: "string" }, { type: "null" }] },
    objective: { type: "string", enum: [...objectiveIds, "other"] },
    evidence: { type: "string", enum: EVIDENCE_VALUES },
  },
  required: ["verdict", "reasoning", "misconception", "confidence", "prerequisiteGap", "objective", "evidence"],
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
    evidence: EVIDENCE_VALUES.includes(a.evidence as string) ? (a.evidence as Assessment["evidence"]) : undefined,
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

// "I don't know", in a short message on its own. "I don't understand how loops work" is a question, not this.
export function isStruggling(text: string): boolean {
  return /^\W*(i\s*(really\s*)?(don'?t|do not|dont)\s*(know|understand|get( it)?)|idk|no idea|not sure|no clue|i'?m (lost|stuck|confused)|i have no idea|help( me)?|je ne sais pas|je sais pas|aucune id[ée]e|je ne comprends pas|sijui|sielewi|simbizi|sinzi|ntabwo (mbizi|nzi|numva)|ntacyo nzi|sinumva)\W*(\w+\W*){0,2}$/i.test(text.trim());
}

// What the message is asking for. Values to work with make it a problem, however it's worded.
export function classifyRequest(text: string): RequestKind {
  const t = text.trim();
  if (!t) return "other";
  if (/\d\s*[-+*/=^×÷]|[-+*/=^×÷]\s*\d|\b\d+(\.\d+)?\s*(v|a|w|hz|kg|g|m|s|km|cm|mm|n|j|mol|ohms?|Ω|m\/s)\b|```|\b(solve|calculate|compute|evaluate|simplify|factori[sz]e|differentiate|integrate|prove|balance|find the (value|derivative|integral|area|sum|roots?)|write (a|the|me a) (program|function|code|script)|r[ée]soudre|calculer|hesabu|kokotoa|bara)\b/i.test(t)) return "problem";
  if (/^(teach me\b|help me (?:learn|understand|with)\b|i (?:want|need|would like) to (?:learn|understand|study)\b|can you teach\b|what(?:'s| is| are| does| do)\b|who (is|was)\b|why\b|how (does|do|did|is|are|can)\b(?! i (solve|calculate|find|compute))|explain\b|describe\b|define\b|tell me (about|how|why|what)\b|i (don'?t|do not|dont) (understand|get)\b.+|help me understand\b|can you explain\b|could you explain\b|(the )?(difference|relationship) between\b|meaning of\b|qu'est[- ]ce\b|c'est quoi\b|pourquoi\b|comment fonctionne\b|explique[zr]?\b|ni nini\b|nini\b|eleza\b|kwa nini\b|sobanur\w*\b|ni iki\b|kuki\b)/i.test(t)) return "concept";
  return "other";
}

// A bare result ("42", "x = 5", "O(n)") with no reasoning around it.
export function isUnexplained(text: string): boolean {
  const t = text.trim();
  const words = t.split(/\s+/).filter(w => /[a-zA-ZÀ-ɏ]{3,}/.test(w));
  return t.length <= 24 && words.length <= 1 && !/[=→]\s*.+[=→]/.test(t);
}
