// Test database: real Postgres (PGlite, in-process) with the minimum of
// Supabase's auth schema and roles, then every migration applied in order.
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "..", "migrations");

const SUPABASE_STUBS = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

export async function freshDb() {
  const db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  for (const file of readdirSync(migrationsDir).filter(f => f.endsWith(".sql")).sort()) {
    try {
      await db.exec(readFileSync(join(migrationsDir, file), "utf8"));
    } catch (err) {
      throw new Error(`migration ${file} failed: ${(err as Error).message}`);
    }
  }
  return db;
}

export async function createUser(db: PGlite, email = `${randomUUID().slice(0, 8)}@test.dev`) {
  const id = randomUUID();
  await db.query("insert into auth.users (id, email) values ($1, $2)", [id, email]);
  return id;
}

// Runs fn as a signed-in browser user (role authenticated + JWT sub), the
// way PostgREST would, so RLS policies apply.
export async function asUser<T>(db: PGlite, userId: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${userId}', false);`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

export async function rpc<T = any>(db: PGlite, fn: string, args: Record<string, unknown>): Promise<T> {
  const names = Object.keys(args);
  const params = names.map((n, i) => `${n} => $${i + 1}`).join(", ");
  const res = await db.query(`select public.${fn}(${params}) as result`, names.map(n => {
    const v = args[n];
    return v !== null && typeof v === "object" ? JSON.stringify(v) : v;
  }));
  return (res.rows[0] as any).result as T;
}
