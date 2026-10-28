// Long, realistic conversations through the full tutor pipeline (local PGlite
// database, real Groq models): hints in order, wrong then right answers, practice,
// summaries, several languages. Prints every turn for review and checks the
// verifiable parts (status, solved flag, hint count, reply language).
// Needs GROQ_API_KEY (reads ../menya/.env).
//   cd supabase && node dev/try-long-conversations.ts
import { readFileSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { freshDb, createUser } from "../tests/db.ts";
import { pgRepo } from "../tests/pgRepo.ts";
import { handleTutor } from "../functions/_shared/tutorService.ts";
import { buildProviders } from "../functions/_shared/providers.ts";

const envFile = new URL("../../menya/.env", import.meta.url);
if (!process.env.GROQ_API_KEY && existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = /^\s*GROQ_API_KEY\s*=\s*(.+)\s*$/.exec(line);
    if (m) process.env.GROQ_API_KEY = m[1].replace(/^["']|["']$/g, "");
  }
}
if (!process.env.GROQ_API_KEY) throw new Error("Set GROQ_API_KEY");

const db = await freshDb();
const deps = { repo: pgRepo(db), providers: buildProviders({ GROQ_API_KEY: process.env.GROQ_API_KEY }) };

const PACE_MS = Number(process.env.PACE_MS ?? 12000);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
let retries = 0;

type Turn = { say?: string; action?: string; expect?: { solved?: boolean; type?: string; hintsUsed?: number }; leak?: RegExp };
const results: { title: string; checks: number; failed: string[] }[] = [];

async function conversation(title: string, language: string, expectLanguage: string, turns: Turn[]) {
  console.log(`\n=== ${title} (setting: ${language}) ===`);
  const user = await createUser(db);
  let sessionId: string | null = null;
  const failed: string[] = []; let checks = 0;
  const check = (ok: boolean, what: string) => { checks++; if (!ok) failed.push(what); };
  for (const [i, t] of turns.entries()) {
    const body = t.say !== undefined
      ? { requestId: randomUUID(), sessionId, action: t.action ?? "message", message: t.say, language }
      : { requestId: randomUUID(), sessionId, action: t.action, language };
    // Pace turns like a student typing, and retry when the free tier says "wait".
    await sleep(PACE_MS);
    const started = Date.now();
    let res = await handleTutor(deps, user, body);
    for (let retry = 0; retry < 4 && (res.status === 429 || res.status === 503); retry++) {
      const wait = Math.max(10, Number(res.body.retry_after_seconds) || 0) * 1000;
      console.log(`  (${res.body.error}; retrying in ${wait / 1000}s)`); retries++;
      await sleep(wait);
      res = await handleTutor(deps, user, { ...body, requestId: randomUUID() });
    }
    const r = res.body.reply as any;
    sessionId = (res.body.sessionId as string) ?? sessionId;
    console.log(`\n[${i + 1}] > ${t.say ?? `[${t.action}]`}`);
    if (res.status !== 200) { console.log(`< HTTP ${res.status} ${JSON.stringify(res.body)}`); check(false, `turn ${i + 1}: HTTP ${res.status}`); continue; }
    const p = res.body.problem as any;
    console.log(`< (${r.language}, ${r.type}, solved=${p.solved}, hints=${res.body.hintsUsed}, ${((Date.now() - started) / 1000).toFixed(1)}s)\n${r.message}`);
    check(r.language === expectLanguage, `turn ${i + 1}: language ${r.language}`);
    if (t.expect?.solved !== undefined) check(p.solved === t.expect.solved, `turn ${i + 1}: solved=${p.solved}, expected ${t.expect.solved}`);
    if (t.expect?.type) check(r.type === t.expect.type, `turn ${i + 1}: type ${r.type}, expected ${t.expect.type}`);
    if (t.expect?.hintsUsed !== undefined) check(res.body.hintsUsed === t.expect.hintsUsed, `turn ${i + 1}: hintsUsed ${res.body.hintsUsed}`);
    if (t.leak) check(!t.leak.test(r.message), `turn ${i + 1}: gave the answer away (${t.leak})`);
  }
  results.push({ title, checks, failed });
}

// A ball thrown up at 20 m/s (g = 10 m/s^2) rises 20 m, for 2 s.
const height = /\b20\s*(m\b|metres|meters)(?!\/)/i;
await conversation("Physics, English: a long session with every kind of help", "auto", "English", [
  { say: "A ball is thrown straight up at 20 m/s. Taking g = 10 m/s², how high does it go?", leak: height },
  { say: "I honestly don't know where to start", leak: height },
  { action: "hint", expect: { type: "hint", hintsUsed: 1 }, leak: height },
  { say: "so the speed at the top is zero?", leak: height },
  { action: "hint", expect: { hintsUsed: 2 }, leak: height },
  { say: "t = 2 seconds", expect: { solved: false } },
  { say: "so the height is 20 × 2 = 40 m", expect: { solved: false }, leak: height },
  { action: "simpler", leak: height },
  { action: "hint", expect: { hintsUsed: 3 } },
  { say: "Oh, the average speed is 10 m/s, so 10 × 2 = 20 m", expect: { solved: true } },
  { action: "practice", expect: { solved: false } },
  { say: "I think it's 45 m" },
  { action: "summary" },
]);

// 3x + 5 = 20  ->  x = 5
await conversation("Algebra, Kinyarwanda: wrong answer, then right", "auto", "Kinyarwanda", [
  { say: "Nfasha gukemura iyi mibare: 3x + 5 = 20. x ingana iki?", leak: /x\s*=\s*5\b/ },
  { action: "hint", expect: { hintsUsed: 1 }, leak: /x\s*=\s*5\b/ },
  { say: "x = 25/3 ?", expect: { solved: false }, leak: /x\s*=\s*5\b/ },
  { action: "hint", expect: { hintsUsed: 2 }, leak: /x\s*=\s*5\b/ },
  { say: "3x = 15 rero x = 5", expect: { solved: true } },
  { action: "practice" },
  { action: "summary" },
]);

// 117 g of NaCl, M = 58.5 g/mol  ->  2 mol
await conversation("Chemistry, French chosen: three hints, answer checked", "French", "French", [
  { say: "Combien de moles y a-t-il dans 117 g de NaCl ? (Na = 23, Cl = 35,5)", leak: /\b2(,0)?\s*mol/ },
  { action: "hint", expect: { hintsUsed: 1 }, leak: /\b2(,0)?\s*mol/ },
  { action: "hint", expect: { hintsUsed: 2 }, leak: /\b2(,0)?\s*mol/ },
  { say: "la masse molaire est 58,5 g/mol", expect: { solved: false } },
  { say: "117 × 58,5 = 6844 mol", expect: { solved: false }, leak: /\b2(,0)?\s*mol/ },
  { action: "hint", expect: { hintsUsed: 3 } },
  { say: "117 / 58,5 = 2 mol", expect: { solved: true } },
  { action: "summary" },
]);

// Questions about recent facts: the tutor should not invent current information.
await conversation("Up-to-date questions, English", "English", "English", [
  { say: "What is the newest version of Python released this month?" },
  { say: "Who is the current president of Rwanda and what did they announce last week?" },
  { say: "OK. Can you help me understand Ohm's law for a circuit with a 12 V battery and a 4 Ω resistor?", leak: /\b3\s*A\b/ },
  { say: "I = V/R = 12/4 = 3 A", expect: { solved: true } },
]);

console.log(`\n=== Summary (${retries} retries after free-tier waits) ===`);
for (const r of results) console.log(`${r.failed.length ? "✗" : "✓"} ${r.title}: ${r.checks - r.failed.length}/${r.checks} checks${r.failed.length ? "\n    " + r.failed.join("\n    ") : ""}`);
