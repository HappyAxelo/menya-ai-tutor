// ============================================================
// Data access used by the services. One interface, two
// implementations: Supabase (production, via the service-role
// client) and PGlite (tests, same SQL functions).
// ============================================================
import type { ModelConfig } from "./providers.ts";
import type { Difficulty } from "./policy.ts";

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
}

export interface LearningEvent {
  user_id: string; session_id: string; kind: "problem_solved" | "practice_solved";
  concepts: string[]; hints_used: number; examples_used: number; attempts: number;
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

export interface Repo {
  resolveEntitlement(userId: string): Promise<Entitlement>;
  getModelConfigs(): Promise<Record<string, ModelConfig>>;
  getSettingNumber(key: string, fallback: number): Promise<number>;
  consumeQuota(userId: string, requestId: string, premium: boolean): Promise<QuotaResult>;
  releaseQuota(userId: string, requestId: string): Promise<boolean>;
  downgradeReservation(userId: string, requestId: string): Promise<boolean>;
  recordUsage(record: UsageRecord): Promise<void>;
  getSession(userId: string, sessionId: string): Promise<Session | null>;
  createSession(userId: string, orgId: string | null, title: string, language: string | null): Promise<Session>;
  loadMessages(sessionId: string, limit: number): Promise<StoredMessage[]>;
  // Returns the new messages' ids, in order.
  appendMessages(sessionId: string, userId: string, messages: StoredMessage[]): Promise<number[]>;
  getSessionAnswer(sessionId: string): Promise<string | null>;
  setSessionAnswer(sessionId: string, answer: string): Promise<void>;
  updateSession(sessionId: string, patch: Partial<Pick<Session, "turn_count" | "hints_used" | "last_difficulty" | "language" | "title" | "attempts" | "practice" | "solved" | "examples_used" | "problems_solved">>): Promise<void>;
  recordLearningEvent(event: LearningEvent): Promise<void>;
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
    async recordLearningEvent(event) {
      check(await sb.from("learning_events").insert(event), "record_learning_event");
    },
    async processPaymentEvent(provider, event, raw) {
      return check(await sb.rpc("process_payment_event", { p_provider: provider, p_event: event, p_raw: raw }), "process_payment_event");
    },
    async audit(entry) {
      check(await sb.from("audit_logs").insert({ details: {}, ...entry }), "audit");
    },
  };
}
