// ============================================================
// Data access used by the services. One interface, two
// implementations: Supabase (production, via the service-role
// client) and PGlite (tests, same SQL functions).
// ============================================================
import type { ModelConfig } from "./providers.ts";
import type { LearnerContext, MaterialPassage } from "./policy.ts";
import type { Difficulty } from "./policy.ts";
import type { Item } from "./engine/bank.ts";
import type { ObjectiveRecord } from "./engine/mastery.ts";
import { DEFAULT_RESEARCH_CONFIG, type ResearchCall, type ResearchConfig, type ResearchStore } from "./research/pipeline.ts";
import type { Paper } from "./research/connectors.ts";

export interface Entitlement {
  plan_id: string;
  source: "free" | "subscription" | "organization";
  org_id: string | null;
  subscription_status: string | null;
  period_end: string | null;
  daily_request_limit: number;
  monthly_request_limit: number;
  monthly_premium_limit: number;
  premium_safety_margin: number;
  requests_per_minute: number;
  max_session_turns: number;
  context_turns: number;
  routing_policy: "free" | "pro" | "professional";
  analytics_level: "basic" | "enhanced";
  worked_solutions: boolean;
}

export interface QuotaResult {
  allowed: boolean;
  reason?: string;
  plan?: string;
  daily_remaining?: number;
  monthly_remaining?: number;
  premium_remaining?: number;
  retry_after_seconds?: number;
}

export interface Session {
  id: string;
  user_id: string;
  org_id: string | null;
  title: string;
  language: string | null;
  turn_count: number;
  hints_used: number;
  last_difficulty: Difficulty | null;
  attempts: number;
  practice: boolean;
  solved: boolean;
  examples_used: number;
  problems_solved: number;
  mode?: "learn" | "explain";
  engine_state?: string | null;
  hint_level?: number | null;
  objective?: string | null;
}

export type ItemKind = "practice" | "verify" | "review";
export interface AssessmentAttempt {
  user_id: string; session_id: string | null; objective_id: string; template_id: string | null; seed: number | null;
  kind: "guided" | ItemKind; verdict: "correct" | "incorrect"; misconception: string | null; hints_used: number; unexplained: boolean;
}

export interface LearningEvent {
  user_id: string; session_id: string; kind: "problem_solved" | "practice_solved";
  concepts: string[]; hints_used: number; examples_used: number; attempts: number;
}

export interface TeachingEvent {
  user_id: string; session_id: string; objective_id: string | null; kind: string; visual_kind: string | null; language: string | null; level: string | null;
}

export interface StoredMessage { role: "user" | "assistant"; content: string; meta: Record<string, unknown> }

export interface UsageRecord {
  request_id: string; user_id: string; org_id: string | null; plan_id: string;
  provider: string | null; model: string | null; model_role: string | null; premium: boolean;
  input_tokens: number | null; output_tokens: number | null; est_cost_usd: number | null;
  cached_input_tokens?: number | null;
  latency_ms: number | null; ttft_ms: number | null;
  status: "success" | "timeout" | "error" | "cancelled";
  fallback_used: boolean; answer_rewrite: boolean; error_code: string | null;
}

export interface ResearchQueryRecord {
  subject: string; tier: "auto" | "deep"; status: "ok" | "empty" | "unavailable"; sources_found: number; sources_cited: number;
  citation_failures: number; degraded: boolean; duration_ms: number | null; est_cost_usd: number | null;
}

export interface Repo extends ResearchStore {
  resolveEntitlement(userId: string): Promise<Entitlement>;
  getModelConfigs(): Promise<Record<string, ModelConfig>>;
  getSettingNumber(key: string, fallback: number): Promise<number>;
  consumeQuota(userId: string, requestId: string, premium: boolean): Promise<QuotaResult>;
  releaseQuota(userId: string, requestId: string): Promise<boolean>;
  downgradeReservation(userId: string, requestId: string): Promise<boolean>;
  recordUsage(record: UsageRecord): Promise<void>;
  getSession(userId: string, sessionId: string): Promise<Session | null>;
  createSession(userId: string, orgId: string | null, title: string, language: string | null): Promise<Session>;
  // Removes a conversation only if it has no messages (one created by a request that got no reply).
  deleteEmptySession(userId: string, sessionId: string): Promise<void>;
  loadMessages(sessionId: string, limit: number): Promise<StoredMessage[]>;
  // Returns the new messages' ids, in order.
  appendMessages(sessionId: string, userId: string, messages: StoredMessage[]): Promise<number[]>;
  getSessionAnswer(sessionId: string): Promise<string | null>;
  setSessionAnswer(sessionId: string, answer: string): Promise<void>;
  updateSession(sessionId: string, patch: Partial<Pick<Session, "turn_count" | "hints_used" | "last_difficulty" | "language" | "title" | "attempts" | "practice" | "solved" | "examples_used" | "problems_solved" | "mode" | "engine_state" | "hint_level" | "objective">>): Promise<void>;
  // Tutoring engine: the private bank item being answered, served problems, the learner's profile.
  getSessionItem(sessionId: string): Promise<{ kind: ItemKind; item: Item } | null>;
  setSessionItem(sessionId: string, userId: string, entry: { kind: ItemKind; item: Item } | null): Promise<void>;
  markServed(userId: string, templateId: string, seed: number, kind: ItemKind): Promise<boolean>;   // false = seen before
  getObjectiveRecord(userId: string, objectiveId: string): Promise<ObjectiveRecord | null>;
  saveObjectiveRecord(userId: string, record: ObjectiveRecord): Promise<void>;
  recordAttempt(attempt: AssessmentAttempt): Promise<void>;
  dueReviews(userId: string, now: Date, limit: number): Promise<string[]>;
  // Learning companion: the learner's profile and passages from their own materials.
  getLearnerProfile(userId: string): Promise<LearnerContext | null>;
  searchMaterials(userId: string, query: string, limit: number): Promise<MaterialPassage[]>;
  // Pictures in replies: today's allowance (limit null = none), and recording one (false = limit just reached).
  diagramAllowance(userId: string, planId: string): Promise<{ limit: number | null; used: number }>;
  useDiagram(userId: string, cap: number): Promise<boolean>;
  // Academic research: today's allowance, recording a search, and numbers for administrators (no question text, no user).
  researchAllowance(userId: string, planId: string): Promise<{ limit: number; used: number }>;
  useResearch(userId: string, cap: number): Promise<boolean>;
  recordResearchCalls(calls: ResearchCall[]): Promise<void>;
  recordResearchQuery(record: ResearchQueryRecord): Promise<void>;
  learnerMemory(userId: string): Promise<any[]>;
  recordLearningEvent(event: LearningEvent): Promise<void>;
  // Teaching events: what happened, never what was said. Failing to record one never stops a reply.
  recordTeachingEvents(events: TeachingEvent[]): Promise<void>;
  teachingSignals(userId: string): Promise<Record<string, number>>;   // events of each kind in the last 14 days
  processPaymentEvent(provider: string, event: unknown, raw: unknown): Promise<string>;
  audit(entry: { actor_id: string | null; action: string; target_type?: string; target_id?: string; org_id?: string | null; details?: Record<string, unknown> }): Promise<void>;
}

// ------------------------------------------------------------
// Supabase implementation (service-role client; bypasses RLS, so every
// method is scoped by the user id the caller has already authenticated).
// ------------------------------------------------------------
// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

function check<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

export function supabaseRepo(sb: SupabaseClient): Repo {
  let configCache: { at: number; value: Record<string, ModelConfig> } | null = null;
  let researchConfigCache: { at: number; value: ResearchConfig } | null = null;
  return {
    async resolveEntitlement(userId) {
      const rows = check(await sb.rpc("resolve_entitlement", { p_user: userId }), "resolve_entitlement");
      return rows[0];
    },
    async getModelConfigs() {
      if (configCache && Date.now() - configCache.at < 60_000) return configCache.value;
      const rows: ModelConfig[] = check(await sb.from("model_configs").select("*"), "model_configs");
      configCache = { at: Date.now(), value: Object.fromEntries(rows.map(r => [r.role, r])) };
      return configCache.value;
    },
    async getSettingNumber(key, fallback) {
      const rows = check(await sb.from("app_settings").select("value").eq("key", key), "app_settings");
      const n = Number(rows[0]?.value);
      return Number.isFinite(n) ? n : fallback;
    },
    async consumeQuota(userId, requestId, premium) {
      return check(await sb.rpc("consume_quota", { p_user: userId, p_request_id: requestId, p_premium: premium }), "consume_quota");
    },
    async releaseQuota(userId, requestId) {
      return check(await sb.rpc("release_quota", { p_user: userId, p_request_id: requestId }), "release_quota");
    },
    async downgradeReservation(userId, requestId) {
      return check(await sb.rpc("downgrade_reservation", { p_user: userId, p_request_id: requestId }), "downgrade_reservation");
    },
    async recordUsage(record) {
      check(await sb.rpc("record_usage", { p: record }), "record_usage");
    },
    async getSession(userId, sessionId) {
      const rows = check(await sb.from("tutoring_sessions").select("*").eq("id", sessionId).eq("user_id", userId), "get_session");
      return rows[0] ?? null;
    },
    async createSession(userId, orgId, title, language) {
      const rows = check(await sb.from("tutoring_sessions")
        .insert({ user_id: userId, org_id: orgId, title, language }).select("*"), "create_session");
      return rows[0];
    },
    async deleteEmptySession(userId, sessionId) {
      const rows = check(await sb.from("tutoring_messages").select("id").eq("session_id", sessionId).limit(1), "count_messages") as any[];
      if (!rows.length) check(await sb.from("tutoring_sessions").delete().eq("id", sessionId).eq("user_id", userId), "delete_empty_session");
    },
    async loadMessages(sessionId, limit) {
      const rows = check(await sb.from("tutoring_messages").select("role, content, meta")
        .eq("session_id", sessionId).order("id", { ascending: false }).limit(limit), "load_messages");
      return rows.reverse();
    },
    async appendMessages(sessionId, userId, messages) {
      const rows = check(await sb.from("tutoring_messages").insert(messages.map(m => ({ ...m, session_id: sessionId, user_id: userId })))
        .select("id"), "append_messages") as { id: number }[];
      return rows.map(r => Number(r.id));
    },
    async getSessionAnswer(sessionId) {
      const rows = check(await sb.from("tutoring_session_answers").select("final_answer").eq("session_id", sessionId), "get_session_answer");
      return rows[0]?.final_answer ?? null;
    },
    async setSessionAnswer(sessionId, answer) {
      check(await sb.from("tutoring_session_answers")
        .upsert({ session_id: sessionId, final_answer: answer, updated_at: new Date().toISOString() }), "set_session_answer");
    },
    async updateSession(sessionId, patch) {
      check(await sb.from("tutoring_sessions").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", sessionId), "update_session");
    },
    async getSessionItem(sessionId) {
      const rows = check(await sb.from("session_items").select("kind, item").eq("session_id", sessionId), "get_session_item") as any[];
      return rows[0] ? { kind: rows[0].kind, item: rows[0].item } : null;
    },
    async setSessionItem(sessionId, userId, entry) {
      if (!entry) { check(await sb.from("session_items").delete().eq("session_id", sessionId), "clear_session_item"); return; }
      check(await sb.from("session_items").upsert({ session_id: sessionId, user_id: userId, kind: entry.kind, item: entry.item, created_at: new Date().toISOString() }), "set_session_item");
    },
    async markServed(userId, templateId, seed, kind) {
      const { error } = await sb.from("served_items").insert({ user_id: userId, template_id: templateId, seed, kind });
      if (error && error.code === "23505") return false;
      if (error) throw new Error(`mark_served: ${error.message}`);
      return true;
    },
    async getObjectiveRecord(userId, objectiveId) {
      const rows = check(await sb.from("learner_objectives").select("*").eq("user_id", userId).eq("objective_id", objectiveId), "get_objective") as any[];
      return rows[0] ? toRecord(rows[0]) : null;
    },
    async saveObjectiveRecord(userId, r) {
      check(await sb.from("learner_objectives").upsert({ ...r, user_id: userId, updated_at: new Date().toISOString() }), "save_objective");
    },
    async recordAttempt(a) {
      check(await sb.from("assessment_attempts").insert(a), "record_attempt");
    },
    async dueReviews(userId, now, limit) {
      const rows = check(await sb.from("learner_objectives").select("objective_id").eq("user_id", userId)
        .lte("next_review_at", now.toISOString()).order("next_review_at").limit(limit), "due_reviews") as any[];
      return rows.map(r => r.objective_id);
    },
    async getLearnerProfile(userId) {
      const rows = check(await sb.from("learner_profiles").select("education_level, year_of_study, institution, programme, curriculum, goals, country, explanation_style")
        .eq("user_id", userId), "get_learner_profile") as any[];
      return rows[0] ?? null;
    },
    async searchMaterials(userId, query, limit) {
      return check(await sb.rpc("search_materials", { p_user: userId, p_query: query, p_limit: limit }), "search_materials") as MaterialPassage[];
    },
    async diagramAllowance(userId, planId) {
      return check(await sb.rpc("diagram_allowance", { p_user: userId, p_plan: planId }), "diagram_allowance") as { limit: number | null; used: number };
    },
    async useDiagram(userId, cap) {
      return check(await sb.rpc("media_allow", { p_user: userId, p_kind: "diagram", p_cap: cap }), "use_diagram") as boolean;
    },
    async researchAllowance(userId, planId) {
      return check(await sb.rpc("research_allowance", { p_user: userId, p_plan: planId }), "research_allowance") as { limit: number; used: number };
    },
    async useResearch(userId, cap) {
      return check(await sb.rpc("media_allow", { p_user: userId, p_kind: "research", p_cap: cap }), "use_research") as boolean;
    },
    async researchConfig() {
      if (researchConfigCache && Date.now() - researchConfigCache.at < 60_000) return researchConfigCache.value;
      const value = (check(await sb.rpc("research_config"), "research_config") ?? DEFAULT_RESEARCH_CONFIG) as ResearchConfig;
      researchConfigCache = { at: Date.now(), value };
      return value;
    },
    async researchCacheGet(key) {
      const rows = check(await sb.from("research_cache").select("results").eq("cache_key", key).gt("expires_at", new Date().toISOString()), "research_cache_get") as any[];
      return rows[0]?.results ?? null;
    },
    async researchCachePut(key, connector, papers: Paper[], hours) {
      if (hours <= 0) return;
      check(await sb.from("research_cache").upsert({ cache_key: key, connector, results: papers, created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + hours * 3600_000).toISOString() }), "research_cache_put");
    },
    async researchRateAllow(connector, perMinute) {
      return check(await sb.rpc("research_rate_allow", { p_connector: connector, p_limit: perMinute }), "research_rate_allow") as boolean;
    },
    async recordResearchCalls(calls) {
      if (calls.length) check(await sb.from("research_calls").insert(calls.filter(c => c.status !== "skipped")), "research_calls");
    },
    async recordResearchQuery(record) {
      check(await sb.from("research_queries").insert(record), "research_queries");
    },
    async learnerMemory(userId) {
      return check(await sb.rpc("learner_memory", { p_user: userId }), "learner_memory") as any[];
    },
    async recordLearningEvent(event) {
      check(await sb.from("learning_events").insert(event), "record_learning_event");
    },
    async recordTeachingEvents(events) {
      if (events.length) check(await sb.from("teaching_events").insert(events), "record_teaching_events");
    },
    async teachingSignals(userId) {
      const rows = check(await sb.from("teaching_events").select("kind").eq("user_id", userId)
        .gte("created_at", new Date(Date.now() - 14 * 864e5).toISOString()).order("created_at", { ascending: false }).limit(300), "teaching_signals") as { kind: string }[];
      return rows.reduce<Record<string, number>>((all, r) => { all[r.kind] = (all[r.kind] ?? 0) + 1; return all; }, {});
    },
    async processPaymentEvent(provider, event, raw) {
      return check(await sb.rpc("process_payment_event", { p_provider: provider, p_event: event, p_raw: raw }), "process_payment_event");
    },
    async audit(entry) {
      check(await sb.from("audit_logs").insert({ details: {}, ...entry }), "audit");
    },
  };
}

// numeric columns come back as strings from PostgREST
export function toRecord(row: any): ObjectiveRecord {
  return {
    objective_id: row.objective_id, alpha: Number(row.alpha), beta: Number(row.beta),
    independent_correct: row.independent_correct, guided_correct: row.guided_correct, incorrect: row.incorrect,
    delayed_correct: row.delayed_correct, last_success_at: row.last_success_at, last_seen_at: row.last_seen_at,
    next_review_at: row.next_review_at, review_streak: row.review_streak, misconceptions: row.misconceptions ?? {}, status: row.status,
  };
}
