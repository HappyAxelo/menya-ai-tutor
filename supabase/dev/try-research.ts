// The research system against the real services and, if a key is available, the real model.
//   cd supabase && node dev/try-research.ts            search only
//   cd supabase && node dev/try-research.ts --tutor    the full tutor pipeline as well
// Prints what each service returned, so results are from real calls. Uses a throwaway in-memory database.
import { readFileSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { freshDb, createUser } from "../tests/db.ts";
import { pgRepo } from "../tests/pgRepo.ts";
import { handleTutor } from "../functions/_shared/tutorService.ts";
import { buildProviders } from "../functions/_shared/providers.ts";
import { CONNECTORS } from "../functions/_shared/research/connectors.ts";
import { decideResearch, keywordsFrom } from "../functions/_shared/research/select.ts";
import { runResearch } from "../functions/_shared/research/pipeline.ts";

for (const f of ["../menya/.env", ".env"]) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m && m[2] && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const keys = { contactEmail: process.env.RESEARCH_CONTACT_EMAIL, openalex: process.env.OPENALEX_API_KEY, semanticScholar: process.env.SEMANTIC_SCHOLAR_API_KEY,
               ncbi: process.env.NCBI_API_KEY, core: process.env.CORE_API_KEY };
const db = await freshDb();
const repo = pgRepo(db);
const QUESTIONS = ["Explain how machine learning can predict malaria outbreaks.", "What are recent developments in computer vision?", "What does research say about spaced practice and retention in students?"];

console.log("=== Each service, one direct call ===");
for (const [id, c] of Object.entries(CONNECTORS)) {
  if (c.needs && !keys[c.needs]) { console.log(`${id}: skipped, needs ${c.needs}`); continue; }
  const t0 = Date.now();
  try {
    const papers = await c.search("malaria prediction machine learning", { limit: 2, recent: false, keys,
      http: async (u, init) => { const r = await fetch(u, { headers: init?.headers, signal: AbortSignal.timeout(20000) }); return { status: r.status, text: await r.text() }; } });
    const p = papers[0];
    console.log(`${id}: ${papers.length} in ${Date.now() - t0} ms${p ? ` | ${p.year} | ${p.kind} | abstract ${p.abstract ? "yes" : "no"} | ${p.url} | ${p.title.slice(0, 70)}` : ""}`);
  } catch (err) { console.log(`${id}: FAILED after ${Date.now() - t0} ms: ${(err as Error).message}`); }
  await new Promise(r => setTimeout(r, 1000));
}

console.log("\n=== Selection and search for three questions ===");
for (const q of QUESTIONS) {
  const d = decideResearch(q, {});
  const r = await runResearch(keywordsFrom(q), d, repo, { keys });
  console.log(`\nQ: ${q}\n  subject ${d.subject}, ${d.tier}, query "${keywordsFrom(q)}", ${r.durationMs} ms\n  calls: ${r.calls.map(c => `${c.connector}:${c.status}(${c.latency_ms}ms,${c.results})`).join(" ")}`);
  for (const p of r.papers.slice(0, 4)) console.log(`  - ${p.year} [${p.kind}] ${p.title.slice(0, 90)} | ${p.url}`);
}

if (process.argv.includes("--tutor")) {
  const providers = buildProviders({ GROQ_API_KEY: process.env.GROQ_API_KEY, ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY });
  if (!Object.keys(providers).length) { console.log("\nNo model key here: the full tutor can't run."); process.exit(0); }
  console.log("\n=== Full tutor replies ===");
  const user = await createUser(db, "demo@menya.local");
  await db.query("update public.plans set daily_research_limit = 50 where id = 'free'");
  for (const q of QUESTIONS) {
    const res = await handleTutor({ repo, providers, research: { keys } }, user, { requestId: randomUUID(), action: "message", message: q, language: "English" });
    const b = res.body as any;
    console.log(`\nQ: ${q}\nstatus ${res.status}, move ${b.engine?.state}, research ${b.research?.status}`);
    console.log(b.reply?.message ?? JSON.stringify(b));
    for (const s of b.research?.sources ?? []) console.log(`  REF: ${s.apa} [${s.kind}, ${s.evidence}]`);
    await new Promise(r => setTimeout(r, 12000));
  }
}
process.exit(0);
