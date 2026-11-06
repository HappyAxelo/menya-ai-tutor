// Menya Research: discovery, the evidence engine, synthesis, exports, the private workspace, limits and admin.
// Real database rules and the real API; outside services and the AI model are scripted (no network).
import { test, describe, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { freshDb, createUser, rpc, asUser } from "./db.ts";
import { pgRepo } from "./pgRepo.ts";
import { handleApi, DbError, type ApiContext, type AuthUser } from "../functions/_shared/api.ts";
import { arxivString, booleanString, matchesQuery, parseQuery } from "../functions/_shared/research/query.ts";
import { evidenceMeter, evidenceStrength, paperText, validateAssessments, validateSynthesis, verifyPassage } from "../functions/_shared/research/evidence.ts";
import { harvard, ieee, toBibtex, toCsv, toRis, vancouver } from "../functions/_shared/research/formats.ts";
import { resetCooldowns } from "../functions/_shared/research/pipeline.ts";
import { ProviderError, type ModelProvider } from "../functions/_shared/providers.ts";
import type { Paper } from "../functions/_shared/research/connectors.ts";

const paper = (over: Partial<Paper> = {}): Paper => ({ connector: "openalex", title: "AI tutoring and problem solving", authors: ["Uwase, Aline", "Eric Mugisha"], year: 2023,
  venue: "Computers & Education", doi: "10.1000/tutor.1", url: "https://doi.org/10.1000/tutor.1", kind: "journal_article", openAccessUrl: null, license: null, citedBy: 4,
  abstract: "In a randomised trial of 240 first-year students in Rwanda, students using an AI tutor solved more unseen problems independently than the control group. Effects faded after eight weeks.", ...over });

describe("queries", () => {
  test("a plain question becomes search words; operators and phrases make a boolean query", () => {
    assert.equal(parseQuery("Does AI-assisted learning improve independent problem-solving among university students?").boolean, false);
    const q = parseQuery('"drone-based larviciding" AND (malaria OR dengue) NOT review');
    assert.deepEqual(q.groups, [["drone-based larviciding"], ["malaria", "dengue"]]);
    assert.deepEqual(q.not, ["review"]);
    assert.equal(booleanString(q), '"drone-based larviciding" AND (malaria OR dengue) NOT review');
    assert.equal(arxivString(q), 'all:"drone-based larviciding" AND (all:malaria OR all:dengue) ANDNOT all:review');
  });
  test("the local check enforces NOT always, and AND/OR when there is an abstract to check", () => {
    const q = parseQuery("malaria AND drones NOT review");
    assert.equal(matchesQuery(q, "Drones for malaria", "Drones reduced malaria larvae."), true);
    assert.equal(matchesQuery(q, "A review of drones", "Drones and malaria."), false);
    assert.equal(matchesQuery(q, "Malaria in Kenya", "Bed nets reduced malaria."), false);
    assert.equal(matchesQuery(q, "Malaria in Kenya", null), true, "title only: not excluded for a missing term");
  });
});

describe("evidence rules", () => {
  const t = paperText("k1", "P1", paper());
  test("a quotation counts only if it is word for word in the paper, and says where", () => {
    assert.deepEqual(verifyPassage("students using an AI tutor solved more unseen problems independently than the control group", t), {
      text: "students using an AI tutor solved more unseen problems independently than the control group", location: "Abstract" });
    assert.equal(verifyPassage("students using an AI tutor solved far more problems", t), null);
    assert.equal(verifyPassage("AI tutoring", t), null, "too short to stand for a finding");
  });
  test("support without a verified quotation is counted as insufficient; numbers not in the text are dropped; abstract-only confidence is capped", () => {
    const { rows } = validateAssessments({ assessments: [{ paper: "P1", category: "supports", relevance: 0.9, confidence: "high", design: "rct", sample_size: 999,
      population: "first-year students", geographic_context: "Rwanda", findings: "Better independent problem solving.", passages: ["AI tutors are great for everyone"],
      limitations_reported: [], ai_concerns: [], rationale: "Positive effect." }] }, [t]);
    assert.equal(rows[0].category, "insufficient");
    assert.equal(rows[0].checks.downgraded, true);
    assert.equal(rows[0].sample_size, null);
    assert.match(rows[0].rationale, /could be found word for word/);
    const ok = validateAssessments({ assessments: [{ paper: "P1", category: "supports", relevance: 0.9, confidence: "high", design: "rct", sample_size: 240,
      population: null, geographic_context: "Rwanda", findings: "f", passages: ["solved more unseen problems independently than the control group"],
      limitations_reported: ["Effects faded after eight weeks"], ai_concerns: [], rationale: "r" }, { paper: "P7", category: "supports" }] }, [t]);
    assert.equal(ok.rows.length, 1, "an unknown paper label is ignored");
    assert.deepEqual([ok.rows[0].category, ok.rows[0].confidence, ok.rows[0].sample_size, ok.rows[0].strength], ["supports", "moderate", 240, "stronger"]);
    assert.equal(ok.problems.length, 1);
  });
  test("strength comes from design and size, separately from the model's confidence", () => {
    assert.equal(evidenceStrength("meta_analysis", null), "stronger");
    assert.equal(evidenceStrength("rct", 40), "moderate");
    assert.equal(evidenceStrength("cohort", 50), "limited");
    assert.equal(evidenceStrength("case_study", 3), "very_limited");
    assert.equal(evidenceStrength("unclear", null), "unclear");
  });
  test("the meter shows counts, excludes irrelevant and textless papers, and its percentages add up to 100", () => {
    const m = evidenceMeter([...Array(2)].map(() => ({ category: "supports" })).concat([{ category: "contradicts" }, { category: "mixed" }, { category: "not_relevant" }, { category: "no_text" }]));
    assert.deepEqual([m.assessed, m.relevant, m.excluded.not_relevant, m.excluded.no_text], [6, 4, 1, 1]);
    assert.deepEqual(m.counts, { supports: 2, contradicts: 1, mixed: 1, insufficient: 0 });
    assert.equal(Object.values(m.percent).reduce((a, b) => a + b, 0), 100);
    const thirds = evidenceMeter([{ category: "supports" }, { category: "contradicts" }, { category: "mixed" }]);
    assert.equal(Object.values(thirds.percent).reduce((a, b) => a + b, 0), 100);
    assert.deepEqual(evidenceMeter([]).percent, { supports: 0, contradicts: 0, mixed: 0, insufficient: 0 });
  });
  test("a synthesis keeps only real references; an agreement needs two papers; a gap needs its basis", () => {
    const s = validateSynthesis({ executive_summary: [{ text: "Most trials found gains (Smith et al., 2019).", refs: ["P1", "P9"] }, { text: "Uncited claim.", refs: [] }],
      agreements: [{ text: "Two trials agree.", refs: ["P1", "P2"] }, { text: "Only one.", refs: ["P1"] }], disagreements: [], limitations: [{ text: "Small samples.", refs: [] }],
      gaps: [{ gap: "No studies in rural schools", type: "geographic", basis: "", refs: [] }, { gap: "No long follow-up", type: "longitudinal", basis: "All 2 trials ran under 10 weeks.", refs: ["P1", "P2"] }],
      directions: [] }, new Set(["P1", "P2"]), s => s.replace(/\s*\(Smith et al\., 2019\)/, ""));
    assert.deepEqual(s.executive_summary, [{ text: "Most trials found gains.", refs: ["P1"] }]);
    assert.equal(s.agreements.length, 1);
    assert.equal(s.gaps.length, 1);
    assert.deepEqual([s.checks.refs_removed, s.checks.items_removed], [1, 3]);
  });
});

describe("reference styles and export files", () => {
  const p = paper({ authors: ["Uwase, Aline Marie", "Mugisha, Eric", "Habimana, Jean"] });
  test("four styles from the record", () => {
    assert.equal(ieee(p), 'A. M. Uwase, E. Mugisha, and J. Habimana, "AI tutoring and problem solving," Computers & Education, 2023. doi: 10.1000/tutor.1.');
    assert.equal(harvard(p), "Uwase, A.M., Mugisha, E. and Habimana, J. (2023) 'AI tutoring and problem solving', Computers & Education. Available at: https://doi.org/10.1000/tutor.1.");
    assert.equal(vancouver(p), "Uwase AM, Mugisha E, Habimana J. AI tutoring and problem solving. Computers & Education. 2023. doi:10.1000/tutor.1");
  });
  test("RIS, BibTeX and CSV carry the record and mark a preprint", () => {
    assert.match(toRis([p]), /TY {2}- JOUR\r\nAU {2}- Uwase, Aline Marie[\s\S]*DO {2}- 10\.1000\/tutor\.1[\s\S]*ER {2}- /);
    const bib = toBibtex([p, paper({ kind: "preprint", doi: null, url: "https://arxiv.org/abs/1", title: "Second" })]);
    assert.match(bib, /@article\{uwase2023,/);
    assert.match(bib, /@misc\{uwase2023b,[\s\S]*Preprint, not peer reviewed/);
    assert.match(bib, /Computers \\& Education/);
    const csv = toCsv([{ paper: p, extra: { claim_1: "supports" } }]);
    assert.match(csv.split("\r\n")[0], /claim_1$/);
    assert.match(csv, /"Uwase, Aline Marie; Mugisha, Eric; Habimana, Jean"/);
  });
});

// ---------- The whole flow through the API ----------
const W = (id: string, title: string, abstract: string | null, doi: string | null, year = 2023) => ({ id: `https://openalex.org/${id}`, doi: doi ? `https://doi.org/${doi}` : null, title,
  publication_year: year, type: "article", authorships: [{ author: { display_name: "Aline Uwase" } }], primary_location: { source: { display_name: "Computers & Education", type: "journal" } },
  cited_by_count: 3, abstract_inverted_index: abstract ? abstract.split(" ").reduce((ix: Record<string, number[]>, w, i) => ({ ...ix, [w]: [...(ix[w] ?? []), i] }), {}) : null });
const OPENALEX = { results: [
  W("W1", "AI tutoring and independent problem solving of university students", "In a randomised trial of 240 university students an AI tutor improved independent problem solving compared with usual teaching.", "10.1000/a1"),
  W("W2", "AI tutoring and independent problem solving: a null result", "Among 80 university students the AI tutor produced no difference in independent problem solving scores.", "10.1000/a2"),
  W("W3", "Independent problem solving with AI tutoring at university: a review", "This review of AI tutoring describes university problem solving tools.", "10.1000/a3", 2010),
  W("W4", "University AI tutoring for independent problem solving", null, "10.1000/a4"),
] };
const CROSSREF = { message: { items: [{ DOI: "10.1000/A1", title: ["AI tutoring and independent problem solving of university students"], type: "journal-article",
  issued: { "date-parts": [[2023]] }, "container-title": ["Computers & Education"], author: [{ family: "Uwase", given: "Aline" }] }] } };
const EPMC = { resultList: { result: [{ id: "9", source: "MED", doi: "10.1000/A1", title: "AI tutoring and independent problem solving of university students", pubYear: "2023",
  abstractText: "In a randomised trial of 240 university students an AI tutor improved independent problem solving compared with usual teaching.", journalInfo: { journal: { title: "J" } } }] } };

function fakeFetch() {
  const asked: string[] = [];
  const f = (async (url: string) => {
    asked.push(String(url));
    const u = String(url);
    const body = u.includes("openalex") ? OPENALEX : u.includes("crossref") ? CROSSREF : u.includes("europepmc") ? EPMC : u.includes("arxiv") ? null : {};
    return new Response(body === null ? "<feed/>" : JSON.stringify(body), { status: 200 });
  }) as unknown as typeof fetch;
  return { fetch: f, asked };
}

describe("Menya Research through the API", () => {
  let db: PGlite, ctx: ApiContext, A: string, B: string, admin: string;
  const sessions = new Map<string, AuthUser>();
  let mode: "ok" | "busy" = "ok";
  const prompts: string[] = [];
  const model: ModelProvider = { name: "groq",
    async chat(_c, req) {
      if (mode === "busy") throw new ProviderError("rate_limited", "groq", 429, 20_000);
      const user = String(req.messages.at(-1)?.content ?? "");
      prompts.push(user);
      let out: unknown;
      if (/SPLIT|Split a research question/.test(req.system)) out = { claims: ["AI tutoring improves independent problem solving.", "AI tutoring improves exam scores.", "x"] };
      else if (/literature synthesis/.test(req.system)) out = { executive_summary: [{ text: "Trials disagree on independent problem solving.", refs: ["P1", "P2", "P9"] }],
        agreements: [], disagreements: [{ text: "One trial found gains and one found none.", refs: ["P1", "P2"], possible_reasons: ["Sample sizes differ (240 vs 80)."] }],
        limitations: [{ text: "Abstracts only.", refs: [] }], gaps: [{ gap: "No studies outside universities", type: "population", basis: "All assessed papers studied university students.", refs: ["P1", "P2"] }],
        directions: [{ question: "Does it work in secondary schools?", why: "w", established: "e", uncertain: "u", method: "RCT", refs: ["P1"] }] };
      else {
        const labels = [...user.matchAll(/<<(P\d+)>>/g)].map(m => m[1]);
        out = { assessments: labels.map(l => {
          const block = user.slice(user.indexOf(`<<${l}>>`)).split("\n\n")[0];
          const sup = /improved independent/.test(block), none = /no difference/.test(block);
          return { paper: l, category: sup ? "supports" : none ? "contradicts" : "not_relevant", relevance: sup || none ? 0.9 : 0.2, confidence: "high", design: sup ? "rct" : "cross_sectional",
            sample_size: sup ? 240 : none ? 80 : null, population: "university students", geographic_context: null, findings: "f",
            passages: sup ? ["an AI tutor improved independent problem solving compared with usual teaching"] : none ? ["the AI tutor made a big difference"] : [],
            limitations_reported: [], ai_concerns: [], rationale: "r" };
        }) };
      }
      return { text: JSON.stringify(out), inputTokens: 100, outputTokens: 50, latencyMs: 5 };
    }, async health() { return { ok: true }; } };
  const call = async (token: string, method: string, path: string, body?: unknown) => {
    const res = await handleApi(new Request(`https://x/functions/v1/api${path}`, { method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }), ctx);
    const text = await res.text();
    let json: any = null; try { json = JSON.parse(text); } catch { /* a file */ }
    return { status: res.status, body: json, text, type: res.headers.get("content-type") };
  };
  const question = "Does AI tutoring improve independent problem solving among university students?";
  let searchId = "";
  before(async () => {
    db = await freshDb();
    A = await createUser(db, "a@test.local"); B = await createUser(db, "b@test.local"); admin = await createUser(db, "admin@test.local");
    await db.query("update public.profiles set platform_role = 'admin' where id = $1", [admin]);
    sessions.set("a", { id: A, email: "a@test.local" }); sessions.set("b", { id: B, email: "b@test.local" }); sessions.set("adm", { id: admin, email: "admin@test.local" });
    sessions.set("g", { id: randomUUID(), email: null, isGuest: true });
    ctx = { repo: pgRepo(db), db: { async rpc(fn, args) { try { return await rpc(db, fn, args); } catch (err: any) { throw new DbError(err.message, err.code); } } },
      providers: { groq: model }, billing: null, async getUser(jwt) { return sessions.get(jwt) ?? null; }, async deleteUser() {},
      appUrl: "https://app.test", allowedOrigins: [], log: () => {}, research: { keys: {}, fetch: fakeFetch().fetch } };
  });
  beforeEach(() => { resetCooldowns(); mode = "ok"; });

  test("a search retrieves, merges duplicates across sources, filters by year and records its strategy", async () => {
    const r = await call("a", "POST", "/research/search", { question, filters: { fromYear: 2015 } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    searchId = r.body.search.id;
    const titles = r.body.papers.map((p: any) => p.data.title);
    assert.ok(!titles.some((t: string) => /review/.test(t)), "the 2010 review is outside the years");
    const merged = r.body.papers.find((p: any) => p.data.doi === "10.1000/a1");
    assert.deepEqual([...merged.found_in].sort(), ["crossref", "openalex"]);
    assert.equal(r.body.papers.filter((p: any) => p.data.doi === "10.1000/a1").length, 1, "one record for the paper both services returned");
    const st = r.body.search.strategy;
    assert.equal(st.pages[0].excluded.outside_years, 1);
    assert.ok(st.pages[0].retrieved >= 4 && st.pages[0].unique < st.pages[0].retrieved);
    assert.ok(st.databases.includes("OpenAlex"));
    assert.ok(st.notices.some((n: string) => /not an exhaustive search/.test(n)));
    assert.equal(r.body.claims.length, 1, "the question itself is the first claim");
    assert.ok(r.body.papers[0].refs.apa && r.body.papers[0].refs.vancouver);
    assert.equal(r.body.counts.no_abstract, 1);
  });

  test("another user can't see, assess, change or export it; a guest can't use Research", async () => {
    for (const [method, path, body] of [["GET", `/research/search/${searchId}`], ["POST", `/research/search/${searchId}/assess`, { claimId: randomUUID() }],
      ["POST", `/research/search/${searchId}/claims`, { claims: ["x claim"] }], ["GET", `/research/search/${searchId}/export?format=ris`], ["POST", `/research/search/${searchId}/synthesis`]] as const) {
      assert.equal((await call("b", method, path, body)).status, 404, `${method} ${path}`);
    }
    assert.equal((await call("g", "GET", "/research/workspace")).status, 403);
    for (const table of ["research_searches", "evidence_assessments", "research_saved_papers", "research_papers"]) {
      await assert.rejects(() => asUser(db, A, () => db.query(`select * from public.${table}`)), /permission denied/, table);
    }
  });

  test("assessment runs in small batches: textless papers are set aside free, unverified support is downgraded, the meter counts", async () => {
    const view = (await call("a", "GET", `/research/search/${searchId}`)).body;
    const claim = view.claims[0].id;
    let r, rounds = 0;
    do { r = await call("a", "POST", `/research/search/${searchId}/assess`, { claimId: claim }); rounds++; } while (r.status === 200 && !r.body.done && rounds < 10);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const rows = r.body.assessments.filter((a: any) => a.claim_id === claim);
    const by = (doi: string) => rows.find((a: any) => a.paper_key === `doi:${doi}`);
    assert.equal(by("10.1000/a1").category, "supports");
    assert.equal(by("10.1000/a1").passages[0].location, "Abstract");
    assert.equal(by("10.1000/a2").category, "insufficient", "its quoted sentence isn't in the paper");
    assert.equal(by("10.1000/a4").category, "no_text");
    const meter = r.body.meters[claim];
    assert.deepEqual([meter.counts.supports, meter.counts.insufficient, meter.excluded.no_text, meter.relevant], [1, 1, 1, 2]);
    assert.ok(!prompts.some(p => p.includes("University AI tutoring for independent problem solving") && !p.includes("Abstract:")), "a title alone is never sent for judgement");
  });

  test("the per-search assessment allowance holds, and a busy model asks to try again", async () => {
    await db.query(`update public.plans set research_limits = research_limits || '{"assessments_per_search": 2}' where id = 'free'`);
    await call("a", "POST", `/research/search/${searchId}/claims`, { claims: ["AI tutoring improves exam scores."] });
    const v = (await call("a", "GET", `/research/search/${searchId}`)).body;
    const r = await call("a", "POST", `/research/search/${searchId}/assess`, { claimId: v.claims[1].id });
    assert.equal(r.status, 429);
    assert.equal(r.body.error, "research_assess_limit");
    await db.query(`update public.plans set research_limits = research_limits || '{"assessments_per_search": 10}' where id = 'free'`);
    mode = "busy";
    const busy = await call("a", "POST", `/research/search/${searchId}/assess`, { claimId: v.claims[1].id });
    assert.equal(busy.status, 503);
    assert.equal(busy.body.retry_after_seconds, 20);
  });

  test("claims can be suggested, added and removed; there is a ceiling", async () => {
    const s = await call("a", "POST", `/research/search/${searchId}/claims/suggest`);
    assert.deepEqual(s.body.claims, ["AI tutoring improves independent problem solving.", "AI tutoring improves exam scores."], "a too-short suggestion is dropped");
    const v = (await call("a", "GET", `/research/search/${searchId}`)).body;
    assert.equal((await call("a", "DELETE", `/research/claims/${v.claims[1].id}`)).status, 200);
    assert.equal((await call("a", "POST", `/research/search/${searchId}/claims`, { claims: ["c one", "c two", "c three", "c four", "c five", "c six"] })).status, 400);
  });

  test("synthesis cites only assessed papers, records its checks, and keeps to the monthly allowance", async () => {
    const r = await call("a", "POST", `/research/search/${searchId}/synthesis`);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const syn = r.body.synthesis.content;
    assert.deepEqual(syn.executive_summary[0].refs, ["P1", "P2"], "P9 was never assessed, so it goes");
    assert.ok(syn.checks.refs_removed >= 1);
    assert.equal(Object.keys(syn.refs).length, 2);
    assert.match(syn.coverage, /OpenAlex/);
    await call("a", "POST", `/research/search/${searchId}/synthesis`);
    const third = await call("a", "POST", `/research/search/${searchId}/synthesis`);
    assert.equal(third.status, 429, "the free plan allows 2 a month");
  });

  test("exports: RIS, BibTeX, CSV and a report that keeps found and written apart; switched off by plan", async () => {
    const ris = await call("a", "GET", `/research/search/${searchId}/export?format=ris`);
    assert.equal(ris.status, 200);
    assert.match(ris.type ?? "", /research-info-systems/);
    assert.match(ris.text, /DO {2}- 10\.1000\/a1/);
    const md = await call("a", "GET", `/research/search/${searchId}/export?format=md&style=vancouver`);
    assert.match(md.text, /not of all research, and not a probability/);
    assert.match(md.text, /written by AI from the assessments above/);
    assert.match(md.text, /\| 1 of 2 \(50%\) \|/);
    const csv = await call("a", "GET", `/research/search/${searchId}/export?format=csv&scope=assessed`);
    assert.equal(csv.text.trim().split("\r\n").length, 3);
    assert.equal((await call("a", "GET", `/research/search/${searchId}/export?format=exe`)).status, 400);
    await db.query(`update public.plans set research_limits = research_limits || '{"export": false}' where id = 'free'`);
    assert.equal((await call("a", "GET", `/research/search/${searchId}/export?format=ris`)).status, 403);
    await db.query(`update public.plans set research_limits = research_limits || '{"export": true}' where id = 'free'`);
    assert.ok(Number((await db.query<any>("select count(*) n from public.research_exports where user_id = $1", [A])).rows[0].n) >= 3);
  });

  test("projects and saved papers with notes are private to their owner", async () => {
    const p = await call("a", "POST", "/research/projects", { title: "Thesis chapter 2" });
    const pid = p.body.id;
    assert.equal((await call("a", "POST", `/research/search/${searchId}/project`, { projectId: pid })).status, 200);
    const s = await call("a", "POST", "/research/saved", { paper_key: "doi:10.1000/a1", project_id: pid, note: "Key trial" });
    assert.equal(s.status, 200);
    const again = await call("a", "POST", "/research/saved", { paper_key: "doi:10.1000/a1", project_id: pid, note: "Updated note" });
    assert.equal(again.body.id, s.body.id, "saving again updates, not duplicates");
    const ws = (await call("a", "GET", "/research/workspace")).body;
    assert.equal(ws.saved[0].note, "Updated note");
    assert.equal(ws.projects[0].searches, 1);
    const wsB = (await call("b", "GET", "/research/workspace")).body;
    assert.deepEqual([wsB.saved.length, wsB.projects.length, wsB.searches.length], [0, 0, 0]);
    assert.equal((await call("b", "POST", "/research/saved", { paper_key: "doi:10.1000/a1", project_id: pid })).status, 404, "B can't file into A's project");
    assert.equal((await call("b", "POST", "/research/saved", { delete: true, id: s.body.id })).body.id, null, "B can't delete A's note");
  });

  test("the monthly search allowance holds; a boolean NOT excludes and is reported", async () => {
    const r = await call("a", "POST", "/research/search", { question: "AI tutoring AND \"problem solving\" NOT null" });
    assert.equal(r.status, 200);
    assert.ok(r.body.search.is_boolean);
    assert.equal(r.body.claims.length, 0, "keywords are not a claim: the person writes one");
    assert.equal(r.body.search.strategy.pages[0].excluded.query_operators, 1, "the 'null result' paper");
    await db.query(`update public.plans set research_limits = research_limits || '{"searches_per_month": 2}' where id = 'free'`);
    const blocked = await call("a", "POST", "/research/search", { question });
    assert.equal(blocked.status, 429);
    assert.equal(blocked.body.error, "research_search_limit");
    assert.equal((await call("a", "POST", "/research/search", { question: "x", filters: {} })).status, 400);
    assert.equal((await call("b", "POST", "/research/search", { question, filters: { fromYear: 2030, toYear: 2020 } })).status, 400);
  });

  test("administrators see totals without anyone's questions, and can change limits within bounds", async () => {
    const r = await call("adm", "GET", "/admin/research");
    const w = r.body.workspace;
    assert.ok(w.searches >= 2 && w.active_users >= 1 && w.papers_assessed >= 2 && w.downgraded >= 1 && w.syntheses >= 1);
    assert.ok(w.cost_usd >= 0 && w.top_saved[0].saves >= 1);
    assert.ok(!JSON.stringify(w).includes("problem solving among university"), "no questions in admin numbers");
    assert.equal((await call("adm", "POST", "/admin/research", { workspace: { plan: "pro", limits: { searches_per_month: 50, full_text: false } } })).status, 200);
    assert.equal((await call("adm", "POST", "/admin/research", { workspace: { plan: "pro", limits: { searches_per_month: -1 } } })).status, 400);
    assert.equal((await call("adm", "POST", "/admin/research", { workspace: { plan: "pro", limits: { anything: 1 } } })).status, 400);
    assert.equal((await call("adm", "POST", "/admin/research", { workspace: { plan: "guest", limits: { searches_per_month: 5 } } })).status, 400);
    assert.equal((await call("a", "GET", "/admin/research")).status, 403);
  });

  test("existing plans keep their prices, and the guest plan has no Research", async () => {
    const rows = (await db.query<any>("select id, price_monthly_cents p, research_limits l from public.plans order by rank")).rows;
    assert.equal(rows.find((r: any) => r.id === "guest").l.searches_per_month, 0);
    assert.equal(rows.find((r: any) => r.id === "pro").p, 500);
  });
});
