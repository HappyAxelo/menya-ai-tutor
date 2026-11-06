// Search the chosen services in parallel within a time budget, then merge, rank and trim. A service
// that is slow, down, rate-limited or switched off is skipped; the tutor carries on with what came
// back, or with nothing and says so. Outside services get search words only.
import { CONNECTORS, ConnectorError, europePmcParagraphs, unpaywallLookup, type ConnectorKeys, type Http, type Paper } from "./connectors.ts";
import type { ResearchDecision } from "./select.ts";
import type { ParsedQuery } from "./query.ts";

export type CallStatus = "ok" | "empty" | "cached" | "error" | "timeout" | "rate_limited" | "skipped";
export interface ResearchCall { connector: string; status: CallStatus; latency_ms: number; results: number; http_status: number | null }

export interface ConnectorSetting { id: string; enabled: boolean; priority: number; timeout_ms: number; rate_per_min: number }
export interface ResearchConfig {
  connectors: ConnectorSetting[];
  timeout_ms: number;        // whole search, ordinary question
  deep_timeout_ms: number;   // whole search, a review or an explicit request
  cache_hours: number;
}
export const DEFAULT_RESEARCH_CONFIG: ResearchConfig = {
  connectors: Object.keys(CONNECTORS).map((id, i) => ({ id, enabled: id !== "core", priority: i, timeout_ms: 5000, rate_per_min: 30 })),
  timeout_ms: 7000, deep_timeout_ms: 12000, cache_hours: 168,
};

export interface ResearchStore {
  researchConfig(): Promise<ResearchConfig>;
  researchCacheGet(key: string): Promise<Paper[] | null>;
  researchCachePut(key: string, connector: string, papers: Paper[], hours: number): Promise<void>;
  researchRateAllow(connector: string, perMinute: number): Promise<boolean>;
}
export interface ResearchDeps {
  keys: ConnectorKeys;
  fetch?: typeof fetch;   // injected in tests
  now?: () => number;
}

export interface ResearchResult {
  papers: Paper[];
  calls: ResearchCall[];
  durationMs: number;
  degraded: boolean;      // at least one chosen service couldn't answer
}

// A service that just said "too many requests" is left alone for a minute. Per running instance.
const cooldownUntil = new Map<string, number>();
const COOLDOWN_MS = 60_000;
export function resetCooldowns() { cooldownUntil.clear(); }

async function sha256(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d), b => b.toString(16).padStart(2, "0")).join("");
}

function timedHttp(deps: ResearchDeps, deadline: () => number): Http {
  const doFetch = deps.fetch ?? fetch;
  return async (url, init) => {
    const left = deadline();
    if (left <= 0) throw new DOMException("deadline", "TimeoutError");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), left);
    try {
      const res = await doFetch(url, { headers: { "User-Agent": `Menya/1.0 (https://menyaneza.com${deps.keys.contactEmail ? `; mailto:${deps.keys.contactEmail}` : ""})`, ...(init?.headers ?? {}) }, signal: controller.signal });
      return { status: res.status, text: await res.text() };
    } finally { clearTimeout(timer); }
  };
}

export interface CallOptions { limit: number; recent: boolean; page?: number; fromYear?: number | null; toYear?: number | null; bool?: ParsedQuery | null }

// One service: rate limit → cache → request with one retry on a passing failure. Never throws.
export async function callConnector(id: string, query: string, opts: CallOptions, setting: ConnectorSetting, store: ResearchStore, deps: ResearchDeps, cacheHours: number, overall: number): Promise<{ papers: Paper[]; call: ResearchCall }> {
  const now = deps.now ?? Date.now;
  const started = now();
  const done = (status: CallStatus, papers: Paper[] = [], http_status: number | null = null) =>
    ({ papers, call: { connector: id, status, latency_ms: now() - started, results: papers.length, http_status } });
  const connector = CONNECTORS[id];
  if (!connector || (connector.needs && !deps.keys[connector.needs])) return done("skipped");
  const shape = `${opts.recent ? "recent" : "any"}|${opts.limit}|${opts.page ?? 1}|${opts.fromYear ?? ""}-${opts.toYear ?? ""}|${opts.bool?.boolean ? JSON.stringify([opts.bool.groups, opts.bool.not]) : ""}`;
  const key = await sha256(`${id}|${shape}|${query.toLowerCase()}`);
  try {
    const hit = await store.researchCacheGet(key);
    if (hit) return done("cached", hit);
  } catch { /* the cache is only an optimisation */ }
  if ((cooldownUntil.get(id) ?? 0) > now()) return done("rate_limited");
  try { if (!(await store.researchRateAllow(id, setting.rate_per_min))) return done("rate_limited"); } catch { /* carry on */ }

  const until = Math.min(started + setting.timeout_ms, overall);
  const http = timedHttp(deps, () => until - now());
  for (let attempt = 0; ; attempt++) {
    try {
      const papers = await connector.search(query, { ...opts, keys: deps.keys, http });
      if (papers.length) store.researchCachePut(key, id, papers, cacheHours).catch(() => {});
      return done(papers.length ? "ok" : "empty", papers, 200);
    } catch (err) {
      if (err instanceof ConnectorError && err.kind === "rate_limited") {
        cooldownUntil.set(id, now() + COOLDOWN_MS);
        return done("rate_limited", [], err.status ?? 429);
      }
      const timedOut = until - now() <= 0 || (err as Error)?.name === "AbortError" || (err as Error)?.name === "TimeoutError";
      if (timedOut) return done("timeout");
      // One retry for a server error or dropped connection, if there's time for it. A bad response won't improve.
      const passing = !(err instanceof ConnectorError) || (err.kind === "http" && (err.status ?? 0) >= 500);
      if (attempt === 0 && passing && until - now() > 1500) continue;
      return done("error", [], err instanceof ConnectorError ? err.status ?? null : null);
    }
  }
}

const normTitle = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

// Same paper from two services: one record, keeping the fuller fields. A published version beats a preprint.
export function dedupe(papers: Paper[]): Paper[] {
  const byKey = new Map<string, Paper>();
  for (const p of papers) {
    const titleKey = `t:${normTitle(p.title)}`;
    const existing = (p.doi ? byKey.get(`d:${p.doi}`) : null) ?? byKey.get(titleKey);
    if (!existing) {
      if (p.doi) byKey.set(`d:${p.doi}`, p);
      byKey.set(titleKey, p);
      continue;
    }
    const preferNew = existing.kind === "preprint" && p.kind !== "preprint";
    const merged: Paper = { ...existing,
      kind: preferNew ? p.kind : existing.kind, venue: preferNew ? p.venue ?? existing.venue : existing.venue ?? p.venue,
      url: preferNew ? p.url : existing.url, year: preferNew ? p.year ?? existing.year : existing.year ?? p.year,
      doi: existing.doi ?? p.doi, abstract: (p.abstract?.length ?? 0) > (existing.abstract?.length ?? 0) ? p.abstract : existing.abstract,
      authors: existing.authors.length ? existing.authors : p.authors, openAccessUrl: existing.openAccessUrl ?? p.openAccessUrl,
      license: existing.license ?? p.license, pmcid: existing.pmcid ?? p.pmcid, doajListed: existing.doajListed || p.doajListed,
      ids: { ...(p.ids ?? {}), ...(existing.ids ?? {}) }, foundIn: [...new Set([...(existing.foundIn ?? [existing.connector]), ...(p.foundIn ?? [p.connector])])],
      citedBy: Math.max(existing.citedBy ?? -1, p.citedBy ?? -1) < 0 ? null : Math.max(existing.citedBy ?? 0, p.citedBy ?? 0) };
    Object.assign(existing, merged);
    if (existing.doi) byKey.set(`d:${existing.doi}`, existing);
    byKey.set(titleKey, existing);
  }
  return [...new Set(byKey.values())];
}

const termsOf = (query: string) => [...new Set(query.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [])];

// Relevance first (the words of the question in the title and abstract), then usable text, type, age and citations.
export function rank(papers: Paper[], query: string, recent: boolean, thisYear = new Date().getFullYear()): Paper[] {
  const terms = termsOf(query);
  const scored = papers.map(p => {
    const title = normTitle(p.title), abstract = (p.abstract ?? "").toLowerCase();
    const inTitle = terms.filter(t => title.includes(t)).length, inAbstract = terms.filter(t => abstract.includes(t)).length;
    const overlap = terms.length ? (inTitle * 2 + inAbstract) / (terms.length * 3) : 0;
    const age = p.year ? Math.max(0, thisYear - p.year) : 15;
    const score = overlap * 10 + (p.abstract ? 2 : 0) + (p.kind === "review" ? 1 : 0) + (p.kind === "preprint" ? -0.5 : 0)
      + (recent ? Math.max(0, 3 - age * 0.5) : Math.max(0, 1 - age * 0.05)) + Math.min(1.5, Math.log10((p.citedBy ?? 0) + 1) * 0.5);
    return { p, overlap, score };
  });
  // Papers that barely touch the question are left out, however often they're cited.
  return scored.filter(s => s.overlap >= 0.34).sort((a, b) => b.score - a.score).map(s => s.p);
}

// The paragraphs most about the question, kept short: enough to teach from, never the paper.
export function bestExcerpt(paragraphs: string[], query: string, maxChars = 900): string | null {
  const terms = termsOf(query);
  const scored = paragraphs.map(p => ({ p, n: terms.filter(t => p.toLowerCase().includes(t)).length })).filter(x => x.n >= Math.min(2, terms.length));
  scored.sort((a, b) => b.n - a.n);
  const out: string[] = [];
  let used = 0;
  for (const { p } of scored.slice(0, 2)) {
    const piece = p.slice(0, maxChars - used);
    if (piece.length < 80) break;
    out.push(piece); used += piece.length;
  }
  return out.length ? out.join(" … ") : null;
}

const OPEN_LICENSE = /^cc[- ]?(by|0)/i;

export async function runResearch(query: string, decision: ResearchDecision, store: ResearchStore, deps: ResearchDeps): Promise<ResearchResult> {
  const now = deps.now ?? Date.now;
  const started = now();
  const config = await store.researchConfig().catch(() => DEFAULT_RESEARCH_CONFIG);
  const deep = decision.tier === "deep";
  const overall = started + (deep ? config.deep_timeout_ms : config.timeout_ms);
  const settings = new Map(config.connectors.map(c => [c.id, c]));
  // Of the services that suit this subject: switched on and usable, in the administrator's order. One that
  // has just refused us gives its place to the next, so a limit elsewhere doesn't cost the student a source.
  const usable = decision.connectors.filter(id => settings.get(id)?.enabled && (!CONNECTORS[id]?.needs || deps.keys[CONNECTORS[id].needs!]))
    .sort((a, b) => settings.get(a)!.priority - settings.get(b)!.priority);
  const ready = usable.filter(id => (cooldownUntil.get(id) ?? 0) <= now());
  const chosen = (ready.length ? ready : usable).slice(0, decision.count ?? usable.length);
  const limit = deep ? 8 : 5;

  const outcomes = await Promise.all(chosen.map(id => callConnector(id, query, { limit, recent: decision.recent }, settings.get(id)!, store, deps, config.cache_hours, overall)));
  const calls = outcomes.map(o => o.call);
  let papers = rank(dedupe(outcomes.flatMap(o => o.papers)), query, decision.recent).slice(0, deep ? 8 : 5);

  // On a review or an explicit request, with time left: short excerpts of a truly open paper, and legal open copies.
  if (deep && papers.length) {
    const left = () => overall - now();
    const http = timedHttp(deps, left);
    const open = papers.filter(p => p.pmcid && OPEN_LICENSE.test(p.license ?? "")).slice(0, 2);
    await Promise.all(open.map(async p => {
      const t0 = now();
      try {
        p.excerpt = bestExcerpt(await europePmcParagraphs(p.pmcid!, { http }), query);
        calls.push({ connector: "europe_pmc_fulltext", status: p.excerpt ? "ok" : "empty", latency_ms: now() - t0, results: p.excerpt ? 1 : 0, http_status: 200 });
      } catch { calls.push({ connector: "europe_pmc_fulltext", status: "error", latency_ms: now() - t0, results: 0, http_status: null }); }
    }));
    if (settings.get("unpaywall")?.enabled !== false && deps.keys.contactEmail && left() > 1000) {
      await Promise.all(papers.filter(p => p.doi && !p.openAccessUrl).slice(0, 4).map(async p => {
        const t0 = now();
        try {
          const found = await unpaywallLookup(p.doi!, { keys: deps.keys, http });
          p.openAccessUrl = found.url; p.license = p.license ?? found.license;
          calls.push({ connector: "unpaywall", status: found.url ? "ok" : "empty", latency_ms: now() - t0, results: found.url ? 1 : 0, http_status: 200 });
        } catch { calls.push({ connector: "unpaywall", status: "error", latency_ms: now() - t0, results: 0, http_status: null }); }
      }));
    }
  }

  return { papers, calls, durationMs: now() - started, degraded: calls.some(c => ["error", "timeout", "rate_limited"].includes(c.status)) };
}
