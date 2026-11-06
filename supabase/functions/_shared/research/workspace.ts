// Menya Research: the routes behind the Research page. Search, claims, evidence assessment one small batch at a
// time (the browser asks for the next batch, so no request runs long), synthesis, the workspace and exports.
// Every row is checked against the signed-in user in the database functions; plan limits come from the plan.
import { CONNECTORS, ConnectorError, europePmcParagraphs, type Paper } from "./connectors.ts";
import { bestExcerpt, callConnector, dedupe, rank, DEFAULT_RESEARCH_CONFIG, type ResearchCall, type ResearchDeps, type ResearchStore } from "./pipeline.ts";
import { decideResearch, keywordsFrom, scrubPersonal } from "./select.ts";
import { booleanString, matchesQuery, parseQuery } from "./query.ts";
import { checkCitations, toPublicSource } from "./citations.ts";
import { ASSESS_SYSTEM, assessPrompt, assessSchema, CATEGORIES, CLAIMS_SCHEMA, CLAIMS_SYSTEM, evidenceMeter, noTextAssessment, paperText,
  STRENGTH_NOTE, SYNTHESIS_SCHEMA, SYNTHESIS_SYSTEM, synthesisPrompt, validateAssessments, validateClaims, validateSynthesis, type Assessment } from "./evidence.ts";
import { formatReference, STYLES, toBibtex, toCsv, toRis, type Style } from "./formats.ts";
import { planRoute } from "../router.ts";
import { estimateCostUsd, ProviderError, type ModelProvider } from "../providers.ts";
import { polishReply } from "../policy.ts";
import type { Repo } from "../repo.ts";

export interface WorkspaceCtx {
  repo: Repo;
  db: { rpc<T = any>(fn: string, args: Record<string, unknown>): Promise<T> };
  providers: Record<string, ModelProvider>;
  research?: ResearchDeps;
  log(event: Record<string, unknown>): void;
}
export interface WsResponse { status: number; body?: unknown; text?: string; headers?: Record<string, string> }
const ok = (body: unknown): WsResponse => ({ status: 200, body });
const bad = (status: number, error: string, message?: string, extra: Record<string, unknown> = {}): WsResponse => ({ status, body: { error, ...(message ? { message } : {}), ...extra } });

const PER_SOURCE = 15;          // results asked of each service per page
const SEARCH_BUDGET_MS = 20_000;
const BATCH = 3;                // papers per model call

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const normTitle = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
export const paperKey = (p: Paper) => (p.doi ? `doi:${p.doi}` : `t:${normTitle(p.title).slice(0, 300)}`);
const thisYear = () => new Date().getFullYear();

async function body(req: Request): Promise<Record<string, any>> {
  try { const b = await req.json(); return b && typeof b === "object" ? b : {}; } catch { return {}; }
}

// ---------- The model, through the same route the tutor uses ----------
export async function callModel(ctx: WorkspaceCtx, system: string, user: string, schema: Record<string, unknown>, maxOut: number) {
  const configs = await ctx.repo.getModelConfigs();
  const route = planRoute({ policy: "free", difficulty: "standard", premiumRemaining: 0, configs, availableProviders: new Set(Object.keys(ctx.providers)) });
  if (!route.length) throw new ProviderError("unavailable", "none");
  let last: unknown = null;
  for (const c of route) {
    const started = Date.now();
    try {
      const res = await ctx.providers[c.config.provider].chat({ ...c.config, max_output_tokens: Math.max(c.config.max_output_tokens, maxOut), timeout_ms: Math.min(c.config.timeout_ms, 70_000) },
        { system, messages: [{ role: "user", content: user }], schema });
      let json: unknown = null;
      try { json = JSON.parse(res.text.trim().replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "")); } catch { last = new ProviderError("bad_request", c.config.provider); continue; }
      return { json, usage: { in: res.inputTokens ?? 0, out: res.outputTokens ?? 0, cost: estimateCostUsd(c.config, res) ?? 0, model: c.config.model, ms: Date.now() - started } };
    } catch (err) { last = err; if (!(err instanceof ProviderError)) throw err; }
  }
  throw last;
}
function modelError(err: unknown): WsResponse {
  if (err instanceof ProviderError && err.kind === "rate_limited") {
    const wait = Math.min(Math.max(Math.ceil((err.retryAfterMs ?? 30_000) / 1000), 5), 600);
    return bad(503, "model_busy", `The AI is busy. Trying again in about ${wait} seconds continues where it stopped.`, { retry_after_seconds: wait });
  }
  return bad(503, "model_unavailable", "The AI could not be reached. Nothing was lost; try again shortly.");
}
function dbError(err: unknown): WsResponse | null {
  const code = (err as any)?.code, msg = String((err as any)?.message ?? "");
  if (code === "54000") return bad(429, msg, msg === "research_search_limit" ? "You've used this month's research searches on your plan." : "You've used this month's syntheses on your plan.");
  if (code === "42501") return bad(404, "not_found");
  if (code === "22023") return bad(400, msg);
  return null;
}

// ---------- Searching ----------
interface Filters { fromYear: number | null; toYear: number | null }
function readFilters(f: any): Filters | string {
  const y = (v: unknown) => (v == null || v === "" ? null : Number(v));
  const fromYear = y(f?.fromYear), toYear = y(f?.toYear);
  for (const v of [fromYear, toYear]) if (v != null && (!Number.isInteger(v) || v < 1900 || v > thisYear() + 1)) return "invalid_year";
  if (fromYear != null && toYear != null && fromYear > toYear) return "invalid_year";
  return { fromYear, toYear };
}

async function searchPage(ctx: WorkspaceCtx, question: string, filters: Filters, page: number, room: number, previous: any) {
  const store: ResearchStore = ctx.repo;
  const config = await store.researchConfig().catch(() => DEFAULT_RESEARCH_CONFIG);
  const parsed = parseQuery(scrubPersonal(question));
  const words = parsed.boolean ? parsed.keywords : keywordsFrom(question, 12);
  const decision = decideResearch(question, { explicit: true });
  const settings = new Map(config.connectors.map(c => [c.id, c]));
  const usable = decision.connectors.filter(id => settings.get(id)?.enabled && (!CONNECTORS[id]?.needs || ctx.research!.keys[CONNECTORS[id].needs!]))
    .sort((a, b) => settings.get(a)!.priority - settings.get(b)!.priority);
  const started = Date.now(), overall = started + SEARCH_BUDGET_MS;
  const outcomes = await Promise.all(usable.map(id => callConnector(id, words, { limit: PER_SOURCE, recent: false, page, fromYear: filters.fromYear, toYear: filters.toYear,
    bool: parsed.boolean ? parsed : null }, { ...settings.get(id)!, timeout_ms: Math.max(settings.get(id)!.timeout_ms, 9000) }, store, ctx.research!, config.cache_hours, overall)));
  const calls: ResearchCall[] = outcomes.map(o => o.call);
  const retrieved = outcomes.reduce((s, o) => s + o.papers.length, 0);
  for (const o of outcomes) for (const p of o.papers) p.foundIn = p.foundIn ?? [p.connector];
  const unique = dedupe(outcomes.flatMap(o => o.papers));
  const excluded = { outside_years: 0, query_operators: 0, low_relevance: 0, over_limit: 0 };
  const inYears = unique.filter(p => {
    const out = (filters.fromYear && p.year && p.year < filters.fromYear) || (filters.toYear && p.year && p.year > filters.toYear);
    if (out) excluded.outside_years++;
    return !out;
  });
  const matching = inYears.filter(p => { const m = matchesQuery(parsed, p.title, p.abstract); if (!m) excluded.query_operators++; return m; });
  const ranked = rank(matching, words, false);
  excluded.low_relevance = matching.length - ranked.length;
  const kept = ranked.slice(0, Math.max(0, room));
  excluded.over_limit = ranked.length - kept.length;
  const pageInfo = { page, date: new Date().toISOString(), retrieved, unique: unique.length, kept: kept.length, excluded, ms: Date.now() - started,
    sources: calls.map(c => ({ id: c.connector, name: CONNECTORS[c.connector]?.name ?? c.connector, status: c.status, results: c.results, ms: c.latency_ms })) };
  const pages = [...(previous?.pages ?? []), pageInfo];
  const notices: string[] = [];
  const failed = calls.filter(c => ["error", "timeout", "rate_limited"].includes(c.status)).map(c => CONNECTORS[c.connector]?.name ?? c.connector);
  if (failed.length) notices.push(`Not every database answered: ${[...new Set(failed)].join(", ")}. Results may be incomplete.`);
  if (usable.includes("europe_pmc") && page > 1) notices.push("Europe PMC returns its first page only here.");
  if (usable.includes("arxiv") && (filters.fromYear || filters.toYear)) notices.push("arXiv has no year filter: years were checked after retrieval.");
  if (parsed.boolean) notices.push("Crossref and Semantic Scholar don't read AND, OR and NOT: they received the positive terms, and their results were checked against your operators.");
  notices.push(`This is not an exhaustive search: each database was asked for up to ${PER_SOURCE} results per page, and only titles and abstracts were searched.`);
  const strategy = {
    question, query: parsed.boolean ? booleanString(parsed) : words, boolean: parsed.boolean, subject: decision.subject, filters,
    databases: usable.map(id => CONNECTORS[id]?.name ?? id), skipped: Object.keys(CONNECTORS).filter(id => !usable.includes(id)).map(id => CONNECTORS[id].name),
    pages, notices: [...new Set([...(previous?.notices ?? []).filter((n: string) => !n.startsWith("Not every database") && !n.startsWith("This is not")), ...notices])],
  };
  return { kept, strategy, ms: Date.now() - started, subject: decision.subject, query: strategy.query, isBoolean: parsed.boolean };
}

const toRow = (p: Paper) => ({ key: paperKey(p), doi: p.doi, title: p.title, data: p, found_in: p.foundIn ?? [p.connector] });

// Counts behind the papers, for the browser: abstracts, full text, meter per claim, references in four styles.
function decorate(view: any) {
  if (!view) return view;
  const papers = (view.papers ?? []).map((x: any) => ({ ...x, refs: Object.fromEntries(STYLES.map(s => [s, formatReference(x.data, s)])), public: toPublicSource(x.data) }));
  const meters = Object.fromEntries((view.claims ?? []).map((c: any) => [c.id, evidenceMeter((view.assessments ?? []).filter((a: any) => a.claim_id === c.id))]));
  const counts = { total: papers.length, abstracts: papers.filter((p: any) => p.data.abstract).length, no_abstract: papers.filter((p: any) => !p.data.abstract).length,
    open_access: papers.filter((p: any) => p.data.openAccessUrl).length, full_text_read: (view.assessments ?? []).filter((a: any) => a.evidence_level === "full_text_excerpt").length };
  return { ...view, papers, meters, counts, strength_note: STRENGTH_NOTE };
}

// ---------- Routes ----------
export async function researchWorkspace(path: string, req: Request, ctx: WorkspaceCtx, userId: string, url: URL): Promise<WsResponse> {
  const m = req.method;
  try {
    if (path === "/research/workspace" && m === "GET") return ok(await ctx.db.rpc("rs_workspace", { p_user: userId }));

    if (path === "/research/search" && m === "POST") {
      if (!ctx.research) return bad(503, "research_unavailable");
      const b = await body(req);
      const question = typeof b.question === "string" ? b.question.trim() : "";
      if (question.length < 3 || question.length > 1000) return bad(400, "invalid_question");
      const filters = readFilters(b.filters);
      if (typeof filters === "string") return bad(400, filters);
      if (b.projectId != null && (typeof b.projectId !== "string" || !UUID.test(b.projectId))) return bad(400, "invalid_project");
      const limits = await ctx.db.rpc<any>("rs_limits", { p_user: userId });
      const room = Number(limits?.limits?.papers_per_search ?? 0);
      if (room <= 0) return bad(429, "research_not_included", "Research searches aren't included in this plan.");
      const parsed = parseQuery(scrubPersonal(question));
      if (!(parsed.boolean ? parsed.keywords : keywordsFrom(question, 12))) return bad(400, "no_search_words", "Add the words to search for.");
      const id = await ctx.db.rpc<string>("rs_create_search", { p_user: userId, p: { question, query: parsed.boolean ? booleanString(parsed) : keywordsFrom(question, 12),
        is_boolean: parsed.boolean, filters, subject: decideResearch(question, { explicit: true }).subject, project_id: b.projectId ?? null } });
      const r = await searchPage(ctx, question, filters, 1, room, null);
      await ctx.db.rpc("rs_save_results", { p_user: userId, p_search: id, p_papers: r.kept.map(toRow), p_strategy: r.strategy, p_page: 1, p_ms: r.ms });
      ctx.repo.recordResearchCalls?.(r.strategy.pages[0].sources.map((s: any) => ({ connector: s.id, status: s.status, latency_ms: s.ms, results: s.results, http_status: null }))).catch(() => {});
      ctx.log({ event: "research_search", subject: r.subject, kept: r.kept.length, ms: r.ms });
      return ok(decorate(await ctx.db.rpc("rs_get_search", { p_user: userId, p_search: id })));
    }

    const sm = /^\/research\/search\/([0-9a-f-]{36})(\/[a-z-]+(?:\/[a-z]+)?)?$/i.exec(path);
    if (sm) {
      const id = sm[1], tail = sm[2] ?? "";
      if (!UUID.test(id)) return bad(404, "not_found");
      const view = async () => decorate(await ctx.db.rpc("rs_get_search", { p_user: userId, p_search: id }));
      if (tail === "" && m === "GET") { const v = await view(); return v ? ok(v) : bad(404, "not_found"); }

      if (tail === "/more" && m === "POST") {
        if (!ctx.research) return bad(503, "research_unavailable");
        const cur = await ctx.db.rpc<any>("rs_get_search", { p_user: userId, p_search: id });
        if (!cur) return bad(404, "not_found");
        const limits = await ctx.db.rpc<any>("rs_limits", { p_user: userId });
        const room = Number(limits?.limits?.papers_per_search ?? 0) - cur.papers.length;
        if (room <= 0) return bad(429, "research_papers_limit", "This search holds as many papers as your plan allows.");
        const page = Number(cur.search.pages ?? 1) + 1;
        const r = await searchPage(ctx, cur.search.question, cur.search.filters, page, room, cur.search.strategy);
        const known = new Set(cur.papers.map((p: any) => p.key));
        await ctx.db.rpc("rs_save_results", { p_user: userId, p_search: id, p_papers: r.kept.map(toRow).filter(x => !known.has(x.key)), p_strategy: r.strategy, p_page: page, p_ms: r.ms });
        return ok(await view());
      }

      if (tail === "/claims" && m === "POST") {
        const b = await body(req);
        const claims = Array.isArray(b.claims) ? b.claims.filter((c: unknown) => typeof c === "string").map((c: string) => c.trim()).filter((c: string) => c.length >= 3 && c.length <= 500) : [];
        if (!claims.length) return bad(400, "invalid_claims");
        await ctx.db.rpc("rs_add_claims", { p_user: userId, p_search: id, p_texts: claims });
        return ok(await view());
      }

      if (tail === "/claims/suggest" && m === "POST") {
        const cur = await ctx.db.rpc<any>("rs_get_search", { p_user: userId, p_search: id });
        if (!cur) return bad(404, "not_found");
        try {
          const r = await callModel(ctx, CLAIMS_SYSTEM, `Research question: ${cur.search.question}`, CLAIMS_SCHEMA, 1500);
          return ok({ claims: validateClaims(r.json).map(c => polishReply(c)) });
        } catch (err) { return modelError(err); }
      }

      if (tail === "/assess" && m === "POST") {
        const b = await body(req);
        if (typeof b.claimId !== "string" || !UUID.test(b.claimId)) return bad(400, "invalid_claim");
        const t = await ctx.db.rpc<any>("rs_to_assess", { p_user: userId, p_search: id, p_claim: b.claimId, p_n: BATCH * 3 });
        const left = Number(t.cap) - Number(t.used);
        const candidates: { key: string; data: Paper }[] = t.papers;
        if (!candidates.length) return ok({ done: true, reason: "all_assessed", ...(await view()) });
        const noText = candidates.filter(c => !c.data.abstract);
        const withText = candidates.filter(c => c.data.abstract);
        // Papers with no abstract are set aside without using any of the allowance.
        if (noText.length) await ctx.db.rpc("rs_save_assessments", { p_user: userId, p_search: id, p_claim: b.claimId, p_rows: noText.map(c => noTextAssessment(c.key)), p_usage: {} });
        if (!withText.length) return ok({ done: Number(t.remaining_papers) - noText.length <= 0, ...(await view()) });
        if (left <= 0) return bad(429, "research_assess_limit", "This search has used the paper assessments your plan allows.", { done: true });
        const batch = withText.slice(0, Math.min(BATCH, left));
        if (t.full_text && ctx.research) {
          // Short excerpts of truly open papers; the rest is judged on its abstract, and says so.
          await Promise.all(batch.map(async c => {
            if (!c.data.pmcid || !/^cc[- ]?(by|0)/i.test(c.data.license ?? "")) return;
            try {
              const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 8000);
              const doFetch = ctx.research!.fetch ?? fetch;
              const paras = await europePmcParagraphs(c.data.pmcid, { http: async u => { const r = await doFetch(u, { signal: controller.signal }); return { status: r.status, text: await r.text() }; } });
              clearTimeout(timer);
              c.data.excerpt = bestExcerpt(paras, t.claim, 1500);
            } catch { /* abstract only */ }
          }));
        }
        const texts = batch.map((c, i) => paperText(c.key, `P${i + 1}`, c.data));
        let result;
        try { result = await callModel(ctx, ASSESS_SYSTEM, assessPrompt(t.claim, texts), assessSchema(texts.map(x => x.label)), 6000); }
        catch (err) { return modelError(err); }
        const { rows, problems } = validateAssessments(result.json, texts);
        if (problems.length) ctx.log({ event: "assessment_problems", count: problems.length });
        await ctx.db.rpc("rs_save_assessments", { p_user: userId, p_search: id, p_claim: b.claimId, p_rows: rows, p_usage: result.usage });
        const done = Number(t.remaining_papers) - noText.length - rows.length <= 0 || left - rows.length <= 0;
        return ok({ done, assessed: rows.length, skipped: batch.length - rows.length, ...(await view()) });
      }

      if (tail === "/synthesis" && m === "POST") {
        const cur = await ctx.db.rpc<any>("rs_get_search", { p_user: userId, p_search: id });
        if (!cur) return bad(404, "not_found");
        const limits = await ctx.db.rpc<any>("rs_limits", { p_user: userId });
        if (Number(limits.used.syntheses) >= Number(limits.limits.syntheses_per_month ?? 0)) return bad(429, "research_synthesis_limit", "You've used this month's syntheses on your plan.");
        const relevant: (Assessment & { claim_id: string })[] = cur.assessments.filter((a: any) => CATEGORIES.includes(a.category));
        if (relevant.length < 2) return bad(400, "not_enough_evidence", "Assess at least two relevant papers before writing a synthesis.");
        const keys = [...new Set(relevant.map(a => a.paper_key))];
        const byKey = new Map(cur.papers.map((p: any) => [p.key, p.data]));
        const papers = keys.map((k, i) => { const d: any = byKey.get(k); return { label: `P${i + 1}`, key: k, title: d.title, year: d.year, kind: d.kind === "preprint" ? "preprint" : d.kind.replace(/_/g, " ") }; });
        const last = cur.search.strategy?.pages?.at(-1);
        const coverage = `${(cur.search.strategy?.databases ?? []).join(", ")} searched on ${String(last?.date ?? "").slice(0, 10)}; ${cur.papers.length} papers kept, ${relevant.length} relevant assessments across ${cur.claims.length} claim(s); titles and abstracts${cur.assessments.some((a: any) => a.evidence_level === "full_text_excerpt") ? ", some open full-text excerpts" : " only"}.`;
        let result;
        try { result = await callModel(ctx, SYNTHESIS_SYSTEM, synthesisPrompt({ question: cur.search.question, claims: cur.claims, papers, assessments: relevant, coverage }), SYNTHESIS_SCHEMA, 8000); }
        catch (err) { return modelError(err); }
        const clean = (s: string) => checkCitations(polishReply(s), [], { researched: true }).message;
        const synthesis = validateSynthesis(result.json, new Set(papers.map(p => p.label)), clean);
        const content = { ...synthesis, refs: Object.fromEntries(papers.map(p => [p.label, p.key])), coverage, generated_at: new Date().toISOString() };
        await ctx.db.rpc("rs_save_synthesis", { p_user: userId, p_search: id, p_content: content, p_usage: result.usage });
        return ok(await view());
      }

      if (tail === "/project" && m === "POST") {
        const b = await body(req);
        if (b.projectId != null && (typeof b.projectId !== "string" || !UUID.test(b.projectId))) return bad(400, "invalid_project");
        await ctx.db.rpc("rs_search_project", { p_user: userId, p_search: id, p_project: b.projectId ?? null });
        return ok({ ok: true });
      }

      if (tail === "/export" && m === "GET") {
        const cur = await ctx.db.rpc<any>("rs_get_search", { p_user: userId, p_search: id });
        if (!cur) return bad(404, "not_found");
        const limits = await ctx.db.rpc<any>("rs_limits", { p_user: userId });
        if (!limits.limits.export) return bad(403, "export_not_included");
        const format = url.searchParams.get("format") ?? "ris";
        const style = (url.searchParams.get("style") ?? "apa") as Style;
        if (!["ris", "bib", "csv", "md"].includes(format) || !STYLES.includes(style)) return bad(400, "invalid_format");
        const scope = url.searchParams.get("scope") ?? "all";
        const assessedKeys = new Set(cur.assessments.filter((a: any) => CATEGORIES.includes(a.category)).map((a: any) => a.paper_key));
        const savedKeys = new Set(cur.saved.map((s: any) => s.paper_key));
        const rows = cur.papers.filter((p: any) => scope === "assessed" ? assessedKeys.has(p.key) : scope === "saved" ? savedKeys.has(p.key) : true);
        const papers: Paper[] = rows.map((p: any) => p.data);
        await ctx.db.rpc("rs_log_export", { p_user: userId, p_search: id, p_format: format });
        const name = `menya-research-${String(cur.search.created_at).slice(0, 10)}`;
        if (format === "ris") return { status: 200, text: toRis(papers), headers: { "Content-Type": "application/x-research-info-systems", "Content-Disposition": `attachment; filename=${name}.ris` } };
        if (format === "bib") return { status: 200, text: toBibtex(papers), headers: { "Content-Type": "application/x-bibtex; charset=utf-8", "Content-Disposition": `attachment; filename=${name}.bib` } };
        if (format === "csv") {
          const claimText = new Map(cur.claims.map((c: any, i: number) => [c.id, `claim_${i + 1}`]));
          const extra = (key: string) => Object.fromEntries(cur.assessments.filter((a: any) => a.paper_key === key).map((a: any) => [claimText.get(a.claim_id) as string, a.category]));
          return { status: 200, text: toCsv(rows.map((p: any) => ({ paper: p.data, extra: extra(p.key) }))), headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename=${name}.csv` } };
        }
        return { status: 200, text: markdownReport(decorate(cur), style), headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename=${name}.md` } };
      }
    }

    const cm = /^\/research\/claims\/([0-9a-f-]{36})$/i.exec(path);
    if (cm && m === "DELETE") {
      const done = await ctx.db.rpc<boolean>("rs_delete_claim", { p_user: userId, p_claim: cm[1] });
      return done ? ok({ ok: true }) : bad(404, "not_found");
    }

    if (path === "/research/projects" && m === "POST") {
      const b = await body(req);
      if (b.delete) { if (typeof b.id !== "string" || !UUID.test(b.id)) return bad(400, "invalid_project"); }
      else if (typeof b.title !== "string" || !b.title.trim() || b.title.length > 200 || (b.description != null && (typeof b.description !== "string" || b.description.length > 2000))) return bad(400, "invalid_project");
      const pid = await ctx.db.rpc("rs_project", { p_user: userId, p: { id: b.id ?? null, title: b.title ?? null, description: b.description ?? null, ...(b.delete ? { delete: true } : {}) } });
      return ok({ id: pid });
    }

    if (path === "/research/saved" && m === "POST") {
      const b = await body(req);
      if (b.delete) {
        if (!Number.isSafeInteger(b.id)) return bad(400, "invalid_saved");
      } else if (typeof b.paper_key !== "string" || b.paper_key.length > 400 || (b.note != null && (typeof b.note !== "string" || b.note.length > 5000))
        || (b.project_id != null && (typeof b.project_id !== "string" || !UUID.test(b.project_id)))) return bad(400, "invalid_saved");
      const sid = await ctx.db.rpc("rs_save_paper", { p_user: userId, p: b.delete ? { delete: true, id: b.id } : { paper_key: b.paper_key, project_id: b.project_id ?? null, ...(b.note != null ? { note: b.note } : {}) } });
      return ok({ id: sid });
    }
  } catch (err) {
    const r = dbError(err); if (r) return r;
    throw err;
  }
  return bad(404, "not_found");
}

// A report that keeps what was found apart from what the model wrote, with every reference real.
export function markdownReport(v: any, style: Style): string {
  const s = v.search, strat = s.strategy ?? {};
  const byKey = new Map(v.papers.map((p: any) => [p.key, p]));
  const lines: string[] = [`# Menya Research report`, ``, `**Question:** ${s.question}`, ``, `Searched ${String(strat.pages?.at(-1)?.date ?? s.created_at).slice(0, 10)} in ${(strat.databases ?? []).join(", ")}. Query: \`${s.query}\`.`, ``];
  lines.push(`## Evidence by claim`, ``, `Counts are of the papers retrieved and assessed in this search, not of all research, and not a probability that a claim is true. ${v.strength_note}`, ``);
  for (const c of v.claims) {
    const mt = v.meters[c.id];
    lines.push(`### ${c.text}`, ``, `Assessed ${mt.assessed}; relevant ${mt.relevant}; not relevant ${mt.excluded.not_relevant}; no text ${mt.excluded.no_text}.`, ``,
      `| Supports | Contradicts | Mixed | Insufficient |`, `| --- | --- | --- | --- |`,
      `| ${CATEGORIES.map(k => `${mt.counts[k]} of ${mt.relevant} (${mt.percent[k]}%)`).join(" | ")} |`, ``);
  }
  const syn = v.synthesis?.content;
  if (syn) {
    const cite = (refs: string[]) => (refs?.length ? ` [${refs.map((r: string) => r.slice(1)).join(", ")}]` : "");
    const sec = (title: string, items: any[]) => { if (items?.length) lines.push(`## ${title}`, ``, ...items.map(i => `- ${i.text}${cite(i.refs)}${i.possible_reasons?.length ? ` Possible reasons: ${i.possible_reasons.join("; ")}.` : ""}`), ``); };
    lines.push(`## Synthesis (written by AI from the assessments above; check the papers before relying on it)`, ``);
    sec("Summary", syn.executive_summary); sec("Where studies agree", syn.agreements); sec("Where studies disagree", syn.disagreements); sec("Limitations of the evidence", syn.limitations);
    if (syn.gaps?.length) lines.push(`## Possible research gaps`, ``, ...syn.gaps.map((g: any) => `- **${g.gap}** (${g.type}). Basis: ${g.basis}${cite(g.refs)}`), ``);
    if (syn.directions?.length) lines.push(`## Future research directions`, ``, ...syn.directions.map((d: any) => `- **${d.question}** Why: ${d.why} Established: ${d.established} Uncertain: ${d.uncertain} Method: ${d.method}${cite(d.refs)}`), ``);
    lines.push(`## References`, ``, ...Object.entries(syn.refs ?? {}).map(([label, key]) => `${String(label).slice(1)}. ${(byKey.get(key) as any)?.refs?.[style] ?? ""}`), ``);
  }
  lines.push(`## All retrieved papers`, ``, ...v.papers.map((p: any) => `- ${p.refs[style]}`), ``, `## Search strategy and limitations`, ``,
    ...(strat.pages ?? []).map((pg: any) => `- Page ${pg.page}, ${String(pg.date).slice(0, 10)}: ${pg.retrieved} retrieved, ${pg.unique} unique, ${pg.kept} kept. ${pg.sources.map((x: any) => `${x.name}: ${x.status} (${x.results})`).join("; ")}.`),
    ...(strat.notices ?? []).map((n: string) => `- ${n}`), ``);
  return lines.join("\n");
}
