// Repo implementation over PGlite: same SQL functions as production, so
// service tests exercise the real quota/entitlement logic.
import type { PGlite } from "@electric-sql/pglite";
import { toRecord, type Repo } from "../functions/_shared/repo.ts";
import { rpc } from "./db.ts";

export function pgRepo(db: PGlite): Repo {
  const one = async (sql: string, params: unknown[] = []) => (await db.query<any>(sql, params)).rows[0];
  return {
    async getLearnerProfile(userId) {
      return (await one("select education_level, year_of_study, institution, programme, curriculum, goals, country, explanation_style from public.learner_profiles where user_id = $1", [userId])) ?? null;
    },
    async searchMaterials(userId, query, limit) {
      return (await db.query<any>("select title, kind, page, content from public.search_materials($1, $2, $3)", [userId, query, limit])).rows;
    },
    async resolveEntitlement(userId) { return one("select * from public.resolve_entitlement($1)", [userId]); },
    async getModelConfigs() {
      const rows = (await db.query<any>("select * from public.model_configs")).rows;
      return Object.fromEntries(rows.map(r => [r.role, { ...r, input_usd_per_mtok: Number(r.input_usd_per_mtok), output_usd_per_mtok: Number(r.output_usd_per_mtok) }]));
    },
    async getSettingNumber(key, fallback) {
      const r = await one("select value from public.app_settings where key = $1", [key]);
      const n = Number(r?.value); return Number.isFinite(n) ? n : fallback;
    },
    consumeQuota: (u, id, premium) => rpc(db, "consume_quota", { p_user: u, p_request_id: id, p_premium: premium }),
    releaseQuota: (u, id) => rpc(db, "release_quota", { p_user: u, p_request_id: id }),
    downgradeReservation: (u, id) => rpc(db, "downgrade_reservation", { p_user: u, p_request_id: id }),
    async recordUsage(record) { await rpc(db, "record_usage", { p: record }); },
    async getSession(userId, sessionId) {
      return (await one("select * from public.tutoring_sessions where id = $1 and user_id = $2", [sessionId, userId])) ?? null;
    },
    async createSession(userId, orgId, title, language) {
      return one("insert into public.tutoring_sessions (user_id, org_id, title, language) values ($1, $2, $3, $4) returning *", [userId, orgId, title, language]);
    },
    async loadMessages(sessionId, limit) {
      const rows = (await db.query<any>("select role, content, meta from public.tutoring_messages where session_id = $1 order by id desc limit $2", [sessionId, limit])).rows;
      return rows.reverse();
    },
    async appendMessages(sessionId, userId, messages) {
      const ids: number[] = [];
      for (const m of messages) {
        const r = await db.query<{ id: number }>("insert into public.tutoring_messages (session_id, user_id, role, content, meta) values ($1, $2, $3, $4, $5) returning id",
          [sessionId, userId, m.role, m.content, JSON.stringify(m.meta)]);
        ids.push(Number(r.rows[0].id));
      }
      return ids;
    },
    async getSessionAnswer(sessionId) {
      return (await one("select final_answer from public.tutoring_session_answers where session_id = $1", [sessionId]))?.final_answer ?? null;
    },
    async setSessionAnswer(sessionId, answer) {
      await db.query(`insert into public.tutoring_session_answers (session_id, final_answer) values ($1, $2)
        on conflict (session_id) do update set final_answer = excluded.final_answer, updated_at = now()`, [sessionId, answer]);
    },
    async updateSession(sessionId, patch) {
      const keys = Object.keys(patch);
      if (!keys.length) return;
      await db.query(`update public.tutoring_sessions set ${keys.map((k, i) => `${k} = $${i + 2}`).join(", ")}, updated_at = now() where id = $1`,
        [sessionId, ...keys.map(k => (patch as any)[k])]);
    },
    async getSessionItem(sessionId) {
      const r = await one("select kind, item from public.session_items where session_id = $1", [sessionId]);
      return r ? { kind: r.kind, item: r.item } : null;
    },
    async setSessionItem(sessionId, userId, entry) {
      if (!entry) { await db.query("delete from public.session_items where session_id = $1", [sessionId]); return; }
      await db.query(`insert into public.session_items (session_id, user_id, kind, item) values ($1, $2, $3, $4)
        on conflict (session_id) do update set kind = excluded.kind, item = excluded.item, created_at = now()`, [sessionId, userId, entry.kind, JSON.stringify(entry.item)]);
    },
    async markServed(userId, templateId, seed, kind) {
      const r = await db.query("insert into public.served_items (user_id, template_id, seed, kind) values ($1, $2, $3, $4) on conflict do nothing returning seed",
        [userId, templateId, seed, kind]);
      return r.rows.length === 1;
    },
    async getObjectiveRecord(userId, objectiveId) {
      const r = await one("select * from public.learner_objectives where user_id = $1 and objective_id = $2", [userId, objectiveId]);
      return r ? toRecord(r) : null;
    },
    async saveObjectiveRecord(userId, r) {
      const cols = ["objective_id", "alpha", "beta", "independent_correct", "guided_correct", "incorrect", "delayed_correct",
        "last_success_at", "last_seen_at", "next_review_at", "review_streak", "misconceptions", "status"] as const;
      await db.query(`insert into public.learner_objectives (user_id, ${cols.join(", ")}) values ($1, ${cols.map((_, i) => `$${i + 2}`).join(", ")})
        on conflict (user_id, objective_id) do update set ${cols.slice(1).map(c => `${c} = excluded.${c}`).join(", ")}, updated_at = now()`,
        [userId, ...cols.map(c => (c === "misconceptions" ? JSON.stringify(r[c]) : r[c]))]);
    },
    async recordAttempt(a) {
      await db.query(`insert into public.assessment_attempts (user_id, session_id, objective_id, template_id, seed, kind, verdict, misconception, hints_used, unexplained)
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [a.user_id, a.session_id, a.objective_id, a.template_id, a.seed, a.kind, a.verdict, a.misconception, a.hints_used, a.unexplained]);
    },
    async dueReviews(userId, now, limit) {
      const rows = (await db.query<any>("select objective_id from public.learner_objectives where user_id = $1 and next_review_at <= $2 order by next_review_at limit $3",
        [userId, now.toISOString(), limit])).rows;
      return rows.map(r => r.objective_id);
    },
    async recordLearningEvent(e) {
      await db.query(`insert into public.learning_events (user_id, session_id, kind, concepts, hints_used, examples_used, attempts)
        values ($1, $2, $3, $4, $5, $6, $7)`, [e.user_id, e.session_id, e.kind, e.concepts, e.hints_used, e.examples_used, e.attempts]);
    },
    processPaymentEvent: (provider, event, raw) => rpc(db, "process_payment_event", { p_provider: provider, p_event: event, p_raw: raw }),
    async audit(entry) {
      await db.query("insert into public.audit_logs (actor_id, action, target_type, target_id, org_id, details) values ($1, $2, $3, $4, $5, $6)",
        [entry.actor_id, entry.action, entry.target_type ?? null, entry.target_id ?? null, entry.org_id ?? null, JSON.stringify(entry.details ?? {})]);
    },
  };
}
