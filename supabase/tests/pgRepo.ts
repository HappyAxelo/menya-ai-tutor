// Repo implementation over PGlite: same SQL functions as production, so
// service tests exercise the real quota/entitlement logic.
import type { PGlite } from "@electric-sql/pglite";
import type { Repo } from "../functions/_shared/repo.ts";
import { rpc } from "./db.ts";

export function pgRepo(db: PGlite): Repo {
  const one = async (sql: string, params: unknown[] = []) => (await db.query<any>(sql, params)).rows[0];
  return {
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
      for (const m of messages) {
        await db.query("insert into public.tutoring_messages (session_id, user_id, role, content, meta) values ($1, $2, $3, $4, $5)",
          [sessionId, userId, m.role, m.content, JSON.stringify(m.meta)]);
      }
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
