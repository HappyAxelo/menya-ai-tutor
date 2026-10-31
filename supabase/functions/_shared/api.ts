// ============================================================
// HTTP API (one Edge Function, many routes). Every route that needs a
// user verifies the Supabase JWT here; admin and org routes also check
// roles in the database. Responses never include secrets or stack traces.
// ============================================================
import { handleTutor } from "./tutorService.ts";
import { BILLING_INTERVALS, PRICE_COLUMN, WebhookSignatureError, type BillingInterval, type BillingProvider } from "./billing.ts";
import type { ModelProvider } from "./providers.ts";
import { toRecord, type Repo } from "./repo.ts";
import { buildXlsx, type Cell } from "./xlsx.ts";
import { MediaError, readImage, transcribe, type MediaOptions } from "./media.ts";
import { buildMockExam, buildReviewSet, knowledgeMap, markMockExam, studyPlan, todaySummary, type ExamItem, type LearningState } from "./learning.ts";
import { objective as objectiveInfo, questionKey } from "./engine/bank.ts";
import { emptyRecord, update as updateMastery } from "./engine/mastery.ts";

export interface Db {
  // Calls a SQL function; throws DbError on failure.
  rpc<T = any>(fn: string, args: Record<string, unknown>): Promise<T>;
}
export class DbError extends Error {
  code?: string;
  constructor(message: string, code?: string) { super(message); this.code = code; }
}

export interface AuthUser { id: string; email: string | null }

export interface ApiContext {
  repo: Repo;
  db: Db;
  providers: Record<string, ModelProvider>;
  billing: BillingProvider | null;
  billingProblems?: string[];     // payment configuration mistakes, shown to administrators
  getUser(jwt: string): Promise<AuthUser | null>;
  deleteUser(userId: string): Promise<void>;
  sendInvite?(email: string, link: string, orgName: string): Promise<void>; // optional: email not configured -> links are returned
  appUrl: string;            // public URL of the web app (for invite/checkout links)
  allowedOrigins: string[];
  log(event: Record<string, unknown>): void;
  media?: MediaOptions;      // voice transcription and image reading (Groq); absent = not offered
  hpcSecret?: string;        // HPC_REGISTER_SECRET: lets the Slurm job register its model server
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

function corsHeaders(origin: string | null, allowed: string[]): Record<string, string> {
  if (!origin || !(allowed.includes("*") || allowed.includes(origin))) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Vary": "Origin",
  };
}

async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d), b => b.toString(16).padStart(2, "0")).join("");
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$/;

function dbErrorResponse(err: unknown) {
  if (err instanceof DbError) {
    if (err.code === "42501") return json(403, { error: "forbidden" });
    if (err.code === "22023") return json(400, { error: err.message });
    if (err.code === "54000") return json(429, { error: err.message });
  }
  return null;
}

async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try { const b = await req.json(); return b && typeof b === "object" ? b : null; } catch { return null; }
}

export function parseRosterCsv(csv: string): string[] {
  // Accepts one email per line, or a CSV with an "email" column.
  const lines = csv.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const header = lines[0].toLowerCase().split(",").map(h => h.trim());
  const col = header.indexOf("email");
  const rows = col >= 0 ? lines.slice(1).map(l => l.split(",")[col]?.trim() ?? "") : lines.map(l => l.split(",")[0].trim());
  return [...new Set(rows.map(e => e.toLowerCase()).filter(e => EMAIL_RE.test(e)))];
}

export async function handleApi(req: Request, ctx: ApiContext): Promise<Response> {
  const cors = corsHeaders(req.headers.get("origin"), ctx.allowedOrigins);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const started = Date.now();
  let res: Response;
  try {
    res = await route(req, ctx);
  } catch (err) {
    ctx.log({ level: "error", event: "unhandled", path: new URL(req.url).pathname, message: err instanceof Error ? err.message : String(err) });
    res = json(500, { error: "internal_error", message: "Something went wrong. Please try again." });
  }
  ctx.log({ level: "info", event: "request", method: req.method, path: new URL(req.url).pathname, status: res.status, ms: Date.now() - started });
  for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
  return res;
}

async function route(req: Request, ctx: ApiContext): Promise<Response> {
  const url = new URL(req.url);
  // Path is /api/<route...> on Supabase (/functions/v1/api/... externally).
  const path = url.pathname.replace(/^.*?\/api(?=\/|$)/, "") || "/";
  const method = req.method;

  // ---------------- Public ----------------
  // tutorReady says whether the owner has configured an AI provider key; never which key.
  if (path === "/health" && method === "GET") return json(200, { ok: true, tutorReady: Object.keys(ctx.providers).length > 0 });
  if (path === "/plans" && method === "GET") {
    // checkoutAvailable lets the pricing page say up front whether online payment exists;
    // checkoutOptions ("plan:period") which pay buttons to show (null = every priced period).
    const options = ctx.billing?.products ? Object.keys(ctx.billing.products) : null;
    return json(200, { plans: await ctx.db.rpc("public_plans", {}),
      checkoutAvailable: Boolean(ctx.billing) && (!options || options.length > 0), checkoutOptions: options });
  }
  if (path === "/quote" && method === "POST") {
    const b = await readJson(req);
    if (!b || typeof b.institution !== "string" || typeof b.contact_name !== "string" ||
        typeof b.contact_email !== "string" || !EMAIL_RE.test(b.contact_email)) return json(400, { error: "invalid_quote" });
    if (b.website) return json(200, { ok: true }); // honeypot field: silently drop bots
    try {
      await ctx.db.rpc("submit_quote", { p: {
        institution: b.institution.slice(0, 200), contact_name: b.contact_name.slice(0, 120), contact_email: b.contact_email,
        country: typeof b.country === "string" ? b.country.slice(0, 80) : null,
        learners: Number.isInteger(b.learners) ? b.learners : null,
        message: typeof b.message === "string" ? b.message.slice(0, 4000) : null,
      } });
    } catch (err) { return dbErrorResponse(err) ?? json(400, { error: "invalid_quote" }); }
    return json(200, { ok: true });
  }
  if (path.startsWith("/billing/webhook") && method === "POST") return billingWebhook(req, ctx);
  if (path.startsWith("/hpc/") && method === "POST") return hpcRoutes(path, req, ctx);

  // ---------------- Authenticated ----------------
  const jwt = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const user = jwt ? await ctx.getUser(jwt) : null;
  if (!user) return json(401, { error: "unauthenticated" });

  if (path === "/tutor" && method === "POST") {
    const body = await readJson(req);
    const r = await handleTutor({ repo: ctx.repo, providers: ctx.providers, log: ctx.log }, user.id, body);
    return json(r.status, r.body);
  }

  // Bad / Fair / Good on a tutor reply. Only the learner's own replies can be rated.
  if (path === "/feedback" && method === "POST") {
    const b = await readJson(req);
    if (!Number.isSafeInteger(b?.messageId) || !["bad", "fair", "good"].includes(b?.rating)) return json(400, { error: "invalid_feedback" });
    try {
      return json(200, await ctx.db.rpc("submit_feedback", { p_user: user.id, p_message: b.messageId, p_rating: b.rating }));
    } catch (err) {
      return dbErrorResponse(err) ?? json(400, { error: "invalid_feedback" });
    }
  }

  if (path === "/billing/checkout" && method === "POST") {
    if (!ctx.billing) return json(501, { error: "billing_not_configured", message: "Online payment isn't available yet. Contact us to upgrade your plan." });
    const b = await readJson(req);
    const plans = await ctx.db.rpc<any[]>("public_plans", {});
    const plan = plans.find(p => p.id === b?.plan);
    const interval: BillingInterval = BILLING_INTERVALS.includes(b?.interval) ? b.interval : "month";
    if (!plan || plan.id === "free") return json(400, { error: "invalid_plan" });
    if (plan[PRICE_COLUMN[interval]] == null) return json(400, { error: "interval_not_offered" });
    if (ctx.billing.products && !ctx.billing.products[`${plan.id}:${interval}`]) return json(400, { error: "interval_not_offered" });
    try {
      const { url: checkoutUrl } = await ctx.billing.createCheckout({ userId: user.id, email: user.email, planId: plan.id, interval,
        successUrl: `${ctx.appUrl}/?checkout=done`, cancelUrl: `${ctx.appUrl}/?checkout=cancelled` });
      return json(200, { url: checkoutUrl });
    } catch (err) {
      ctx.log({ level: "error", event: "checkout_failed", message: err instanceof Error ? err.message : String(err) });
      return json(502, { error: "checkout_unavailable", message: "Checkout is temporarily unavailable." });
    }
  }

  if (path === "/account" && method === "DELETE") {
    await ctx.repo.audit({ actor_id: user.id, action: "account.delete", target_type: "user", target_id: user.id });
    await ctx.deleteUser(user.id); // cascades to profile, sessions, messages, memberships; usage rows are kept anonymised
    return json(200, { ok: true });
  }
  if (path === "/account/export" && method === "GET") {
    return json(200, await ctx.db.rpc("export_my_data", { p_user: user.id }), { "Content-Disposition": "attachment; filename=menya-data.json" });
  }

  if (path === "/org/accept" && method === "POST") {
    const b = await readJson(req);
    if (typeof b?.token !== "string" || b.token.length < 20) return json(400, { error: "invalid_token" });
    try { return json(200, await ctx.db.rpc("org_accept_invite", { p_user: user.id, p_token_hash: await sha256Hex(b.token) })); }
    catch (err) { return dbErrorResponse(err) ?? json(400, { error: "invalid_or_expired_invitation" }); }
  }
  if ((path === "/media/transcribe" || path === "/media/read-image") && method === "POST") return mediaRoute(path, req, ctx, user);
  if (path.startsWith("/learn/") || path.startsWith("/exam/") || path.startsWith("/review/") || path === "/materials") return learningRoutes(path, req, ctx, user, url);
  if (path.startsWith("/org/")) return orgRoutes(path, req, ctx, user);
  if (path.startsWith("/admin/")) return adminRoutes(path, req, ctx, user, url);

  return json(404, { error: "not_found" });
}

async function billingWebhook(req: Request, ctx: ApiContext): Promise<Response> {
  if (!ctx.billing) return json(501, { error: "billing_not_configured" });
  const raw = await req.text();
  let event;
  try {
    event = await ctx.billing.verifyWebhook(req.headers, raw);
  } catch (err) {
    if (err instanceof WebhookSignatureError) {
      ctx.log({ level: "warn", event: "webhook_rejected", provider: ctx.billing.name, reason: err.message });
      return json(401, { error: "invalid_signature" });
    }
    throw err;
  }
  try {
    const result = await ctx.repo.processPaymentEvent(ctx.billing.name, event, JSON.parse(raw));
    return json(200, { result });
  } catch (err) {
    ctx.log({ level: "error", event: "webhook_failed", provider: ctx.billing.name, message: err instanceof Error ? err.message : String(err) });
    return json(500, { error: "processing_failed" }); // provider will retry; processing is idempotent
  }
}

async function orgRoutes(path: string, req: Request, ctx: ApiContext, user: AuthUser): Promise<Response> {
  const b = req.method === "POST" ? await readJson(req) : null;
  const url = new URL(req.url);
  const orgId = (b?.org ?? url.searchParams.get("org")) as string | null;
  if (!orgId || !UUID_RE.test(orgId)) return json(400, { error: "invalid_org" });
  try {
    if (path === "/org/dashboard" && req.method === "GET") {
      const month = url.searchParams.get("month") ?? new Date().toISOString().slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(month)) return json(400, { error: "invalid_month" });
      return json(200, await ctx.db.rpc("org_dashboard", { p_actor: user.id, p_org: orgId, p_month: month }));
    }
    if (path === "/org/roster" && req.method === "GET") {
      return json(200, { members: await ctx.db.rpc("org_roster_json", { p_actor: user.id, p_org: orgId }) });
    }
    if (path === "/org/invite" && req.method === "POST") {
      const emails = Array.isArray(b?.emails) ? (b!.emails as unknown[]).filter((e): e is string => typeof e === "string" && EMAIL_RE.test(e))
        : typeof b?.csv === "string" ? parseRosterCsv(b.csv) : [];
      if (!emails.length || emails.length > 500) return json(400, { error: "invalid_emails", message: "Provide 1–500 valid email addresses." });
      const role = b?.role === "org_admin" ? "org_admin" : "learner";
      const results: { email: string; link?: string; emailed: boolean }[] = [];
      for (const email of emails) {
        const token = randomToken();
        await ctx.db.rpc("org_invite", { p_actor: user.id, p_org: orgId, p_email: email, p_role: role,
          p_token_hash: await sha256Hex(token), p_expires_at: new Date(Date.now() + 14 * 864e5).toISOString() });
        const link = `${ctx.appUrl}/?invite=${token}`;
        if (ctx.sendInvite) { await ctx.sendInvite(email, link, orgId); results.push({ email, emailed: true }); }
        else results.push({ email, link, emailed: false }); // email not configured: the admin shares links directly
      }
      return json(200, { invited: results });
    }
    if (path === "/org/seat" && req.method === "POST") {
      if (typeof b?.user !== "string" || !UUID_RE.test(b.user)) return json(400, { error: "invalid_user" });
      await ctx.db.rpc("org_set_seat", { p_actor: user.id, p_org: orgId, p_user: b.user, p_assigned: b.assigned === true });
      return json(200, { ok: true });
    }
    if (path === "/org/remove" && req.method === "POST") {
      if (typeof b?.user !== "string" || !UUID_RE.test(b.user)) return json(400, { error: "invalid_user" });
      await ctx.db.rpc("org_remove_member", { p_actor: user.id, p_org: orgId, p_user: b.user });
      return json(200, { ok: true });
    }
  } catch (err) {
    const r = dbErrorResponse(err); if (r) return r; throw err;
  }
  return json(404, { error: "not_found" });
}

async function adminRoutes(path: string, req: Request, ctx: ApiContext, user: AuthUser, url: URL): Promise<Response> {
  // Role check on every admin route, before anything else.
  const isAdmin = await ctx.db.rpc<boolean>("is_platform_admin", { p_user: user.id });
  if (!isAdmin) return json(403, { error: "forbidden" });
  const b = req.method === "POST" ? await readJson(req) : null;
  const month = url.searchParams.get("month") ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(month)) return json(400, { error: "invalid_month" });
  try {
    switch (`${req.method} ${path}`) {
      case "GET /admin/economics": return json(200, { month, rows: await ctx.db.rpc("admin_unit_economics_json", { p_month: month }) });
      case "GET /admin/alerts": return json(200, await ctx.db.rpc("admin_usage_alerts", {}));
      case "GET /admin/users": return json(200, { users: await ctx.db.rpc("admin_list_users_json", {
        p_actor: user.id, p_search: url.searchParams.get("q"), p_limit: 100 }) });
      case "GET /admin/config": return json(200, await ctx.db.rpc("admin_config", { p_actor: user.id }));
      case "GET /admin/health": {
        const entries = await Promise.all(Object.entries(ctx.providers).map(async ([name, p]) => [name, await p.health()] as const));
        return json(200, { providers: Object.fromEntries(entries) });
      }
      case "GET /admin/export": {
        const rows = await ctx.db.rpc<any[]>("admin_unit_economics_json", { p_month: month });
        const cols = ["plan_id", "paying_subscriptions", "active_users", "requests", "premium_requests", "input_tokens", "output_tokens",
          "ai_cost_usd", "allocated_infra_usd", "payment_fees_usd", "est_revenue_usd", "gross_margin_pct"];
        const csv = [cols.join(","), ...rows.map(r => cols.map(c => r[c] ?? "").join(","))].join("\n");
        return new Response(csv, { status: 200, headers: { "Content-Type": "text/csv", "Content-Disposition": `attachment; filename=menya-economics-${month.slice(0, 7)}.csv` } });
      }
      // Payment setup check: which plan periods can be paid online, and any configuration mistakes.
      // Product codes and amounts are not secret; the secret key is never returned.
      case "GET /admin/billing": {
        const plans = await ctx.db.rpc<any[]>("public_plans", {});
        const rows = plans.filter(p => p.id !== "free").flatMap(p => BILLING_INTERVALS
          .filter(i => (p[PRICE_COLUMN[i]] ?? 0) > 0)
          .map(i => {
            const product = ctx.billing?.products ? ctx.billing.products[`${p.id}:${i}`] ?? null : undefined;
            return { key: `${p.id}:${i}`, plan: p.name, interval: i, price_cents: p[PRICE_COLUMN[i]], currency: p.currency,
              product_code: product?.code ?? null, amount: product?.amount ?? null,
              payable: Boolean(ctx.billing) && product !== null };
          }));
        return json(200, { provider: ctx.billing?.name ?? null, mode: ctx.billing?.mode ?? null,
          problems: ctx.billingProblems ?? [], rows });
      }
      case "GET /admin/retention":
        return json(200, await ctx.db.rpc("admin_retention_json", { p_actor: user.id }));
      case "GET /admin/overview":
        return json(200, await ctx.db.rpc("admin_overview_json", { p_actor: user.id }));
      case "GET /admin/analytics.xlsx": {
        const [overview, users, feedback] = await Promise.all([
          ctx.db.rpc<any>("admin_overview_json", { p_actor: user.id }),
          ctx.db.rpc<any[]>("admin_users_export", { p_actor: user.id }),
          ctx.db.rpc<any[]>("admin_feedback_export", { p_actor: user.id })]);
        const file = buildXlsx(analyticsSheets(overview, users, feedback));
        return new Response(file, { status: 200, headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename=menya-analytics-${new Date().toISOString().slice(0, 10)}.xlsx` } });
      }
      case "POST /admin/grant":
        if (typeof b?.user !== "string" || !UUID_RE.test(b.user) || typeof b?.plan !== "string") return json(400, { error: "invalid_grant" });
        return json(200, { subscription_id: await ctx.db.rpc("admin_grant_subscription", {
          p_actor: user.id, p_user: b.user, p_plan: b.plan, p_days: Number(b.days ?? 30), p_note: String(b.note ?? "").slice(0, 300) }) });
      case "POST /admin/plan":
        if (typeof b?.plan !== "string" || typeof b?.changes !== "object") return json(400, { error: "invalid_plan_update" });
        await ctx.db.rpc("admin_update_plan", { p_actor: user.id, p_plan: b.plan, p_changes: b.changes });
        return json(200, { ok: true });
      case "POST /admin/model":
        if (typeof b?.role !== "string" || typeof b?.changes !== "object") return json(400, { error: "invalid_model_update" });
        await ctx.db.rpc("admin_update_model", { p_actor: user.id, p_role: b.role, p_changes: b.changes });
        return json(200, { ok: true });
      case "POST /admin/org":
        if (typeof b?.name !== "string" || typeof b?.slug !== "string" || typeof b?.plan !== "string") return json(400, { error: "invalid_org" });
        return json(200, { org_id: await ctx.db.rpc("admin_create_org", { p_actor: user.id, p_name: b.name, p_slug: b.slug, p_plan: b.plan,
          p_seats: Number(b.seats ?? 0), p_pool: b.pool == null ? null : Number(b.pool), p_admin_email: b.admin_email ?? null }) });
    }
  } catch (err) {
    const r = dbErrorResponse(err); if (r) return r; throw err;
  }
  return json(404, { error: "not_found" });
}

// The administrator's workbook: summary by plan, every learner, every rating.
const RATING_LABEL: Record<string, string> = { bad: "Bad", fair: "Fair", good: "Good" };
const when = (iso: string | null) => (iso ? iso.replace("T", " ").slice(0, 16) : "");

export function analyticsSheets(overview: any, users: any[], feedback: any[]) {
  const f = overview.feedback ?? {}, rated = (f.good ?? 0) + (f.fair ?? 0) + (f.bad ?? 0);
  const pct = (n: number) => (rated ? Math.round((n / rated) * 1000) / 10 : 0);
  const summary: Cell[][] = [
    ["Plan", "Learners", "Through an institution", "Active (7 days)", "Active (30 days)", "New (30 days)"],
    ...(overview.by_plan ?? []).map((p: any) => [p.plan_id, p.users, p.via_institution, p.active_7d, p.active_30d, p.new_30d]),
    ["All plans", overview.users_total, null, null, null, null],
    [],
    ["Last 30 days", "Value"],
    ["Conversations", overview.sessions_30d], ["Tutor replies", overview.requests_30d],
    ["Verified solves", overview.verified_solves_30d], ["Solved with no hints or examples", overview.independent_solves_30d],
    [],
    ["Feedback (all time)", "Count", "Share %"],
    ["Good", f.good ?? 0, pct(f.good ?? 0)], ["Fair", f.fair ?? 0, pct(f.fair ?? 0)], ["Bad", f.bad ?? 0, pct(f.bad ?? 0)],
  ];
  return [
    { name: "Summary", rows: summary, widths: [34, 12, 22, 16, 16, 14] },
    { name: "Users", widths: [32, 14, 14, 10, 18, 18, 14, 14, 16, 16], rows: [
      ["Email", "Plan", "Plan source", "Role", "Joined", "Last active", "Replies (30 days)", "Conversations", "Verified solves", "Feedback given"],
      ...users.map(u => [u.email, u.plan, u.plan_source, u.role, when(u.joined), when(u.last_active), u.requests_30d, u.conversations, u.verified_solves, u.feedback_given])] },
    { name: "Feedback", widths: [18, 30, 12, 8, 14, 14, 60, 80], rows: [
      ["When (UTC)", "Learner", "Plan", "Rating", "Language", "Reply type", "Learner's message", "Tutor's reply"],
      ...feedback.map(r => [when(r.created_at), r.email, r.plan, RATING_LABEL[r.rating] ?? r.rating, r.language, r.reply_type, r.question, r.reply])] },
  ];
}

// The HPC model job registers its current address (it changes with every Slurm job) and
// sends a heartbeat. Authenticated with HPC_REGISTER_SECRET, never a user token.
const HPC_URL_RE = /^https:\/\/[a-z0-9.-]+(:\d+)?(\/[\w./-]*)?$/i;
async function hpcRoutes(path: string, req: Request, ctx: ApiContext): Promise<Response> {
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const secret = ctx.hpcSecret ?? "";
  if (secret.length < 32 || given.length !== secret.length || !constantTimeEqual(given, secret)) return json(401, { error: "unauthenticated" });
  if (path === "/hpc/register") {
    const b = await readJson(req);
    const url = typeof b?.url === "string" ? b.url.replace(/\/$/, "") : "";
    if (!HPC_URL_RE.test(url) || typeof b?.model !== "string" || !/^[\w.:/-]{2,120}$/.test(b.model)) return json(400, { error: "invalid_registration" });
    await ctx.db.rpc("hpc_register", { p_url: url, p_model: b.model, p_job: typeof b.job === "string" ? b.job.slice(0, 60) : null });
    return json(200, { ok: true });
  }
  if (path === "/hpc/unregister") {
    await ctx.db.rpc("hpc_unregister", {});
    return json(200, { ok: true });
  }
  return json(404, { error: "not_found" });
}

function constantTimeEqual(a: string, b: string): boolean {
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Voice notes and photos of problems. Each learner has a daily allowance per kind
// (app_settings media_transcribe_daily / media_read_image_daily).
async function mediaRoute(path: string, req: Request, ctx: ApiContext, user: AuthUser): Promise<Response> {
  if (!ctx.media) return json(501, { error: "media_not_configured" });
  const kind = path === "/media/transcribe" ? "transcribe" : "read_image";
  let form: FormData;
  try { form = await req.formData(); } catch { return json(400, { error: "invalid_upload" }); }
  const file = form.get("file");
  if (!(file instanceof Blob) || file.size === 0) return json(400, { error: "invalid_upload" });
  const cap = await ctx.repo.getSettingNumber(`media_${kind}_daily`, kind === "transcribe" ? 60 : 30);
  if (!(await ctx.db.rpc<boolean>("media_allow", { p_user: user.id, p_kind: kind, p_cap: cap }))) {
    return json(429, { error: "media_limit", message: "You've reached today's limit for this. It resets at midnight UTC." });
  }
  const started = Date.now();
  try {
    if (kind === "transcribe") {
      const language = typeof form.get("language") === "string" ? String(form.get("language")) : null;
      const r = await transcribe(ctx.media, file, (file as File).name ?? "voice.webm", language);
      ctx.log({ level: "info", event: "media", kind, ms: Date.now() - started, seconds: r.seconds });
      return json(200, r);
    }
    const text = await readImage(ctx.media, new Uint8Array(await file.arrayBuffer()), file.type);
    ctx.log({ level: "info", event: "media", kind, ms: Date.now() - started });
    return json(200, { text });
  } catch (err) {
    if (err instanceof MediaError) return json(err.status, { error: err.message });
    throw err;
  }
}

// ---------------- Learning companion ----------------
// Profile, knowledge map, plan, exams, mock exams and course materials. No model calls:
// everything here is computed from answers the server marked itself, so it costs nothing to run.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_MATERIAL_CHARS = 300_000;
const CHUNK_CHARS = 1500;

async function loadLearningState(ctx: ApiContext, userId: string): Promise<LearningState> {
  const raw = await ctx.db.rpc<any>("learning_state", { p_user: userId });
  return { profile: raw.profile, exams: raw.exams, objectives: (raw.objectives ?? []).map(toRecord), attempts: raw.attempts ?? [],
           retries: Number(raw.retries ?? 0) };
}

const validObjectives = (xs: unknown): string[] | null =>
  Array.isArray(xs) && xs.length <= 20 && xs.every(x => typeof x === "string" && objectiveInfo(x)) ? [...new Set(xs as string[])] : null;

// Split each page into passages of at most CHUNK_CHARS (at a space where possible), keeping the page number.
export function chunkPages(pages: { page: number; text: string }[]): { page: number; content: string }[] {
  const out: { page: number; content: string }[] = [];
  for (const p of pages) {
    const text = p.text.replace(/\s+/g, " ").trim();
    let i = 0;
    while (i < text.length) {
      let end = Math.min(text.length, i + CHUNK_CHARS);
      if (end < text.length) {
        const cut = text.lastIndexOf(" ", end);
        if (cut > i + CHUNK_CHARS / 2) end = cut;
      }
      const content = text.slice(i, end).trim();
      if (content) out.push({ page: p.page, content });
      i = end;
    }
  }
  return out;
}

async function learningRoutes(path: string, req: Request, ctx: ApiContext, user: AuthUser, url: URL): Promise<Response> {
  const method = req.method;
  const now = Date.now();
  try {
    switch (`${method} ${path}`) {
      case "GET /learn/state": {
        const state = await loadLearningState(ctx, user.id);
        return json(200, { profile: state.profile, exams: state.exams, map: knowledgeMap(state.objectives, now),
          today: todaySummary(state, now), plan: studyPlan(state, now, 7) });
      }
      case "POST /learn/profile": {
        const b = await readJson(req);
        const editable = ["education_level", "year_of_study", "institution", "programme", "curriculum", "subjects", "goals", "study_minutes",
          "country", "explanation_style"];
        if (!b || Object.keys(b).some(k => !editable.includes(k))) return json(400, { error: "invalid_profile" });
        const p: Record<string, unknown> = {};
        const text = (k: string, max: number) => {
          if (!(k in b)) return true;
          if (b[k] !== null && (typeof b[k] !== "string" || (b[k] as string).length > max)) return false;
          p[k] = b[k]; return true;
        };
        if ("education_level" in b) {
          if (b.education_level !== null && !["secondary", "university", "professional", "other"].includes(b.education_level as string)) return json(400, { error: "invalid_profile" });
          p.education_level = b.education_level;
        }
        if ("year_of_study" in b) {
          const y = b.year_of_study;
          if (y !== null && !(Number.isInteger(y) && (y as number) >= 1 && (y as number) <= 12)) return json(400, { error: "invalid_profile" });
          p.year_of_study = y;
        }
        if (!text("institution", 120) || !text("programme", 120) || !text("curriculum", 120) || !text("goals", 500) || !text("country", 60)) return json(400, { error: "invalid_profile" });
        if ("explanation_style" in b) {
          if (b.explanation_style !== null && !["steps", "examples", "analogies", "visual"].includes(b.explanation_style as string)) return json(400, { error: "invalid_profile" });
          p.explanation_style = b.explanation_style;
        }
        if ("subjects" in b) {
          if (!Array.isArray(b.subjects) || b.subjects.length > 15 || !b.subjects.every(x => typeof x === "string" && x.length <= 60)) return json(400, { error: "invalid_profile" });
          p.subjects = b.subjects;
        }
        if ("study_minutes" in b) {
          const m = b.study_minutes;
          if (!Array.isArray(m) || m.length !== 7 || !m.every(x => Number.isInteger(x) && x >= 0 && x <= 600)) return json(400, { error: "invalid_profile" });
          p.study_minutes = m;
        }
        return json(200, { profile: await ctx.db.rpc("save_learning_profile", { p_user: user.id, p }) });
      }
      case "POST /learn/exams": {
        const b = await readJson(req);
        const objectives = validObjectives(b?.objectives ?? []);
        if (typeof b?.title !== "string" || !b.title.trim() || b.title.length > 120 || typeof b.exam_date !== "string" ||
            !DATE_RE.test(b.exam_date) || Number.isNaN(Date.parse(b.exam_date)) || !objectives) return json(400, { error: "invalid_exam" });
        if (Date.parse(b.exam_date) < Date.parse(new Date(now).toISOString().slice(0, 10))) return json(400, { error: "exam_in_past" });
        const id = await ctx.db.rpc("add_exam", { p_user: user.id, p_title: b.title, p_date: b.exam_date, p_objectives: objectives });
        return json(200, { id });
      }
      case "DELETE /learn/exams": {
        const id = Number(url.searchParams.get("id"));
        if (!Number.isSafeInteger(id)) return json(400, { error: "invalid_exam" });
        return (await ctx.db.rpc<boolean>("delete_exam", { p_user: user.id, p_id: id })) ? json(200, { ok: true }) : json(404, { error: "not_found" });
      }
      // Forget everything Menya learned about this learner (conversations and the account are separate).
      case "POST /learn/delete-all": {
        const b = await readJson(req);
        if (b?.confirm !== "DELETE") return json(400, { error: "confirmation_required" });
        await ctx.db.rpc("delete_my_learning_data", { p_user: user.id });
        return json(200, { ok: true });
      }
      case "POST /learn/reset": {
        const b = await readJson(req);
        if (typeof b?.objective !== "string" || !objectiveInfo(b.objective)) return json(400, { error: "invalid_objective" });
        await ctx.db.rpc("reset_objective", { p_user: user.id, p_objective: b.objective });
        return json(200, { ok: true });
      }

      // Mock exams: questions from the verified bank only, marked on the server.
      case "POST /exam/start": {
        const b = await readJson(req);
        let objectives = validObjectives(b?.objectives ?? []);
        let title = typeof b?.title === "string" && b.title.trim() ? b.title.slice(0, 120) : "Practice exam";
        if (b?.examId != null) {
          const exam = (await loadLearningState(ctx, user.id)).exams.find(e => e.id === Number(b.examId));
          if (!exam) return json(404, { error: "not_found" });
          objectives = exam.objectives.filter(id => objectiveInfo(id));
          title = exam.title;
        }
        if (!objectives?.length) return json(400, { error: "choose_topics" });
        const count = Math.min(Math.max(Number.isInteger(b?.count) ? b!.count as number : 8, 3), 20);
        const served = new Set(await ctx.db.rpc<number[]>("served_keys", { p_user: user.id }));
        const items = buildMockExam(objectives, count, Math.random, item => !served.has(questionKey(item.question)));
        if (!items.length) return json(400, { error: "choose_topics" });
        for (const it of items) await ctx.repo.markServed(user.id, it.templateId, questionKey(it.question), "verify");
        const timeLimit = items.length * 180;   // 3 minutes a question
        const id = await ctx.db.rpc<string>("create_mock_exam", { p_user: user.id, p_title: title, p_objectives: objectives,
          p_items: items, p_limit: timeLimit });
        return json(200, { id, title, timeLimitSeconds: timeLimit, source: "generated_practice",
          questions: items.map(it => ({ n: it.n, objective: it.objective, question: it.question })) });
      }
      // Review Today: wrong questions again, then new questions on topics due for review. Untimed.
      case "POST /review/start": {
        const state = await loadLearningState(ctx, user.id);
        const due = state.objectives.filter(r => r.next_review_at && Date.parse(r.next_review_at) <= now).map(r => r.objective_id)
          .filter(id => objectiveInfo(id));
        const retries = await ctx.db.rpc<any[]>("review_retries", { p_user: user.id, p_limit: 3 });
        const served = new Set(await ctx.db.rpc<number[]>("served_keys", { p_user: user.id }));
        const items = buildReviewSet(retries, due, Math.random, item => !served.has(questionKey(item.question)));
        if (!items.length) return json(400, { error: "nothing_to_review" });
        for (const it of items) if (!it.retry) await ctx.repo.markServed(user.id, it.templateId, questionKey(it.question), "review");
        const id = await ctx.db.rpc<string>("create_mock_exam", { p_user: user.id, p_title: "Review", p_objectives: [...new Set(items.map(i => i.objective))],
          p_items: items, p_limit: 14400, p_mode: "review" });
        return json(200, { id, title: "Review", mode: "review", timeLimitSeconds: null, source: "generated_practice",
          questions: items.map(it => ({ n: it.n, objective: it.objective, question: it.question, retry: Boolean(it.retry) })) });
      }
      case "POST /exam/submit": {
        const b = await readJson(req);
        if (typeof b?.id !== "string" || !UUID_RE.test(b.id) || (b.answers != null && typeof b.answers !== "object")) return json(400, { error: "invalid_submission" });
        const exam = await ctx.db.rpc<any>("get_mock_exam", { p_user: user.id, p_id: b.id });
        if (!exam) return json(404, { error: "not_found" });
        if (exam.submitted_at) return json(409, { error: "already_submitted" });
        const items = exam.items as ExamItem[];
        const marked = markMockExam(items, (b.answers ?? {}) as Record<string, string>,
          (b.seconds && typeof b.seconds === "object" ? b.seconds : {}) as Record<string, number>);
        const elapsed = Math.round((now - Date.parse(exam.started_at)) / 1000);
        const review = exam.mode === "review";
        const results = { ...marked, mode: exam.mode ?? "exam", elapsedSeconds: elapsed, timeLimitSeconds: review ? null : exam.time_limit_s,
                          late: !review && elapsed > exam.time_limit_s + 120, source: "generated_practice" };
        // Only the first submission counts (checked in the database, so two tabs can't both count).
        if (!(await ctx.db.rpc<boolean>("submit_mock_exam", { p_user: user.id, p_id: b.id, p_results: results }))) {
          return json(409, { error: "already_submitted" });
        }
        // Answered questions are independent evidence (no hints); a retried question the learner saw before is practice.
        // Unanswered ones don't count either way.
        for (const r of marked.results) {
          if (r.verdict === "unanswered") continue;
          const item = items.find(i => i.n === r.n)!;
          const prev = (await ctx.repo.getObjectiveRecord(user.id, r.objective)) ?? emptyRecord(r.objective);
          const kind = review ? (item.retry ? "practice" : "review") : "verify";
          await ctx.repo.saveObjectiveRecord(user.id, updateMastery(prev, { kind, verdict: r.verdict, hintsUsed: 0,
            unexplained: false, misconception: r.misconceptionId, at: now }));
          await ctx.repo.recordAttempt({ user_id: user.id, session_id: null, objective_id: r.objective, template_id: item.templateId,
            seed: item.seed, kind, verdict: r.verdict, misconception: r.misconceptionId, hints_used: 0, unexplained: false });
        }
        return json(200, results);
      }
      case "GET /exam/history":
        return json(200, { exams: await ctx.db.rpc("list_mock_exams", { p_user: user.id }) });
      case "GET /exam/result": {
        const id = url.searchParams.get("id") ?? "";
        if (!UUID_RE.test(id)) return json(400, { error: "invalid_exam" });
        const exam = await ctx.db.rpc<any>("get_mock_exam", { p_user: user.id, p_id: id });
        if (!exam?.submitted_at) return json(404, { error: "not_found" });
        return json(200, { title: exam.title, submitted_at: exam.submitted_at, ...exam.results });
      }

      // Course materials: text by page, private to the learner.
      case "GET /materials":
        return json(200, { materials: await ctx.db.rpc("list_materials", { p_user: user.id }) });
      case "POST /materials": {
        const b = await readJson(req);
        const pages = b?.pages;
        if (typeof b?.title !== "string" || !b.title.trim() || b.title.length > 200 || typeof b.kind !== "string" || b.kind.length > 20 ||
            !Array.isArray(pages) || pages.length < 1 || pages.length > 2000 ||
            !pages.every((p: any) => Number.isInteger(p?.page) && p.page >= 1 && p.page <= 2000 && typeof p.text === "string")) {
          return json(400, { error: "invalid_material" });
        }
        const chars = pages.reduce((n: number, p: any) => n + p.text.length, 0);
        if (chars > MAX_MATERIAL_CHARS) return json(413, { error: "material_too_large", maxChars: MAX_MATERIAL_CHARS });
        const chunks = chunkPages(pages as { page: number; text: string }[]);
        if (!chunks.length) return json(400, { error: "material_empty" });
        const ent = await ctx.repo.resolveEntitlement(user.id);
        const id = await ctx.db.rpc("add_material", { p_user: user.id, p_title: b.title, p_kind: b.kind,
          p_pages: Math.max(...pages.map((p: any) => p.page)), p_chars: chars, p_chunks: chunks, p_max: ent.plan_id === "free" ? 3 : 30 });
        return json(200, { id, passages: chunks.length });
      }
      case "DELETE /materials": {
        const id = url.searchParams.get("id") ?? "";
        if (!UUID_RE.test(id)) return json(400, { error: "invalid_material" });
        return (await ctx.db.rpc<boolean>("delete_material", { p_user: user.id, p_id: id })) ? json(200, { ok: true }) : json(404, { error: "not_found" });
      }
    }
  } catch (err) {
    const r = dbErrorResponse(err);
    if (r) return r;
    throw err;
  }
  return json(404, { error: "not_found" });
}
