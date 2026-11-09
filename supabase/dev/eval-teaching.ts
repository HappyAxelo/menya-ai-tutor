// Live teaching evaluation: the 13 scenarios with a REAL model, through the real pipeline.
// Writes docs/TEACHING_EVAL_RESULTS.md: every reply word for word, the automatic checks, and blank columns for human reviewers.
//
//   cd supabase
//   node dev/eval-teaching.ts                      needs GROQ_API_KEY (or ../menya/.env); the production model
//                                                  in PowerShell, set it first: $env:GROQ_API_KEY = "your key"
//   OLLAMA_MODEL=llama3 node dev/eval-teaching.ts  a local model, to check the wiring only; say so if you quote it
//   ONLY=8 node dev/eval-teaching.ts               one scenario
//
// The automatic checks cover structure only. Whether an explanation is accurate, natural or well pitched is for
// competent people to decide, and language quality must be judged by fluent speakers.
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { freshDb, createUser } from "../tests/db.ts";
import { pgRepo } from "../tests/pgRepo.ts";
import { handleTutor } from "../functions/_shared/tutorService.ts";
import { buildProviders, openAICompatibleProvider, type ChatRequest, type ModelProvider } from "../functions/_shared/providers.ts";
import { parseLesson, stripLessonMarkers } from "../functions/_shared/lessonFormat.ts";
import { checkTeachingOrder, type LessonFormat } from "../functions/_shared/engine/pedagogy.ts";
import { densityProblems, readability, type TeachingLevel } from "../functions/_shared/language.ts";

for (const f of ["../menya/.env", ".env"]) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m && m[2] && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const local = process.env.OLLAMA_MODEL;
const canned = Boolean(process.env.EVAL_CANNED);     // checks this script itself; its replies are canned and prove nothing about teaching
if (!local && !canned && !process.env.GROQ_API_KEY) { console.error("Set GROQ_API_KEY (or OLLAMA_MODEL for a local wiring check)."); process.exit(1); }

const db = await freshDb();
await db.query("update public.plans set daily_image_limit = null, daily_request_limit = 100000, monthly_request_limit = 100000, requests_per_minute = 10000");
if (local) await db.query(`update public.model_configs set provider = 'groq', model = $1, enabled = true, timeout_ms = 120000, options = '{"json_mode":"json_object"}', fallback_role = null`, [local]);
const providers: Record<string, ModelProvider> = canned ? { groq: (await import("./demo-model.ts")).demoProvider } : local
  ? { groq: openAICompatibleProvider({ name: "groq", baseUrl: process.env.OLLAMA_URL ?? "http://localhost:11434/v1", jsonMode: "json_object" }) }
  : buildProviders({ GROQ_API_KEY: process.env.GROQ_API_KEY });
// A local model has no strict schema mode, so it needs telling what the JSON looks like.
if (local) {
  const inner = providers.groq.chat.bind(providers.groq);
  providers.groq.chat = (c, r: ChatRequest) => inner(c, { ...r, system: `${r.system}\n\nReply with one JSON object with these fields: ${JSON.stringify(Object.keys((r.schema as any).properties))}. "message" is a string holding the whole reply.` });
}
const pause = () => new Promise(r => setTimeout(r, local || canned ? 0 : Number(process.env.PAUSE_MS ?? 9000)));   // inside free-tier limits

type Step = { say?: string; action?: string; stuck?: string };
interface Scenario { n: number; title: string; language?: string; level?: string; steps: Step[]; expectVisual?: boolean; review: string }
const S: Scenario[] = [
  { n: 1, title: "Secondary student learning fractions", level: "lower_secondary", expectVisual: true, steps: [{ say: "I am in S2. I don't understand fractions." }, { say: "2 parts are shaded" }], review: "Maths teacher" },
  { n: 2, title: "Learning photosynthesis", expectVisual: true, steps: [{ say: "Explain photosynthesis" }], review: "Biology teacher" },
  { n: 3, title: "Learning Newton's laws", expectVisual: true, steps: [{ say: "What is Newton's second law? I don't really get it." }], review: "Physics teacher" },
  { n: 4, title: "Learning basic algebra", steps: [{ say: "Solve 2x + 3 = 11" }, { say: "I subtract 3 from both sides" }], review: "Maths teacher" },
  { n: 5, title: "Learning Python loops", expectVisual: true, steps: [{ say: "I don't understand how a for loop works in Python." }], review: "CS teacher" },
  { n: 6, title: "Learning digital logic gates", expectVisual: true, steps: [{ say: "Explain logic gates. Start with AND and OR." }], review: "Electronics teacher" },
  { n: 7, title: "Learning basic electrical circuits", expectVisual: true, steps: [{ say: "Help me understand series circuits." }], review: "Physics or electronics teacher" },
  { n: 8, title: "Explanation in français facile", language: "French", expectVisual: true, steps: [{ say: "Explique-moi la photosynthèse en français facile s'il te plaît." }], review: "Fluent French teacher" },
  { n: 9, title: "Explanation in Kinyarwanda", language: "Kinyarwanda", steps: [{ say: "Nsobanurira umuvuduko icyo ari cyo." }], review: "Fluent Kinyarwanda teacher" },
  { n: 10, title: "Repeated incorrect answers", steps: [{ say: "Solve 3x - 2 = 10" }, { say: "x = 8 because 10 minus 2" }, { say: "x = 12 I added 2" }, { say: "x = 36 I multiplied" }, { say: "x = 3 I divided" }], review: "Maths teacher" },
  { n: 11, title: "A student who doesn't understand", steps: [{ say: "Find the area of a triangle with base 6 and height 4" }, { say: "I don't understand" }, { say: "I don't know" }, { say: "I don't know" }], review: "Maths teacher" },
  { n: 12, title: "Asking for a diagram", expectVisual: true, steps: [{ say: "Show me a diagram of how a series circuit with a 9 V battery and two resistors works." }], review: "Physics teacher" },
  { n: 13, title: "Follows the example, fails alone", steps: [{ say: "Can you help me with Ohm's law?" }, { action: "practice" }, { say: "__CORRECT__" }, { action: "test" }, { say: "__WRONG__" }], review: "Physics teacher" },
];

const out: string[] = [];
const md = (s = "") => { out.push(s); console.log(s); };
const when = new Date().toISOString().slice(0, 10);
md("# Teaching evaluation results"); md();
md(`Run on ${when} with **${canned ? "canned replies, which only check this script" : local ? `${local} on a local machine. This is a wiring check, not the production model, and says little about real teaching quality` : "the production model (Groq)"}**. Every reply below is what the model actually wrote. Student turns are scripted.`); md();
md("The automatic checks look at structure only. **The reviewer columns are blank until competent people fill them in.** Do not describe language quality or accuracy as validated before they do."); md();

const summary: string[] = [];
let total = 0, passed = 0;
for (const sc of S) {
  if (process.env.ONLY && String(sc.n) !== process.env.ONLY) continue;
  md(`## ${sc.n}. ${sc.title}`); md();
  const u = await createUser(db);
  let sessionId: string | undefined, row: any = null;
  const checks = { teachFirst: true, visual: false, explained: false, dense: [] as string[], errors: 0, formats: [] as string[] };
  for (const [i, step] of sc.steps.entries()) {
    await pause();
    let say = step.say;
    if (say === "__CORRECT__" || say === "__WRONG__") {
      row = (await db.query<any>("select item from public.session_items where session_id = $1", [sessionId])).rows[0]?.item;
      const [V, R] = (row?.question?.match(/[\d.]+(?= V| Ω)/g) ?? [12, 4]).map(Number);
      say = say === "__CORRECT__" ? `I = V/R = ${V}/${R} = ${V / R} A` : `I add them: ${V} + ${R} = ${V + R} A`;
    }
    if (i === 1 && sc.n === 13) await db.query("update public.tutoring_sessions set objective = 'ee.ohms_law' where id = $1", [sessionId]);
    let res: any;
    for (let retry = 0; retry < 4; retry++) {
      res = await handleTutor({ repo: pgRepo(db), providers, sleep: pause as any, ...(local ? { budgetMs: 280_000 } : {}) }, u, { requestId: randomUUID(), sessionId, action: step.action ?? "message", message: say, stuck: step.stuck, language: sc.language ?? "auto", learnerLevel: sc.level });
      if (res.status === 200) break;
      console.log(`  (${res.body.error}; waiting)`); await new Promise(r => setTimeout(r, 20000));
    }
    if (res.status !== 200) { md(`**Failed:** ${JSON.stringify(res.body)}`); checks.errors++; continue; }
    sessionId = res.body.sessionId;
    const b = res.body, text: string = b.reply.message, format = b.engine.format as LessonFormat;
    checks.formats.push(format);
    const shape = { format, sections: [], foundation: ["lesson", "demonstrate", "reteach", "prerequisite"].includes(format), visual: "none" } as any;
    const order = checkTeachingOrder(text, shape);
    if (!order.ok) checks.teachFirst = false;
    if (b.diagram) { checks.visual = true; if (parseLesson(text).sections.some(s => s.id === "see")) checks.explained = true; }
    checks.dense.push(...densityProblems(text, (sc.level ?? null) as TeachingLevel | null, b.reply.language));
    const r = readability(text);
    md(`**Student:** ${say ?? `[${step.action}]`}`); md();
    md(`_Engine: ${b.engine.state}, format ${format}, help level ${b.engine.hintLevel ?? "-"}, server verdict ${b.engine.verified ?? "none"}, reply in ${b.reply.language}, ${r.words} words, longest sentence ${r.longestSentence}${order.ok ? "" : `, ORDER PROBLEM: ${order.problems.join(", ")}`}_`); md();
    md(`**Menya:**`); md(); md(stripLessonMarkers(text)); md();
    if (b.diagram) md(`_Visual: ${b.diagram.kind}, "${b.diagram.title}". ${b.diagram.alt}_`), md();
  }
  const automatic = [
    ["Replied without error", checks.errors === 0], ["Taught before asking", checks.teachFirst],
    ...(sc.expectVisual ? [["A visual was shown", checks.visual], ["The visual was explained", checks.explained]] as [string, boolean][] : []),
    ["Language density within the level", checks.dense.length === 0],
  ] as [string, boolean][];
  for (const [, ok] of automatic) { total++; if (ok) passed++; }
  md("| Automatic check | Result |"); md("|---|---|");
  for (const [name, ok] of automatic) md(`| ${name} | ${ok ? "pass" : "**FAIL**"} |`);
  if (checks.dense.length) md(`\nDensity notes: ${[...new Set(checks.dense)].join(", ")}`);
  md();
  md(`| Human review (${sc.review}) | Yes / No | Notes |`); md("|---|---|---|");
  for (const q of ["Was the explanation accurate?", "Was the language right for the level?", "Would a visual have helped, and was one used?", "Was the visual technically correct?", "Did Menya explain the visual?", "Did it demonstrate before asking?", "Was the question appropriate?", "Did it respond intelligently to mistakes?", "Did it guide toward independent problem-solving?"]) md(`| ${q} | | |`);
  md();
  summary.push(`| ${sc.n} | ${sc.title} | ${automatic.filter(a => a[1]).length}/${automatic.length} | ${[...new Set(checks.formats)].join(", ")} | not yet reviewed |`);
}
md("## Summary"); md();
md(`Automatic structural checks passed: ${passed} of ${total}.`); md();
md("| # | Scenario | Automatic | Formats used | Human review |"); md("|---|---|---|---|---|");
for (const s of summary) md(s);
const target = canned ? "TEACHING_EVAL_CANNED.md" : local ? "TEACHING_EVAL_LOCAL.md" : process.env.ONLY ? "TEACHING_EVAL_PART.md" : "TEACHING_EVAL_RESULTS.md";
writeFileSync(new URL(`../../docs/${target}`, import.meta.url), out.join("\n") + "\n");
console.log(`\nWrote docs/${target}`);
process.exit(0);
