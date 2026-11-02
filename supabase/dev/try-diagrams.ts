// Real-model check of pictures: asks for drawings across subjects and languages and writes what
// passes the safety check to a folder, to look at. Needs GROQ_API_KEY (../menya/.env).
//   cd supabase && node dev/try-diagrams.ts <output folder>
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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
const out = process.argv[2];
const db = await freshDb();
const repo = pgRepo(db);
const providers = buildProviders({ GROQ_API_KEY: process.env.GROQ_API_KEY });
// With an extra argument: only the cases whose name contains it, printing what the model described.
const only = process.argv[3];
if (only) {
  const chat = providers.groq.chat.bind(providers.groq);
  providers.groq.chat = async (c, r) => { const res = await chat(c, r); try { console.log(JSON.stringify(JSON.parse(res.text).diagram)); } catch { /* not JSON */ } return res; };
}
const cases = [
  ["series-circuit", "Draw a 12 V battery connected to two resistors of 4 ohm and 2 ohm in series, with the current direction."],
  ["right-triangle", "Draw a right-angled triangle and show which sides are opposite, adjacent and hypotenuse for the angle theta."],
  ["forces-incline", "Draw the forces on a block resting on a slope. Explain with a picture."],
  ["graph-parabola", "Sketch the graph of y = x^2 - 4 and mark where it crosses the axes."],
  ["binary-search", "Show me a picture of how binary search narrows down a sorted list of 8 numbers."],
  ["water-cycle", "Draw the water cycle for me."],
  ["atom-sodium", "Draw the electron shells of a sodium atom."],
  ["parallel", "Draw a 9 V battery with two 6 ohm resistors in parallel."],
  ["bars", "Plot a bar chart of these marks: Ana 60, Eric 75, Grace 90."],
  ["kinyarwanda", "Nshushanyiriza umuzunguruko w'amashanyarazi ufite bateri n'itara rimwe."],
];
const log: string[] = [];
for (const [name, message] of cases) {
  if (only && !name.includes(only)) continue;
  const user = await createUser(db);
  await db.query("update public.plans set daily_image_limit = null where id = 'free'");
  const t = Date.now();
  const r = await handleTutor({ repo, providers, log: e => { if (e.event === "diagram" || e.event === "provider_error") log.push(`  ${name}: ${JSON.stringify(e)}`); } }, user,
    { requestId: randomUUID(), action: "message", message, mode: "explain" });
  const b = r.body as any;
  console.log(`${name}: status ${r.status}, ${((Date.now() - t) / 1000).toFixed(1)} s, picture ${b.diagram ? `yes (${b.diagram.svg.length} chars)` : "no"}`);
  console.log(`  ${String(b.reply?.message ?? b.error).slice(0, 200).replace(/\n/g, " ")}`);
  if (b.diagram) writeFileSync(join(out, `${name}.svg`), b.diagram.svg);
  await new Promise(res => setTimeout(res, 12000));   // shared free-tier limits
}
console.log(log.join("\n"));
process.exit(0);
