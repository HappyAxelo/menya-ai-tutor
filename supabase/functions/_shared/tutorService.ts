// ============================================================
// Tutor request pipeline:
//   authenticated user → entitlement → session → quota (atomic) →
//   difficulty → route → model (bounded retries + fallback) →
//   answer-leak check → verified-solve check → persist →
//   usage/cost record (+ learning event) → response
// ============================================================
import {
  actionRequest, buildResponseSchema, buildSystemPrompt, chosenLanguageNote, detectLanguage, hintRequest, languageNote, problemNote, parseTutorJson, publicReply,
  REWRITE_REQUEST, recheckRequest, unbalancedRequest, engineNote, presentRequest, STUCK_REASONS, LEARNER_LEVELS, REPLY_STYLES, TUTOR_ACTIONS,
  type LearnerLevel, type ReplyStyle, type TutorAction, type TutorReply,
} from "./policy.ts";
import { matchesAnswer, revealsAnswer, statesAnswer } from "./answerGuard.ts";
import { checkEquation } from "./chemistry.ts";
import { classifyDifficulty, planRoute, type RouteCandidate } from "./router.ts";
import { estimateCostUsd, ProviderError, type ChatMessage, type ModelProvider } from "./providers.ts";
import type { Entitlement, Repo, Session } from "./repo.ts";
import { asksForAnswer, decideTurn, isUnexplained, reconcile, type CheckedVerdict, type EngineAction, type Mode, type StuckReason } from "./engine/state.ts";
import { generateItem, markItem, questionKey, misconceptionText, objective as objectiveInfo, OBJECTIVE_IDS, type Item } from "./engine/bank.ts";
import { emptyRecord, estimate, evidenceKind, update as updateMastery } from "./engine/mastery.ts";

export interface TutorInput {
  requestId: string;          // client-generated UUID; makes retries idempotent
  sessionId?: string | null;  // omitted = new problem
  action: TutorAction;
  message?: string;           // the student's text (message, or the answer to check)
  language?: string;
  learnerLevel?: LearnerLevel;
  style?: ReplyStyle;
  mode?: Mode;                // learn (default) or explain; omitted = keep the conversation's mode
  stuck?: StuckReason;        // why the learner is stuck (action "stuck")
  objective?: string;         // the objective to review (action "review"); default: the most overdue
}

export interface TutorDeps {
  repo: Repo;
  providers: Record<string, ModelProvider>;
  sleep?: (ms: number) => Promise<void>;
  log?: (event: Record<string, unknown>) => void;
  now?: () => number;      // injectable clock (tests)
  budgetMs?: number;       // total time for all model calls in one request
}

// One deadline for every model call, retry and rewrite in a request. It stays well
// under the browser's timeout (75 s) and the Edge Function wall-clock limit (150 s),
// so a slow provider produces a clean "not counted" reply instead of a killed function
// that has already consumed the student's quota.
export const MODEL_BUDGET_MS = 50_000;
const MIN_CALL_MS = 5_000; // don't start a call with less time than this

export interface ServiceResponse { status: number; body: Record<string, unknown> }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NEXT_PLAN: Record<string, string | null> = { free: "pro", pro: "professional", professional: null };

// Shown only if a reply still revealed the answer after one rewrite.
// Before the student has tried anything, a "you're close" message makes no sense.
const START_FALLBACK: Record<string, string> = {
  English: "Let's work through it together. Which idea or formula links the quantities you're given, and how would you start?",
  French: "Avançons ensemble. Quelle notion ou quelle formule relie les grandeurs données, et par quoi commencerais-tu ?",
  Spanish: "Trabajémoslo juntos. ¿Qué idea o fórmula relaciona las magnitudes que tienes, y cómo empezarías?",
  Swahili: "Tufanye pamoja. Ni wazo au fomula gani inayounganisha vipimo ulivyopewa, na ungeanzaje?",
};
const fallbackFor = (language: string, starting: boolean) =>
  (starting ? START_FALLBACK : SAFE_FALLBACK)[language] ?? (starting ? START_FALLBACK : SAFE_FALLBACK).English;

// Sent instead of a reply that called an unbalanced equation correct.
const UNBALANCED_FALLBACK: Record<string, string> = {
  English: "Not balanced yet. Count the atoms of each element on both sides of the arrow: which element has a different number on the left and on the right?",
  French: "Pas encore équilibrée. Compte les atomes de chaque élément des deux côtés de la flèche : quel élément n'a pas le même nombre à gauche et à droite ?",
  Spanish: "Todavía no está balanceada. Cuenta los átomos de cada elemento a ambos lados de la flecha: ¿qué elemento tiene un número distinto a la izquierda y a la derecha?",
  Swahili: "Bado haijasawazishwa. Hesabu atomu za kila elementi pande zote mbili za mshale: ni elementi gani yenye idadi tofauti kushoto na kulia?",
};
const SAFE_FALLBACK: Record<string, string> = {
  English: "You're close. Carry out the step you've just set up and tell me what you get.",
  French: "Tu y es presque. Effectue l'étape que tu viens de poser et dis-moi ce que tu obtiens.",
  Spanish: "Ya casi lo tienes. Realiza el paso que acabas de plantear y dime qué obtienes.",
  Swahili: "Umekaribia. Fanya hatua uliyoiandaa sasa hivi kisha uniambie unapata nini.",
};

export function validateInput(raw: unknown, maxChars: number): TutorInput | string {
  if (!raw || typeof raw !== "object") return "invalid_body";
  const b = raw as Record<string, unknown>;
  if (typeof b.requestId !== "string" || !UUID_RE.test(b.requestId)) return "invalid_request_id";
  if (b.sessionId != null && (typeof b.sessionId !== "string" || !UUID_RE.test(b.sessionId))) return "invalid_session_id";
  const action = (b.action ?? "message") as TutorAction;
  if (!TUTOR_ACTIONS.includes(action)) return "invalid_action";
  if (action !== "message" && action !== "review" && !b.sessionId) return action === "hint" ? "hint_needs_session" : "action_needs_session";
  if (action === "stuck" && !STUCK_REASONS.includes(b.stuck as StuckReason)) return "invalid_stuck_reason";
  if (b.mode != null && b.mode !== "learn" && b.mode !== "explain") return "invalid_mode";
  if (b.objective != null && !OBJECTIVE_IDS.includes(b.objective as string)) return "invalid_objective";
  if (action === "message" || action === "check") {
    if (typeof b.message !== "string" || !b.message.trim()) return "empty_message";
    if (b.message.length > maxChars) return "message_too_long";
  }
  if (b.language != null && (typeof b.language !== "string" || !/^[\p{L} ()-]{2,40}$/u.test(b.language))) return "invalid_language";
  if (b.learnerLevel != null && !LEARNER_LEVELS.includes(b.learnerLevel as LearnerLevel)) return "invalid_level";
  if (b.style != null && !REPLY_STYLES.includes(b.style as ReplyStyle)) return "invalid_style";
  return {
    requestId: b.requestId, sessionId: (b.sessionId as string) ?? null, action,
    message: typeof b.message === "string" ? b.message.trim() : undefined,
    language: (b.language as string) ?? "auto",
    learnerLevel: (b.learnerLevel as LearnerLevel) ?? undefined,
    style: (b.style as ReplyStyle) ?? undefined,
    mode: (b.mode as Mode) ?? undefined,
    stuck: (b.stuck as StuckReason) ?? undefined,
    objective: (b.objective as string) ?? undefined,
  };
}

// Sent when the server verified the answer is wrong but the reply called it right.
const wrongAnswerRequest = (note: string | null) =>
  `[SECOND LOOK] The server checked the student's answer and it is NOT correct${note ? ` (${note})` : ""}. Your last reply treated it as right. Reply again: say plainly it isn't right yet and point to the step to re-check, without giving the answer (type "redirect", solved false). Don't mention re-checking. Same language, same JSON format.`;
// Sent instead, if the model still calls a verified-wrong answer right.
const NOT_YET_FALLBACK: Record<string, string> = {
  English: "Not quite yet. Go back over your last step carefully: which quantity or rule did you use there, and does it fit this problem?",
  French: "Pas encore tout à fait. Reprends ta dernière étape : quelle grandeur ou quelle règle as-tu utilisée, et convient-elle à ce problème ?",
  Spanish: "Todavía no. Revisa tu último paso: ¿qué magnitud o regla usaste y encaja con este problema?",
  Swahili: "Bado si sahihi. Pitia tena hatua yako ya mwisho: ulitumia kipimo au kanuni gani, na je, inafaa tatizo hili?",
};
const PRESENT_LABEL = { practice: "Practice problem", verify: "Check yourself (no hints this time)", review: "Review" } as const;

function quotaError(reason: string, plan: string, retryAfter?: number): ServiceResponse {
  const messages: Record<string, string> = {
    daily_limit: "You've used today's tutor messages on your plan. They reset at midnight UTC.",
    monthly_limit: "You've used this month's tutor messages on your plan.",
    premium_limit: "You've used this month's advanced-reasoning requests.",
    premium_not_included: "Advanced reasoning isn't included in your plan.",
    org_limit: "Your institution's shared monthly allowance has been used. Please contact your administrator.",
    rate_limited: "You're sending messages very quickly. Please wait a moment.",
    duplicate_request: "This message was already sent.",
  };
  return {
    status: reason === "duplicate_request" ? 409 : 429,
    body: { error: reason, message: messages[reason] ?? "Limit reached.", plan, upgrade_to: reason === "org_limit" ? null : NEXT_PLAN[plan] ?? null,
            retry_after_seconds: retryAfter ?? null },
  };
}

export async function handleTutor(deps: TutorDeps, userId: string, rawInput: unknown): Promise<ServiceResponse> {
  const { repo, providers } = deps;
  const sleep = deps.sleep ?? (ms => new Promise(r => setTimeout(r, ms)));
  const now = deps.now ?? Date.now;
  const log = deps.log ?? (() => {});

  const maxChars = await repo.getSettingNumber("max_message_chars", 4000);
  const input = validateInput(rawInput, maxChars);
  if (typeof input === "string") return { status: 400, body: { error: input } };

  const ent: Entitlement = await repo.resolveEntitlement(userId);

  // Language of what the student just wrote (null when unsure). In "auto" mode the
  // reply follows it; the model is told explicitly, because on short messages in
  // Kinyarwanda or Kiswahili it otherwise tends to answer in English.
  const detected = input.action === "message" || input.action === "check" ? detectLanguage(input.message!) : null;
  const followStudent = input.language === "auto";

  // Session (owned by this user only)
  let session: Session | null;
  if (input.sessionId) {
    session = await repo.getSession(userId, input.sessionId);
    if (!session) return { status: 404, body: { error: "session_not_found" } };
  } else {
    const title = input.action === "review" ? `Review: ${objectiveInfo(input.objective ?? "")?.title ?? "earlier topics"}` : (input.message ?? "").slice(0, 80);
    session = await repo.createSession(userId, ent.org_id, title.slice(0, 80), followStudent ? detected : input.language!);
  }
  if (session.turn_count >= ent.max_session_turns) {
    return { status: 409, body: { error: "session_limit", message: "This session is at its length limit. Start a new problem to continue.",
                                  limit: ent.max_session_turns, upgrade_to: NEXT_PLAN[ent.plan_id] ?? null } };
  }
  if (input.action === "hint" && session.hints_used >= 3) {
    return { status: 409, body: { error: "hint_limit", message: "All 3 hints for this problem have been used." } };
  }

  const lang = followStudent ? (detected ?? session.language) : input.language;
  const history = await repo.loadMessages(session.id, ent.context_turns * 2);
  const rememberedAnswer = input.sessionId ? await repo.getSessionAnswer(session.id) : null;
  // The student's own words (a checked answer is stored under meta.text).
  const studentTexts = history.filter(m => m.role === "user")
    .map(m => (m.meta?.control ? (typeof m.meta.text === "string" ? m.meta.text : null) : m.content))
    .filter((t): t is string => Boolean(t));
  const isAttempt = input.action === "check" || (input.action === "message" && Boolean(input.sessionId));
  if (input.action === "message" || input.action === "check") studentTexts.push(input.message!);
  const studentEquation = isAttempt ? checkEquation(input.message ?? "") : null;
  const newProblem = input.action === "practice" || input.action === "verify" || input.action === "review";
  const attemptsNow = newProblem ? 0 : session.attempts + (isAttempt ? 1 : 0);

  // ---------------- Tutoring engine: decide this turn's teaching move ----------------
  const prevMeta = ([...history].reverse().find(m => m.role === "assistant")?.meta ?? {}) as Record<string, any>;
  const mode: Mode = input.mode ?? session.mode ?? "learn";
  const modeChanged = Boolean(input.sessionId && input.mode && input.mode !== (session.mode ?? "learn"));
  const sessionItem = input.sessionId ? await repo.getSessionItem(session.id) : null;
  let objectiveId: string | null = sessionItem?.item.objective ?? session.objective ?? null;
  if (input.action === "review") objectiveId = input.objective ?? (await repo.dueReviews(userId, new Date(now()), 1))[0] ?? objectiveId;

  // What the server can verify itself: a bank item (deterministic marking), an
  // unbalanced equation, or the remembered verified answer.
  const marking = isAttempt && sessionItem ? markItem(sessionItem.item, input.message!) : null;
  let checked: CheckedVerdict = "unknown", verificationNote: string | null = null, serverMisconception: string | null = null;
  if (marking) {
    checked = marking.verdict;
    serverMisconception = misconceptionText(sessionItem!.item, marking.misconception);
    verificationNote = serverMisconception ? `the result is what you get if one ${serverMisconception}` : null;
  } else if (isAttempt && studentEquation && !studentEquation.balanced) {
    checked = "incorrect"; verificationNote = "the chemical equation is not balanced";
  } else if (isAttempt && rememberedAnswer && statesAnswer(input.message!, rememberedAnswer)) {
    checked = "correct";
  }
  const unexplained = checked === "correct" && isUnexplained(input.message ?? "");
  const prevMis = typeof prevMeta.misconception === "string" ? prevMeta.misconception : null;
  const repeats = serverMisconception && prevMis === serverMisconception ? Number(prevMeta.misconceptionCount ?? 1) : 0;

  // Mastery evidence comes only from what the server verified, never from the model's opinion.
  const evidenceObjective = objectiveId && (checked === "correct" || checked === "incorrect") ? objectiveId : null;
  const prevRecord = evidenceObjective ? (await repo.getObjectiveRecord(userId, evidenceObjective)) ?? emptyRecord(evidenceObjective) : null;
  const newRecord = prevRecord ? updateMastery(prevRecord, {
    kind: evidenceKind(sessionItem?.kind ?? null), verdict: checked as "correct" | "incorrect", hintsUsed: session.hints_used,
    unexplained, misconception: marking?.misconception ?? null, at: now() }) : null;

  const plan = decideTurn({
    mode, action: input.action as EngineAction, stuck: input.stuck ?? null, newProblem: !input.sessionId,
    attempts: attemptsNow, hintsUsed: session.hints_used, verdict: checked, misconception: serverMisconception,
    previous: { state: prevMeta.state ?? null, hintLevel: Number.isInteger(prevMeta.engineHint) ? prevMeta.engineHint : null,
                misconception: prevMis, sameMisconceptionCount: repeats },
    askedForAnswer: input.action === "message" && asksForAnswer(input.message ?? ""), unexplained,
    itemKind: sessionItem?.kind ?? null,
    masteredNow: Boolean(newRecord && newRecord.status === "mastered" && prevRecord!.status !== "mastered"),
    objectiveKnown: Boolean(objectiveId && generateItem(objectiveId, 1)),
  });

  log({ event: "engine_turn", state: plan.state, hintLevel: plan.hintLevel, verdict: checked, rationale: plan.rationale,
        misconception: marking?.misconception ?? null, objective: objectiveId, mode });

  // Serve an unseen bank problem (practice, independent check, or review).
  let presented: { kind: "practice" | "verify" | "review"; item: Item } | null = null;
  if (plan.presentItem && objectiveId) {
    for (let k = 0; k < 8 && !presented; k++) {
      const item = generateItem(objectiveId, Math.floor(Math.random() * 2 ** 31));
      // "Unseen" means a question text the learner hasn't been shown (different seeds can give the same question).
      if (item && await repo.markServed(userId, item.templateId, questionKey(item.question), plan.presentItem)) presented = { kind: plan.presentItem, item };
    }
    if (presented) await repo.setSessionItem(session.id, userId, presented);
  }

  const userContent = presented ? presentRequest(presented.item, presented.kind, lang)
    : input.action === "message" ? input.message!
    : input.action === "hint" ? hintRequest(session.hints_used + 1, lang)
    : actionRequest(input.action as Exclude<TutorAction, "message" | "hint">, lang, input.action === "stuck" ? input.stuck : input.message);
  const engineMessage = presented ? null : engineNote(plan, {
    mode, modeChanged, verified: checked, verificationNote, unexplained,
    misconception: serverMisconception, objectiveTitle: objectiveId ? objectiveInfo(objectiveId)?.title ?? null : null,
  });

  // Route
  const configs = await repo.getModelConfigs();
  const available = new Set(Object.keys(providers));
  const difficulty = classifyDifficulty(input.message ?? studentTexts.at(-1) ?? "", session.last_difficulty);
  const premiumCap = Math.max(ent.monthly_premium_limit - ent.premium_safety_margin, 0);
  let route = planRoute({ policy: ent.routing_policy, difficulty, premiumRemaining: premiumCap, configs, availableProviders: available });

  // Quota (atomic in the database). Try premium first only when routed there.
  let quota = await repo.consumeQuota(userId, input.requestId, route[0]?.premium ?? false);
  if (!quota.allowed && (quota.reason === "premium_limit" || quota.reason === "premium_not_included")) {
    route = planRoute({ policy: ent.routing_policy, difficulty, premiumRemaining: 0, configs, availableProviders: available });
    quota = await repo.consumeQuota(userId, input.requestId, false);
  }
  if (!quota.allowed) return quotaError(quota.reason ?? "limit", ent.plan_id, quota.retry_after_seconds);
  const reservedPremium = route[0]?.premium ?? false;

  if (route.length === 0) {
    await repo.releaseQuota(userId, input.requestId);
    return { status: 503, body: { error: "tutor_unavailable", message: "The tutor is temporarily unavailable. Please try again shortly." } };
  }

  const system = buildSystemPrompt({
    language: input.language, workedSolutions: ent.worked_solutions, privateFields: true, level: input.learnerLevel, style: input.style,
    depth: ent.analytics_level === "enhanced" ? "detailed" : "standard",
  });
  const schema = buildResponseSchema(true);
  const messages: ChatMessage[] = [
    ...history.map(m => ({ role: m.role, content: m.content })),
    ...(!newProblem && (session.hints_used > 0 || attemptsNow > 0)
      ? [{ role: "user" as const, content: problemNote({ hintsUsed: session.hints_used, attempts: attemptsNow, practice: session.practice }) }] : []),
    ...(engineMessage ? [{ role: "user" as const, content: engineMessage }] : []),
    ...(followStudent ? (detected ? [{ role: "user" as const, content: languageNote(detected) }] : [])
      : (input.action === "message" || input.action === "check" ? [{ role: "user" as const, content: chosenLanguageNote(input.language!, detected) }] : [])),
    { role: "user", content: userContent },
  ];

  // Model call with bounded retries and fallbacks
  let served: { candidate: RouteCandidate; reply: TutorReply; inputTokens: number; outputTokens: number; latencyMs: number; cost: number | null; rewrite: boolean; cachedTokens: number } | null = null;
  let lastError: ProviderError | null = null;
  let attempts = 0;
  const deadline = now() + (deps.budgetMs ?? MODEL_BUDGET_MS);
  const remaining = () => deadline - now();
  // The model config with its timeout capped to the time left in this request.
  const withinBudget = (config: RouteCandidate["config"]) => ({ ...config, timeout_ms: Math.min(config.timeout_ms, remaining()) });
  for (const candidate of route) {
    const provider = providers[candidate.config.provider];
    for (let tryNo = 0; tryNo < 2 && !served; tryNo++) {
      if (remaining() < MIN_CALL_MS) { lastError ??= new ProviderError("timeout", provider.name); break; }
      attempts++;
      try {
        const res = await provider.chat(withinBudget(candidate.config), { system, messages, schema });
        const reply = parseTutorJson(res.text);
        let inputTokens = res.inputTokens ?? 0, outputTokens = res.outputTokens ?? 0, latencyMs = res.latencyMs;
        let cachedTokens = res.cachedInputTokens ?? 0;
        if (!reply) { lastError = new ProviderError("bad_request", provider.name); break; }
        let cost = estimateCostUsd(candidate.config, res);
        // Models sometimes omit the private answer; fall back to the one remembered for this
        // session (not for a new practice question, whose answer is different).
        if (!reply.finalAnswer && rememberedAnswer && !newProblem) reply.finalAnswer = rememberedAnswer;
        served = { candidate, reply, inputTokens, outputTokens, latencyMs, cost, rewrite: false, cachedTokens };

        // Answer-leak guard (earned worked solutions are exempt)
        if (presented) reply.finalAnswer = presented.item.answer;
        else if (sessionItem) reply.finalAnswer = sessionItem.item.answer;
        const earnedSolution = (plan.revealAllowed && ent.worked_solutions) ||
          (reply.type === "worked_solution" && ent.worked_solutions && !newProblem && (session.hints_used >= 3 || attemptsNow >= 2 || session.solved));
        // Confirming a student's own correct attempt may restate it in another form
        // (x(2 sin x + x cos x) as 2x·sin x + x²·cos x); a solve still needs matchesAnswer below.
        const confirmsAttempt = isAttempt && !newProblem && reply.solved && reply.type === "affirmation";
        if (!earnedSolution && !confirmsAttempt && revealsAnswer(reply.message, reply.finalAnswer, studentTexts)) {
          let rewritten: TutorReply | null = null;
          // No time left for a rewrite: the safe message below is sent instead.
          if (remaining() >= MIN_CALL_MS) try {
            const res2 = await provider.chat(withinBudget(candidate.config), { system, schema, messages: [
              ...messages, { role: "assistant", content: JSON.stringify(publicReply(reply)) }, { role: "user", content: REWRITE_REQUEST },
            ] });
            rewritten = parseTutorJson(res2.text);
            inputTokens += res2.inputTokens ?? 0; outputTokens += res2.outputTokens ?? 0; latencyMs += res2.latencyMs;
            cachedTokens += res2.cachedInputTokens ?? 0;
            const c2 = estimateCostUsd(candidate.config, res2);
            cost = cost != null && c2 != null ? cost + c2 : cost;
          } catch { /* fall through to the safe message */ }
          const stillLeaks = !rewritten || revealsAnswer(rewritten.message, reply.finalAnswer, studentTexts);
          const finalReply: TutorReply = stillLeaks
            ? { ...reply, type: "question", hintLevel: null, message: fallbackFor(reply.language, attemptsNow === 0 && session.hints_used === 0 && !newProblem) }
            : { ...rewritten!, finalAnswer: reply.finalAnswer, difficulty: reply.difficulty };
          served = { candidate, reply: finalReply, inputTokens, outputTokens, latencyMs, cost, rewrite: true, cachedTokens };
        }

        // Second look, when the reply's verdict contradicts a check the server can do itself:
        // - the student's final result is the verified answer but the reply called it wrong
        //   (models tend to reject a valid method that differs from theirs);
        // - the student's chemical equation is unbalanced but the reply called it right.
        const verifiedWrong = checked === "incorrect" && (reply.solved || reply.type === "affirmation");
        const unbalanced = verifiedWrong && Boolean(studentEquation && !studentEquation.balanced);
        const rejectedRight = reply.type === "redirect" && !reply.solved && (checked === "correct" || statesAnswer(input.message ?? "", reply.finalAnswer));
        if (!served.rewrite && isAttempt && !newProblem && (verifiedWrong || rejectedRight)) {
          let second: TutorReply | null = null;
          if (remaining() >= MIN_CALL_MS) try {
            const res3 = await provider.chat(withinBudget(candidate.config), { system, schema, messages: [
              ...messages, { role: "assistant", content: JSON.stringify(publicReply(reply)) },
              { role: "user", content: unbalanced ? unbalancedRequest(studentEquation!) : verifiedWrong ? wrongAnswerRequest(verificationNote) : recheckRequest(reply.finalAnswer!) },
            ] });
            second = parseTutorJson(res3.text);
            inputTokens += res3.inputTokens ?? 0; outputTokens += res3.outputTokens ?? 0; latencyMs += res3.latencyMs;
            cachedTokens += res3.cachedInputTokens ?? 0;
            const c3 = estimateCostUsd(candidate.config, res3);
            cost = cost != null && c3 != null ? cost + c3 : cost;
          } catch { /* handled below */ }
          log({ event: "answer_recheck", reason: unbalanced ? "unbalanced_equation" : verifiedWrong ? "verified_wrong" : "rejected_right", changed: second?.type !== reply.type });
          const usable = second && !revealsAnswer(second.message, reply.finalAnswer, studentTexts) &&
            !(verifiedWrong && (second.solved || second.type === "affirmation"));
          if (usable) {
            served = { candidate, reply: { ...second!, finalAnswer: reply.finalAnswer, difficulty: reply.difficulty },
                       inputTokens, outputTokens, latencyMs, cost, rewrite: false, cachedTokens };
          } else if (verifiedWrong) {
            // Never confirm a verified-wrong answer (or an unbalanced equation), even if the model insists.
            const fallback = unbalanced ? UNBALANCED_FALLBACK : NOT_YET_FALLBACK;
            served = { candidate, reply: { ...reply, type: "redirect", solved: false, progressSummary: null,
                         message: fallback[reply.language] ?? fallback.English },
                       inputTokens, outputTokens, latencyMs, cost, rewrite: true, cachedTokens };
          }
        }
      } catch (err) {
        lastError = err instanceof ProviderError ? err : new ProviderError("unavailable", provider.name);
        log({ event: "provider_error", provider: provider.name, role: candidate.role, kind: lastError.kind, status: lastError.status });
        if (!lastError.retryable || lastError.kind === "cancelled") break;
        // A rate-limited model won't recover in a few seconds: go straight to the next model,
        // which has its own allowance.
        if (lastError.kind === "rate_limited" && route.indexOf(candidate) < route.length - 1) break;
        const wait = Math.min(lastError.retryAfterMs ?? 500, 3000);
        if (tryNo === 0 && remaining() - wait >= MIN_CALL_MS) await sleep(wait);
      }
    }
    if (served) break;
  }

  if (!served) {
    await repo.releaseQuota(userId, input.requestId);
    await repo.recordUsage({
      request_id: input.requestId, user_id: userId, org_id: ent.org_id, plan_id: ent.plan_id,
      provider: route[0].config.provider, model: route[0].config.model, model_role: route[0].role, premium: false,
      input_tokens: null, output_tokens: null, est_cost_usd: null, latency_ms: null, ttft_ms: null,
      status: lastError?.kind === "timeout" ? "timeout" : lastError?.kind === "cancelled" ? "cancelled" : "error",
      fallback_used: attempts > 1, answer_rewrite: false, error_code: lastError?.kind ?? "unknown",
    });
    if (lastError?.kind === "rate_limited") {
      // The AI provider's own limit (not the student's plan): say how long to wait.
      const retryAfter = Math.min(Math.max(Math.ceil((lastError.retryAfterMs ?? 30_000) / 1000), 5), 3600);
      return { status: 503, body: { error: "tutor_busy", retry_after_seconds: retryAfter,
        message: `Menya is very busy right now. Please try again in about ${retryAfter < 90 ? `${retryAfter} seconds` : `${Math.ceil(retryAfter / 60)} minutes`}. Your message was not counted.` } };
    }
    return { status: 503, body: { error: "tutor_unavailable", message: "The tutor is temporarily unavailable. Your message was not counted. Please try again." } };
  }

  const { candidate, reply } = served;
  if (reservedPremium && !candidate.premium) await repo.downgradeReservation(userId, input.requestId);
  // A presented bank problem must reach the student unchanged: if the model altered a number, show the original.
  if (presented) {
    const numbers = presented.item.question.match(/\d+(?:\.\d+)?/g) ?? [];
    if (!numbers.every(n => reply.message.includes(n))) {
      reply.message = `**${PRESENT_LABEL[presented.kind]}**\n\n${presented.item.question}\n\nSolve it and show your working.`;
    }
    reply.type = "question"; reply.solved = false; reply.progressSummary = null;
  }
  const rec = reconcile(checked, serverMisconception, reply.assessment ?? null, reply.type);

  // A solve counts only if the model says so AND the student's own text contains the verified answer.
  const itemSolved = Boolean(marking && marking.verdict === "correct" && !unexplained);
  const verifiedSolve = !newProblem && !session.solved && isAnswerAction(input.action) && !(studentEquation && !studentEquation.balanced) &&
    (itemSolved || (reply.solved && matchesAnswer(input.message ?? "", reply.finalAnswer)));
  const userMeta: Record<string, unknown> =
    input.action === "message" ? {}
    : input.action === "hint" ? { control: "hint", level: session.hints_used + 1 }
    : input.action === "check" ? { control: "check", text: input.message }
    : input.action === "stuck" ? { control: "stuck", reason: input.stuck }
    : { control: input.action };
  // The engine's view of this turn, kept with the reply so the next turn can adapt
  // (a repeated misconception, the last help level). Never includes answers.
  const storedMisconception = rec.misconception;
  const misconceptionCount = storedMisconception ? (storedMisconception === prevMis ? Number(prevMeta.misconceptionCount ?? 1) + 1 : 1) : 0;
  const assessedObjective = reply.assessment && reply.assessment.objective !== "other" && reply.assessment.confidence >= 0.6 ? reply.assessment.objective : null;
  const sessionObjective = presented?.item.objective ?? objectiveId ?? assessedObjective;

  // Persist conversation (never the private fields)
  const [, replyId] = await repo.appendMessages(session.id, userId, [
    { role: "user", content: userContent, meta: userMeta },
    { role: "assistant", content: reply.message, meta: {
      type: reply.type, hintLevel: reply.hintLevel, concepts: reply.conceptsDetected,
      state: plan.state, engineHint: plan.hintLevel, verdict: checked,
      ...(storedMisconception ? { misconception: storedMisconception, misconceptionCount } : {}),
      ...(sessionObjective ? { objective: sessionObjective } : {}),
      ...(verifiedSolve ? { solved: true } : {}),
      ...(progressSummaryOk(reply, verifiedSolve) ? { summary: reply.progressSummary } : {}),
    } },
  ]);
  if (reply.finalAnswer && reply.finalAnswer !== rememberedAnswer) await repo.setSessionAnswer(session.id, reply.finalAnswer);
  else if (newProblem && !reply.finalAnswer && rememberedAnswer) await repo.setSessionAnswer(session.id, ""); // forget the old problem's answer
  const hintsUsed = newProblem ? 0 : session.hints_used + (input.action === "hint" ? 1 : 0);
  const practice = newProblem ? true : session.practice;
  const examplesUsed = newProblem ? 0 : session.examples_used + (input.action === "example" ? 1 : 0);
  await repo.updateSession(session.id, {
    turn_count: session.turn_count + 1, hints_used: hintsUsed, attempts: attemptsNow, practice, examples_used: examplesUsed,
    solved: newProblem ? false : session.solved || verifiedSolve,
    problems_solved: session.problems_solved + (verifiedSolve ? 1 : 0),
    last_difficulty: reply.difficulty ?? difficulty, language: reply.language || session.language,
    mode, engine_state: plan.state, hint_level: plan.hintLevel, objective: sessionObjective,
  });
  // Evidence for the learning profile (verified attempts only).
  if (newRecord && evidenceObjective) {
    await repo.saveObjectiveRecord(userId, newRecord);
    await repo.recordAttempt({
      user_id: userId, session_id: session.id, objective_id: evidenceObjective, template_id: sessionItem?.item.templateId ?? null,
      seed: sessionItem?.item.seed ?? null, kind: evidenceKind(sessionItem?.kind ?? null), verdict: checked as "correct" | "incorrect",
      misconception: marking?.misconception ?? null, hints_used: session.hints_used, unexplained,
    });
  }
  if (itemSolved) await repo.setSessionItem(session.id, userId, null);
  if (verifiedSolve) {
    await repo.recordLearningEvent({
      user_id: userId, session_id: session.id, kind: session.practice ? "practice_solved" : "problem_solved",
      concepts: reply.conceptsDetected.slice(0, 8), hints_used: hintsUsed, examples_used: examplesUsed, attempts: attemptsNow,
    });
  }
  await repo.recordUsage({
    request_id: input.requestId, user_id: userId, org_id: ent.org_id, plan_id: ent.plan_id,
    provider: candidate.config.provider, model: candidate.config.model, model_role: candidate.role, premium: candidate.premium,
    input_tokens: served.inputTokens, output_tokens: served.outputTokens, est_cost_usd: served.cost,
    cached_input_tokens: served.cachedTokens,
    latency_ms: served.latencyMs, ttft_ms: null, status: "success",
    fallback_used: candidate.fallback || attempts > 1, answer_rewrite: served.rewrite, error_code: null,
  });

  return {
    status: 200,
    body: {
      reply: { ...publicReply(reply), messageId: replyId ?? null, solved: verifiedSolve, progressSummary: progressSummaryOk(reply, verifiedSolve) ? reply.progressSummary : null },
      sessionId: session.id,
      hintsUsed,
      problem: { solved: !newProblem && (session.solved || verifiedSolve), practice, attempts: attemptsNow },
      advancedReasoning: candidate.premium,  // plain-language flag; no model names
      engine: {
        mode, state: plan.state, hintLevel: plan.hintLevel,
        verified: checked === "unknown" ? null : checked,
        objective: sessionObjective ? { id: sessionObjective, title: objectiveInfo(sessionObjective)?.title ?? sessionObjective } : null,
        item: presented ? { kind: presented.kind } : sessionItem && !itemSolved ? { kind: sessionItem.kind } : null,
        mastery: newRecord ? { status: newRecord.status, estimate: Math.round(estimate(newRecord).mean * 100) / 100,
                               independent: newRecord.independent_correct, nextReview: newRecord.next_review_at } : null,
      },
      quota: {
        plan: ent.plan_id,
        daily_remaining: quota.daily_remaining,
        monthly_remaining: quota.monthly_remaining,
        premium_remaining: reservedPremium && !candidate.premium ? (quota.premium_remaining ?? 0) + 1 : quota.premium_remaining,
      },
    },
  };
}

const isAnswerAction = (a: TutorAction) => a === "message" || a === "check";

// "What you've established" is shown only for replies about the student's own work.
function progressSummaryOk(reply: TutorReply, verifiedSolve: boolean): boolean {
  return Boolean(reply.progressSummary) && (verifiedSolve || reply.type === "summary" || reply.type === "affirmation");
}
