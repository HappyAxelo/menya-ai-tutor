// Menya 5 live evaluation: 20 university topics with a REAL model, through the real pipeline.
// For each topic: a beginner lesson, a wrong answer (does the tutor change approach without giving
// the step away?), "I don't know", and a request for a harder problem. Writes
// docs/MENYA5_EVAL_RESULTS.md with every reply word for word, what the server's own checks found,
// and blank columns for a subject teacher.
//
//   cd supabase
//   node dev/eval-menya5.ts                 needs GROQ_API_KEY (or ../menya/.env)
//                                           in PowerShell, set it first: $env:GROQ_API_KEY = "your key"
//   ONLY=12 node dev/eval-menya5.ts         one topic
//   FROM=5 TO=10 node dev/eval-menya5.ts    a range (in PowerShell: $env:FROM = "5"; $env:TO = "10")
//   EVAL_CANNED=1 node dev/eval-menya5.ts   checks this script only; canned replies prove nothing about teaching
//
// The automatic columns are structural: arithmetic that doesn't hold, a corrected step given away,
// a question before any teaching, a named law never stated. Whether the physics and mathematics are
// right, and well taught, is for a subject teacher to judge in the blank columns.
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { freshDb, createUser } from "../tests/db.ts";
import { pgRepo } from "../tests/pgRepo.ts";
import { handleTutor } from "../functions/_shared/tutorService.ts";
import { buildProviders, type ModelProvider } from "../functions/_shared/providers.ts";
import { parseLesson, stripLessonMarkers } from "../functions/_shared/lessonFormat.ts";
import { checkArithmetic } from "../functions/_shared/engine/mathCheck.ts";
import { statesCorrection } from "../functions/_shared/answerGuard.ts";

for (const f of ["../menya/.env", ".env"]) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m && m[2] && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const canned = Boolean(process.env.EVAL_CANNED);
if (!canned && !process.env.GROQ_API_KEY) { console.error("Set GROQ_API_KEY first (see the top of this file)."); process.exit(1); }

interface Topic { n: number; area: string; title: string; ask: string; wrong: string; mustName?: RegExp }
const TOPICS: Topic[] = [
  { n: 1, area: "Mathematics", title: "Differentiation", ask: "I don't understand differentiation. Find the derivative of f(x) = 3x^2 + 5x + 4", wrong: "3x", mustName: /power rule/i },
  { n: 2, area: "Mathematics", title: "Integration", ask: "I struggle with integration. Evaluate the integral of 6x^2 + 3 from 0 to 2.", wrong: "54" },
  { n: 3, area: "Mathematics", title: "Differential equations", ask: "I don't get differential equations. Solve dy/dt = -0.5y with y(0) = 8 and find y(2).", wrong: "0" },
  { n: 4, area: "Mathematics", title: "Matrices", ask: "Teach me how to multiply matrices. A has rows (1, 2) and (3, 4), B has rows (0, 1) and (5, 2). Find AB.", wrong: "(0, 2) and (15, 8)" },
  { n: 5, area: "Mathematics", title: "Probability", ask: "Two machines fail independently with probabilities 0.2 and 0.3. What is the probability at least one fails? I never know when to add or multiply.", wrong: "0.5" },
  { n: 6, area: "Mathematics", title: "Complex numbers", ask: "Help me understand multiplying complex numbers: (2 + 3i)(1 - 4i).", wrong: "-10 - 5i" },
  { n: 7, area: "Physics", title: "Newton's laws", ask: "I can't understand Newton's second law. A 5 kg crate is pushed with 16 N against 6 N of friction. What is its acceleration?", wrong: "3.2 m/s^2", mustName: /newton/i },
  { n: 8, area: "Physics", title: "Projectile motion", ask: "A ball is launched at 20 m/s at 30 degrees. Find its range. I don't understand projectiles.", wrong: "20.4 m" },
  { n: 9, area: "Physics", title: "Electricity", ask: "Explain Ohm's law. A 12 V battery is across a 4 ohm resistor: what current flows?", wrong: "48 A", mustName: /ohm/i },
  { n: 10, area: "Physics", title: "Kirchhoff's laws", ask: "I can't understand Kirchhoff's laws. A 12 V battery is in series with a 2 ohm resistor, then two parallel branches of 3 ohm and 6 ohm. Find the current in each branch.", wrong: "4 A and 2 A", mustName: /kirchhoff/i },
  { n: 11, area: "Physics", title: "Electromagnetic induction", ask: "Teach me electromagnetic induction. The flux through a 200-turn coil changes by 5 mWb in 100 ms. What emf is induced?", wrong: "0.05 V", mustName: /faraday/i },
  { n: 12, area: "Physics", title: "Wave mechanics", ask: "I don't understand waves. A wave has frequency 50 Hz and wavelength 2 m. What is its speed?", wrong: "25 m/s" },
  { n: 13, area: "Engineering", title: "Circuit analysis", ask: "A 9 V supply feeds 1 kilo-ohm in series with 2 kilo-ohm. What is the voltage across the 2 kilo-ohm resistor? I don't get voltage dividers.", wrong: "3 V" },
  { n: 14, area: "Engineering", title: "Signal processing", ask: "What sampling rate do I need for a signal with components at 1.2 kHz and 3.5 kHz? Explain why.", wrong: "3.5 kHz", mustName: /nyquist/i },
  { n: 15, area: "Engineering", title: "Control systems", ask: "A unity feedback loop has G(s) = 9/(2s + 1). What is the steady-state output for a step of 10? I don't understand feedback.", wrong: "90" },
  { n: 16, area: "Engineering", title: "Semiconductor fundamentals", ask: "A silicon diode is in series with a 1000 ohm resistor across 5 V. What current flows? Why is it not 5 mA?", wrong: "5 mA" },
  { n: 17, area: "Computer science", title: "Algorithms", ask: "How many elements does binary search examine in the worst case for 1000 sorted elements? Teach me why.", wrong: "1000" },
  { n: 18, area: "Computer science", title: "Data structures", ask: "I confuse stacks and queues. If I push 5, push 8, pop, push 3, what does the next pop return?", wrong: "5" },
  { n: 19, area: "Computer science", title: "Programming logic", ask: "What does this print? total = 0; for i in range(1, 10, 3): total += i; print(total). I don't follow loops.", wrong: "22" },
  { n: 20, area: "Computer science", title: "Computational complexity", ask: "What is the time complexity of two nested loops that each run n times? Explain Big-O to me.", wrong: "O(n)" },
];

const db = await freshDb();
await db.query("update public.plans set daily_image_limit = null, daily_request_limit = 100000, monthly_request_limit = 100000, requests_per_minute = 10000");
const providers: Record<string, ModelProvider> = canned ? { groq: (await import("./demo-model.ts")).demoProvider } : buildProviders({ GROQ_API_KEY: process.env.GROQ_API_KEY });
const pause = () => new Promise(r => setTimeout(r, canned ? 0 : Number(process.env.PAUSE_MS ?? 9000)));   // inside free-tier limits
const events: Record<string, unknown>[] = [];
const deps = { repo: pgRepo(db), providers, log: (e: Record<string, unknown>) => events.push(e) };

const only = process.env.ONLY ? Number(process.env.ONLY) : null;
const out: string[] = [`# Menya 5 live evaluation`, ``,
  `Run ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC with ${canned ? "**canned replies (a check of this script only; says nothing about teaching)**" : "the production model"}.`, ``,
  `Automatic columns are structural. The last three columns are for a subject teacher: is it correct, is it well taught, would a first-year follow it.`, ``];
const summary: string[] = [`| # | Topic | Lesson taught first | Law or rule named | Arithmetic lines checked / not holding | Wrong answer: step given away | Changed approach | "I don't know": helped | Correct? | Well taught? | Reviewer notes |`, `|---|---|---|---|---|---|---|---|---|---|---|`];
const yes = (b: boolean | null) => (b == null ? "n/a" : b ? "yes" : "**no**");

const from = Number(process.env.FROM ?? 1), to = Number(process.env.TO ?? 99);
let dailyLimit = false;
for (const topic of TOPICS.filter(t => (only == null ? t.n >= from && t.n <= to : t.n === only))) {
  if (dailyLimit) break;
  const user = await createUser(db);
  let sessionId: string | null = null;
  const turns: { said: string; status: number; message: string; body: any }[] = [];
  for (const said of [topic.ask, topic.wrong, "I don't know", "Give me a harder problem"]) {
    events.length = 0;
    // The free tier limits tokens per minute. "Busy" means wait and ask again, not move on; a wait of
    // more than ten minutes means the daily allowance is used up, and the run stops there.
    let res = await handleTutor(deps, user, { requestId: randomUUID(), action: "message", message: said, sessionId });
    for (let tryNo = 0; tryNo < 6 && res.status === 503; tryNo++) {
      const wait = Number((res.body as any).retry_after_seconds ?? 60);
      if (wait > 600) { console.log(`The AI provider asks to wait ${Math.ceil(wait / 60)} minutes: today's allowance is used up. Stopping; run again later with ONLY=${topic.n} or FROM=${topic.n}.`); dailyLimit = true; break; }
      console.log(`   busy, waiting ${Math.max(wait, 20) + 5} s (try ${tryNo + 1} of 6)`);
      await new Promise(r => setTimeout(r, (Math.max(wait, 20) + 5) * 1000));
      events.length = 0;
      res = await handleTutor(deps, user, { requestId: randomUUID(), action: "message", message: said, sessionId });
    }
    const body: any = res.body;
    sessionId = body.sessionId ?? sessionId;
    turns.push({ said, status: res.status, message: body.reply?.message ?? `(${body.error}: ${body.message ?? ""})`, body: { ...body, events: events.map(e => e.event) } });
    console.log(`${topic.n}. ${topic.title}: "${said.slice(0, 40)}" -> ${res.status} ${body.engine?.state ?? ""}`);
    if (res.status !== 200) break;
    await pause();
  }
  const [lesson, afterWrong, afterStuck] = turns;
  const sections = lesson ? parseLesson(lesson.message).sections.map(s => s.id) : [];
  const arithmetic = turns.map(t => checkArithmetic(t.message));
  const named = topic.mustName ? Boolean(lesson && topic.mustName.test(lesson.message)) : null;
  const gaveAway = afterWrong ? statesCorrection(afterWrong.message, topic.wrong) : null;
  // "Changed approach": the reply to the wrong answer is not the lesson again and is in a re-teaching state.
  const changed = afterWrong && afterWrong.status === 200 ? ["EXPLAIN", "HINT", "MODEL", "GUIDE", "PREREQ"].includes(afterWrong.body.engine?.state) && afterWrong.message !== lesson.message : null;
  const helped = afterStuck && afterStuck.status === 200 ? ["HINT", "EXPLAIN", "MODEL", "PREREQ"].includes(afterStuck.body.engine?.state) : null;
  summary.push(`| ${topic.n} | ${topic.title} | ${yes(sections.includes("idea") || sections.includes("example"))} | ${yes(named)} | ${arithmetic.reduce((n, a) => n + a.checked, 0)} / ${arithmetic.reduce((n, a) => n + a.problems.length, 0)} | ${gaveAway == null ? "n/a" : gaveAway ? "**yes**" : "no"} | ${yes(changed)} | ${yes(helped)} | | | |`);
  out.push(`## ${topic.n}. ${topic.area}: ${topic.title}`, ``);
  turns.forEach((t, i) => {
    const a = arithmetic[i];
    const extras = t.status === 200 ? [t.body.lab && `interactive: ${t.body.lab.kind}`, t.body.quiz && `multiple choice: ${t.body.quiz.options.length} options`, t.body.accuracy?.example && `worked example: ${t.body.accuracy.example}`].filter(Boolean).join(", ") : "";
    out.push(`**Student:** ${t.said}`, ``, `**Menya** (${t.status === 200 ? `${t.body.engine?.state}, ${t.body.engine?.format}${t.body.diagram ? `, picture: ${t.body.diagram.kind}` : ""}${extras ? `, ${extras}` : ""}` : `failed ${t.status}`}):`, ``,
      ...stripLessonMarkers(t.message).split("\n").map(l => `> ${l}`), ``,
      `Server checks: ${a.checked} arithmetic line(s) recomputed${a.problems.length ? `, **${a.problems.length} do not hold**: ${a.problems.map(p => `«${p.statement}»`).join("; ")}` : ""}` +
      `${t.body.accuracy?.unverified?.length ? `; shown to the student as not confirmed` : ""}; pipeline events: ${t.body.events.filter((e: string) => /arithmetic|correction|teach_first|answer_recheck|answer_leak|answer_redacted|reference_example/.test(e)).join(", ") || "none"}.`, ``);
  });
}
out.splice(6, 0, ...summary, ``);
// A partial run (ONLY, FROM, TO) gets its own file, so it never overwrites a full one.
const part = only != null ? `_TOPIC_${only}` : from > 1 || to < 99 ? `_${from}_TO_${Math.min(to, TOPICS.length)}` : "";
const file = canned ? "MENYA5_EVAL_CANNED_CHECK.md" : `MENYA5_EVAL_RESULTS${part}.md`;
writeFileSync(`../docs/${file}`, out.join("\n"));
console.log(`\nWritten to docs/${file}`);
