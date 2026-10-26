// Runs real conversations through the full tutor pipeline (local PGlite database,
// real Groq models) to check reply languages. Needs GROQ_API_KEY (reads ../menya/.env).
//   cd supabase && node dev/try-languages.ts
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

async function conversation(title: string, language: string, turns: (string | { action: string })[]) {
  console.log(`\n=== ${title} (setting: ${language}) ===`);
  const user = await createUser(db);
  let sessionId: string | null = null;
  for (const t of turns) {
    const body = typeof t === "string"
      ? { requestId: randomUUID(), sessionId, action: "message", message: t, language }
      : { requestId: randomUUID(), sessionId, action: t.action, language };
    const res = await handleTutor(deps, user, body);
    const r = res.body.reply as any;
    sessionId = (res.body.sessionId as string) ?? sessionId;
    console.log(`> ${typeof t === "string" ? t : `[${t.action}]`}`);
    console.log(res.status === 200 ? `< (${r.language}, ${r.type}) ${r.message}` : `< HTTP ${res.status} ${JSON.stringify(res.body)}`);
  }
}

if (!process.env.ONLY_CHOSEN) await conversation("Kinyarwanda arithmetic", "auto", ["rimwe guteranyaho rimwe ni kangahe?"]);
if (!process.env.ONLY_CHOSEN) await conversation("Kinyarwanda physics", "auto",
  ["Imodoka igenda ibilometero 120 mu masaha 2. Umuvuduko wayo ni uwuhe?", { action: "hint" }, "ni 60 km/h"]);
await conversation("English chosen, then asked to switch", "English",
  ["Imodoka igenda ibilometero 120 mu masaha 2. Umuvuduko wayo ni uwuhe?", "vuga ikinyarwanda"]);
