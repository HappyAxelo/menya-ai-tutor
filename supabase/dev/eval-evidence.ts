// Measures the evidence classifier against eval/evidence-benchmark.json with the real model and the papers'
// real abstracts (fetched from Europe PMC). Prints accuracy, per-category precision, recall and F1, the
// false-support and false-contradiction rates, and quotation checks. cd supabase && node dev/eval-evidence.ts
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { freshDb } from "../tests/db.ts";
import { pgRepo } from "../tests/pgRepo.ts";
import { buildProviders } from "../functions/_shared/providers.ts";
import { callModel } from "../functions/_shared/research/workspace.ts";
import { ASSESS_SYSTEM, assessPrompt, assessSchema, paperText, validateAssessments } from "../functions/_shared/research/evidence.ts";
import { plainText, cleanDoi, type Paper } from "../functions/_shared/research/connectors.ts";

for (const f of ["../menya/.env", ".env"]) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, "utf8").split(/\r?\n/)) { const m = /^([A-Z_]+)=(.*)$/.exec(line.trim()); if (m && m[2] && !process.env[m[1]]) process.env[m[1]] = m[2]; }
}
const bench = JSON.parse(readFileSync("eval/evidence-benchmark.json", "utf8"));
const ctx: any = { repo: pgRepo(await freshDb()), providers: buildProviders({ GROQ_API_KEY: process.env.GROQ_API_KEY }), log: () => {} };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function fetchPaper(doi: string): Promise<Paper | null> {
  const u = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(`DOI:"${doi}"`)}&format=json&resultType=core&pageSize=1`;
  const r = (await (await fetch(u)).json()).resultList?.result?.[0];
  if (!r?.abstractText) return null;
  return { connector: "europe_pmc", title: plainText(r.title), authors: [], year: Number(r.pubYear) || null, venue: r.journalInfo?.journal?.title ?? null, doi: cleanDoi(r.doi),
    url: `https://doi.org/${doi}`, abstract: plainText(r.abstractText), kind: (r.pubTypeList?.pubType ?? []).some((t: string) => /review/i.test(t)) ? "review" : "journal_article",
    openAccessUrl: null, license: null, citedBy: null };
}

const results: { doi: string; claim: string; gold: string; got: string; downgraded: boolean; rejected: number; passages: number }[] = [];
const missing: string[] = [];
for (const [claimId, claim] of Object.entries(bench.claims) as [string, string][]) {
  const items = bench.items.filter((i: any) => i.claim === claimId);
  const papers: { item: any; paper: Paper }[] = [];
  for (const item of items) { const p = await fetchPaper(item.doi); if (p) papers.push({ item, paper: p }); else missing.push(item.doi); await sleep(300); }
  for (let i = 0; i < papers.length; i += 3) {
    const batch = papers.slice(i, i + 3);
    const texts = batch.map((b, k) => paperText(b.item.doi, `P${k + 1}`, b.paper));
    let out: any = null;
    for (let attempt = 0; attempt < 6 && !out; attempt++) {
      try { out = await callModel(ctx, ASSESS_SYSTEM, assessPrompt(claim, texts), assessSchema(texts.map(t => t.label)), 6000); }
      catch (err: any) { const wait = Math.ceil((err?.retryAfterMs ?? 20000) / 1000) + 2; console.log(`  model: ${err?.kind ?? err?.message}; waiting ${wait}s`); await sleep(wait * 1000); }
    }
    const { rows } = out ? validateAssessments(out.json, texts) : { rows: [] as any[] };
    for (const b of batch) {
      const row = rows.find(r => r.paper_key === b.item.doi);
      results.push({ doi: b.item.doi, claim: claimId, gold: b.item.gold, got: row?.category ?? "missing", downgraded: row?.checks.downgraded ?? false,
        rejected: row?.checks.passages_rejected ?? 0, passages: row?.passages.length ?? 0 });
      console.log(`${row?.category === b.item.gold ? "ok  " : "MISS"} ${claimId} ${b.item.doi}: gold ${b.item.gold}, got ${row?.category ?? "missing"}${row?.checks.downgraded ? " (downgraded: quote not found)" : ""}`);
    }
    await sleep(8000);
  }
}

const cats = ["supports", "contradicts", "mixed", "insufficient", "not_relevant"];
const n = results.length, correct = results.filter(r => r.got === r.gold).length;
const per = cats.map(c => {
  const tp = results.filter(r => r.got === c && r.gold === c).length, fp = results.filter(r => r.got === c && r.gold !== c).length, fn = results.filter(r => r.got !== c && r.gold === c).length;
  const p = tp + fp ? tp / (tp + fp) : null, rc = tp + fn ? tp / (tp + fn) : null;
  return { category: c, gold: tp + fn, predicted: tp + fp, precision: p, recall: rc, f1: p != null && rc != null && p + rc > 0 ? (2 * p * rc) / (p + rc) : null };
});
const notSupport = results.filter(r => r.gold !== "supports"), notContra = results.filter(r => r.gold !== "contradicts");
const report = {
  run: new Date().toISOString(), papers: n, missing_abstracts: missing,
  accuracy: n ? correct / n : null,
  macro_f1: (() => { const f = per.filter(x => x.f1 != null && x.gold > 0).map(x => x.f1!); return f.length ? f.reduce((a, b) => a + b, 0) / f.length : null; })(),
  false_support_rate: notSupport.length ? notSupport.filter(r => r.got === "supports").length / notSupport.length : null,
  false_contradiction_rate: notContra.length ? notContra.filter(r => r.got === "contradicts").length / notContra.length : null,
  per_category: per,
  quotations: { kept: results.reduce((s, r) => s + r.passages, 0), rejected_not_in_text: results.reduce((s, r) => s + r.rejected, 0), judgements_downgraded: results.filter(r => r.downgraded).length },
  confusion: results.map(r => ({ doi: r.doi, gold: r.gold, got: r.got })),
};
writeFileSync("eval/evidence-benchmark-result.json", JSON.stringify(report, null, 2));
console.log("\n" + JSON.stringify({ ...report, confusion: undefined }, null, 2));
process.exit(0);
