// Menya Research end to end with the real academic services and the real model, on a throwaway database.
//   cd supabase && node dev/try-workspace.ts "your research question"
import { readFileSync, existsSync } from "node:fs";
import { freshDb, createUser, rpc } from "../tests/db.ts";
import { pgRepo } from "../tests/pgRepo.ts";
import { handleApi, DbError, type ApiContext } from "../functions/_shared/api.ts";
import { buildProviders } from "../functions/_shared/providers.ts";

for (const f of ["../menya/.env", ".env"]) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m && m[2] && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const question = process.argv[2] ?? "Does AI-assisted tutoring improve independent problem-solving among university students?";
const db = await freshDb();
const user = await createUser(db, "researcher@test.local");
await db.query(`update public.plans set research_limits = research_limits || '{"assessments_per_search": 9, "full_text": true}' where id = 'free'`);
const ctx: ApiContext = {
  repo: pgRepo(db), db: { async rpc(fn, args) { try { return await rpc(db, fn, args); } catch (err: any) { throw new DbError(err.message, err.code); } } },
  providers: buildProviders({ GROQ_API_KEY: process.env.GROQ_API_KEY }), billing: null,
  async getUser() { return { id: user, email: "researcher@test.local" }; }, async deleteUser() {}, appUrl: "https://app.test", allowedOrigins: [], log: () => {},
  research: { keys: { openalex: process.env.OPENALEX_API_KEY, semanticScholar: process.env.SEMANTIC_SCHOLAR_API_KEY } },
};
const call = async (method: string, path: string, body?: unknown) => {
  const res = await handleApi(new Request(`https://x/functions/v1/api${path}`, { method, headers: { authorization: "Bearer t", "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }), ctx);
  const text = await res.text(); try { return { status: res.status, body: JSON.parse(text) }; } catch { return { status: res.status, body: text }; }
};
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

console.log(`QUESTION: ${question}\n`);
let t0 = Date.now();
const s = await call("POST", "/research/search", { question });
if (s.status !== 200) { console.log(s); process.exit(1); }
const id = s.body.search.id, st = s.body.search.strategy;
console.log(`Search: ${Date.now() - t0} ms · query "${st.query}" · ${st.pages[0].retrieved} retrieved, ${st.pages[0].unique} unique, ${st.pages[0].kept} kept`);
console.log(`Sources: ${st.pages[0].sources.map((x: any) => `${x.name}:${x.status}(${x.results})`).join(" ")}`);
console.log(`Excluded: ${JSON.stringify(st.pages[0].excluded)} · abstracts ${s.body.counts.abstracts}, none ${s.body.counts.no_abstract}`);
for (const p of s.body.papers.slice(0, 6)) console.log(`  - ${p.data.year} [${p.data.kind}] ${p.data.title.slice(0, 95)} (${p.found_in.join(",")})`);

const claim = s.body.claims[0].id;
t0 = Date.now();
let r: any, steps = 0;
while (steps < 12) {
  r = await call("POST", `/research/search/${id}/assess`, { claimId: claim });
  steps++;
  if (r.status === 503) { console.log(`  model busy, waiting ${r.body.retry_after_seconds}s`); await sleep(r.body.retry_after_seconds * 1000); continue; }
  if (r.status !== 200 || r.body.done) break;
  await sleep(4000);
}
console.log(`\nAssessment: ${steps} calls, ${Math.round((Date.now() - t0) / 1000)} s, last status ${r.status} ${r.body?.error ?? ""}`);
const view = (await call("GET", `/research/search/${id}`)).body;
const m = view.meters[claim];
console.log(`METER: ${JSON.stringify(m.counts)} percent ${JSON.stringify(m.percent)} relevant ${m.relevant} excluded ${JSON.stringify(m.excluded)}`);
const titleOf = new Map(view.papers.map((p: any) => [p.key, p.data.title]));
for (const a of view.assessments) {
  console.log(`\n  [${a.category} · confidence ${a.confidence} · strength ${a.strength} · ${a.design}${a.sample_size ? ` n=${a.sample_size}` : ""} · ${a.evidence_level}] ${String(titleOf.get(a.paper_key)).slice(0, 90)}`);
  if (a.passages[0]) console.log(`     "${a.passages[0].text.slice(0, 220)}" (${a.passages[0].location})`);
  console.log(`     why: ${a.rationale.slice(0, 240)}${a.checks?.passages_rejected ? ` · quotes rejected: ${a.checks.passages_rejected}` : ""}`);
}

await sleep(15000);
const y = await call("POST", `/research/search/${id}/synthesis`);
console.log(`\nSynthesis: status ${y.status} ${y.body?.error ?? ""}`);
const syn = y.body?.synthesis?.content;
if (syn) {
  for (const [k, items] of Object.entries(syn)) if (Array.isArray(items)) for (const i of items as any[]) console.log(`  ${k}: ${(i.text ?? i.gap ?? i.question).slice(0, 220)} ${JSON.stringify(i.refs)}`);
  console.log(`  checks ${JSON.stringify(syn.checks)} · refs ${JSON.stringify(syn.refs)}`);
}
const usage = (await db.query<any>("select tokens_in, tokens_out, cost_usd, assess_batches from public.research_searches where id = $1", [id])).rows[0];
console.log(`\nUsage: ${JSON.stringify(usage)}`);
process.exit(0);
