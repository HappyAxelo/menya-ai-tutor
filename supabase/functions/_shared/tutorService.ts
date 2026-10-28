// ============================================================
// Tutor request pipeline:
//   authenticated user → entitlement → session → quota (atomic) →
//   difficulty → route → model (bounded retries + fallback) →
//   answer-leak check → verified-solve check → persist →
//   usage/cost record (+ learning event) → response
// ============================================================
import {
  actionRequest, buildResponseSchema, buildSystemPrompt, chosenLanguageNote, detectLanguage, hintRequest, languageNote, problemNote, parseTutorJson, publicReply,
  REWRITE_REQUEST, recheckRequest, LEARNER_LEVELS, REPLY_STYLES, TUTOR_ACTIONS,
  type LearnerLevel, type ReplyStyle, type TutorAction, type TutorReply,
} from "./policy.ts";
import { matchesAnswer, revealsAnswer, statesAnswer } from "./answerGuard.ts";
import { classifyDifficulty, planRoute, type RouteCandidate } from "./router.ts";
import { estimateCostUsd, ProviderError, type ChatMessage, type ModelProvider } from "./providers.ts";
import type { Entitlement, Repo, Session } from "./repo.ts";

export interface TutorInput {
  requestId: string;          // client-generated UUID; makes retries idempotent
  sessionId?: string | null;  // omitted = new problem
  action: TutorAction;
  message?: string;           // the student's text (message, or the answer to check)
  language?: string;
  learnerLevel?: LearnerLevel;
  style?: ReplyStyle;
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
  if (action !== "message" && !b.sessionId) return action === "hint" ? "hint_needs_session" : "action_needs_session";
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
  };
}

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
    session = await repo.createSession(userId, ent.org_id, (input.message ?? "").slice(0, 80), followStudent ? detected : input.language!);
  }
  if (session.turn_count >= ent.max_session_turns) {
    return { status: 409, body: { error: "session_limit", message: "This session is at its length limit. Start a new problem to continue.",
                                  limit: ent.max_session_turns, upgrade_to: NEXT_PLAN[ent.plan_id] ?? null } };
  }
  if (input.action === "hint" && session.hints_used >= 3) {
    return { status: 409, body: { error: "hint_limit", message: "All 3 hints for this problem have been used." } };
  }

  const lang = followStudent ? (detected ?? session.language) : input.language;
  const userContent = input.action === "message" ? input.message!
    : input.action === "hint" ? hintRequest(session.hints_used + 1, lang)
    : actionRequest(input.action, lang, input.message);
  const history = await repo.loadMessages(session.id, ent.context_turns * 2);
  const rememberedAnswer = input.sessionId ? await repo.getSessionAnswer(session.id) : null;
  // The student's own words (a checked answer is stored under meta.text).
  const studentTexts = history.filter(m => m.role === "user")
    .map(m => (m.meta?.control ? (typeof m.meta.text === "string" ? m.meta.text : null) : m.content))
    .filter((t): t is string => Boolean(t));
  const isAttempt = input.action === "check" || (input.action === "message" && Boolean(input.sessionId));
  if (input.action === "message" || input.action === "check") studentTexts.push(input.message!);
  const newProblem = input.action === "practice";
  const attemptsNow = newProblem ? 0 : session.attempts + (isAttempt ? 1 : 0);

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
        const earnedSolution = reply.type === "worked_solution" && ent.worked_solutions && !newProblem &&
          (session.hints_used >= 3 || attemptsNow >= 2 || session.solved);
        if (!earnedSolution && revealsAnswer(reply.message, reply.finalAnswer, studentTexts)) {
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
            ? { ...reply, type: "question", hintLevel: null, message: SAFE_FALLBACK[reply.language] ?? SAFE_FALLBACK.English }
            : { ...rewritten!, finalAnswer: reply.finalAnswer, difficulty: reply.difficulty };
          served = { candidate, reply: finalReply, inputTokens, outputTokens, latencyMs, cost, rewrite: true, cachedTokens };
        }

        // Second look: the student's final result is the verified answer but the reply
        // called it wrong (models tend to reject a valid method that differs from theirs).
        if (!served.rewrite && isAttempt && reply.type === "redirect" && !reply.solved && !newProblem &&
            statesAnswer(input.message ?? "", reply.finalAnswer) && remaining() >= MIN_CALL_MS) {
          try {
            const res3 = await provider.chat(withinBudget(candidate.config), { system, schema, messages: [
              ...messages, { role: "assistant", content: JSON.stringify(publicReply(reply)) },
              { role: "user", content: recheckRequest(reply.finalAnswer) },
            ] });
            const second = parseTutorJson(res3.text);
            inputTokens += res3.inputTokens ?? 0; outputTokens += res3.outputTokens ?? 0; latencyMs += res3.latencyMs;
            cachedTokens += res3.cachedInputTokens ?? 0;
            const c3 = estimateCostUsd(candidate.config, res3);
            cost = cost != null && c3 != null ? cost + c3 : cost;
            log({ event: "answer_recheck", changed: second?.type !== "redirect" });
            if (second && !revealsAnswer(second.message, reply.finalAnswer, studentTexts)) {
              served = { candidate, reply: { ...second, finalAnswer: reply.finalAnswer, difficulty: reply.difficulty },
                         inputTokens, outputTokens, latencyMs, cost, rewrite: false, cachedTokens };
            }
          } catch { /* keep the first reply */ }
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

  // A solve counts only if the model says so AND the student's own text contains the verified answer.
  const verifiedSolve = !newProblem && !session.solved && reply.solved && isAnswerAction(input.action) &&
    matchesAnswer(input.message ?? "", reply.finalAnswer);
  const userMeta: Record<string, unknown> =
    input.action === "message" ? {}
    : input.action === "hint" ? { control: "hint", level: session.hints_used + 1 }
    : input.action === "check" ? { control: "check", text: input.message }
    : { control: input.action };

  // Persist conversation (never the private fields)
  await repo.appendMessages(session.id, userId, [
    { role: "user", content: userContent, meta: userMeta },
    { role: "assistant", content: reply.message, meta: {
      type: reply.type, hintLevel: reply.hintLevel, concepts: reply.conceptsDetected,
      ...(reply.misconceptionDetected ? { misconception: reply.misconceptionDetected } : {}),
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
  });
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
      reply: { ...publicReply(reply), solved: verifiedSolve, progressSummary: progressSummaryOk(reply, verifiedSolve) ? reply.progressSummary : null },
      sessionId: session.id,
      hintsUsed,
      problem: { solved: !newProblem && (session.solved || verifiedSolve), practice, attempts: attemptsNow },
      advancedReasoning: candidate.premium,  // plain-language flag; no model names
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
