// ============================================================
// Local development backend: runs the real API (handleApi) and the real
// SQL (PGlite) on http://localhost:54321, emulating only the few Supabase
// endpoints the web app uses. For development and demos only: auth is a
// fake token per seeded user, data lives in memory.
//
//   cd supabase && npm run dev:local
//   cd menya && VITE_SUPABASE_URL=http://localhost:54321 VITE_SUPABASE_ANON_KEY=local npm run dev
//
// Model calls are real if GROQ_API_KEY / ANTHROPIC_API_KEY are set (it also
// reads ../menya/.env); otherwise the tutor answers "unavailable".
// ============================================================
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { freshDb, asUser, rpc } from "../tests/db.ts";
import { pgRepo } from "../tests/pgRepo.ts";
import { handleApi, DbError, type ApiContext } from "../functions/_shared/api.ts";
import { buildProviders } from "../functions/_shared/providers.ts";

const PORT = Number(process.env.PORT ?? 54321);
for (const f of ["../menya/.env", ".env"]) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m && m[2] && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const db = await freshDb();

// Seed: a learner, an admin (platform admin + org admin of a pilot university).
const USERS = {
  learner: { id: "00000000-0000-4000-8000-000000000001", email: "learner@menya.local" },
  admin: { id: "00000000-0000-4000-8000-000000000002", email: "admin@menya.local" },
};
for (const u of Object.values(USERS)) await db.query("insert into auth.users (id, email) values ($1, $2)", [u.id, u.email]);
await db.query("update public.profiles set platform_role = 'admin' where id = $1", [USERS.admin.id]);
const org = (await db.query<any>("insert into public.organizations (name, slug, plan_id, purchased_seats) values ('Demo University', 'demo-university', 'pro', 25) returning id")).rows[0].id;
await db.query("insert into public.org_members (org_id, user_id, role, seat_assigned) values ($1, $2, 'org_admin', false)", [org, USERS.admin.id]);
const tokens = new Map(Object.values(USERS).map(u => [`local_${u.id}`, u]));

const providers = buildProviders({ GROQ_API_KEY: process.env.GROQ_API_KEY, ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY });
const ctx: ApiContext = {
  repo: pgRepo(db),
  db: { async rpc(fn, args) { try { return await rpc(db, fn, args); } catch (e: any) { throw new DbError(e.message, e.code); } } },
  providers,
  billing: null,
  async getUser(jwt) { return tokens.get(jwt) ?? null; },
  async deleteUser(id) { await db.query("delete from auth.users where id = $1", [id]); },
  appUrl: "http://localhost:5173/menya-ai-tutor",
  allowedOrigins: ["http://localhost:5173"],
  log: (e) => { if (e.level !== "info") console.log(JSON.stringify(e)); },
};

const CORS = {
  "Access-Control-Allow-Origin": "http://localhost:5173",
  "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey, prefer, accept-profile, content-profile, x-supabase-api-version",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, PATCH, OPTIONS",
};

async function body(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

function send(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { "Content-Type": "application/json", ...CORS });
  res.end(data === undefined ? "" : JSON.stringify(data));
}

createServer(async (req, res) => {
  const url = new URL(req.url!, `http://localhost:${PORT}`);
  if (req.method === "OPTIONS") { res.writeHead(204, CORS); return res.end(); }
  const user = tokens.get(req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "");
  try {
    if (url.pathname.startsWith("/functions/v1/api")) {
      const raw = req.method === "GET" || req.method === "HEAD" ? undefined : await body(req);
      const r = await handleApi(new Request(url, { method: req.method, headers: req.headers as any, body: raw }), ctx);
      // handleApi already sets CORS headers for allowed origins.
      res.writeHead(r.status, Object.fromEntries(r.headers));
      return res.end(Buffer.from(await r.arrayBuffer()));
    }
    if (url.pathname === "/auth/v1/user") return user ? send(res, 200, { id: user.id, email: user.email, aud: "authenticated" }) : send(res, 401, { msg: "invalid" });
    if (url.pathname === "/auth/v1/logout") return send(res, 204, undefined);
    if (url.pathname === "/rest/v1/rpc/my_account" && user) {
      return send(res, 200, await asUser(db, user.id, async () => (await db.query<any>("select public.my_account() as a")).rows[0].a));
    }
    if (url.pathname === "/rest/v1/tutoring_sessions" && user) {
      if (req.method === "DELETE") {
        const id = url.searchParams.get("id")?.replace(/^eq\./, "");
        await asUser(db, user.id, () => db.query("delete from public.tutoring_sessions where id = $1", [id]));
        return send(res, 204, undefined);
      }
      const id = url.searchParams.get("id")?.replace(/^eq\./, "");
      const cols = "id, title, language, turn_count, hints_used, attempts, practice, solved, examples_used, problems_solved, updated_at";
      const rows = await asUser(db, user.id, async () => (await db.query(id
        ? `select ${cols} from public.tutoring_sessions where id = $1`
        : `select ${cols} from public.tutoring_sessions order by updated_at desc limit 50`, id ? [id] : [])).rows);
      // supabase-js .single() asks for one object instead of an array.
      if (String(req.headers.accept ?? "").includes("vnd.pgrst.object")) return rows[0] ? send(res, 200, rows[0]) : send(res, 406, { message: "not found" });
      return send(res, 200, rows);
    }
    if (url.pathname === "/rest/v1/tutoring_messages" && user) {
      const sid = url.searchParams.get("session_id")?.replace(/^eq\./, "");
      return send(res, 200, await asUser(db, user.id, async () => (await db.query(
        "select role, content, meta from public.tutoring_messages where session_id = $1 order by id", [sid])).rows));
    }
    if (url.pathname === "/rest/v1/learning_events" && user) {
      return send(res, 200, await asUser(db, user.id, async () => (await db.query(
        "select kind, concepts, hints_used, examples_used, attempts, created_at from public.learning_events order by created_at desc limit 1000")).rows));
    }
    send(res, 404, { error: "not emulated", path: url.pathname });
  } catch (err) {
    console.error(err);
    send(res, 500, { error: "local server error" });
  }
}).listen(PORT, () => {
  console.log(`Menya local backend on http://localhost:${PORT}`);
  console.log(`Model providers: ${Object.keys(providers).join(", ") || "none (set GROQ_API_KEY)"}`);
  for (const [name, u] of Object.entries(USERS)) console.log(`  ${name}: token local_${u.id}  (${u.email})`);
});
