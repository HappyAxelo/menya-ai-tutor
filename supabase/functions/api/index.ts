// Supabase Edge Function entry point: wires real clients into the API.
// Deploy: supabase functions deploy api   (verify_jwt is off in config.toml;
// the API verifies tokens itself so webhooks and public routes work.)
import { createClient } from "@supabase/supabase-js";
import { handleApi, DbError, type ApiContext } from "../_shared/api.ts";
import { supabaseRepo } from "../_shared/repo.ts";
import { buildProviders } from "../_shared/providers.ts";
import { buildBillingProvider } from "../_shared/billing.ts";

const env = (k: string) => Deno.env.get(k) ?? undefined;
const required = (k: string) => {
  const v = env(k);
  if (!v) throw new Error(`Missing required secret ${k}`);
  return v;
};

// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected by Supabase.
const sb = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

// The HPC model server registers its current address (see hpc/ and docs/HPC.md). A
// registration older than HPC_STALE_SECONDS means the job ended: requests skip it.
const HPC_STALE_MS = Number(env("HPC_STALE_SECONDS") ?? 600) * 1000;
let hpcCache: { at: number; url: string | null } = { at: 0, url: null };
async function hpcBaseUrl(): Promise<string | null> {
  if (Date.now() - hpcCache.at < 20_000) return hpcCache.url;
  const { data } = await sb.from("app_settings").select("value").eq("key", "hpc_llm").maybeSingle();
  const v = data?.value as { url?: string; at?: string } | undefined;
  const fresh = v?.url && v.at && Date.now() - Date.parse(v.at) < HPC_STALE_MS;
  hpcCache = { at: Date.now(), url: fresh ? `${v!.url}/v1` : null };
  return hpcCache.url;
}

const providers = buildProviders({
  GROQ_API_KEY: env("GROQ_API_KEY"),
  ANTHROPIC_API_KEY: env("ANTHROPIC_API_KEY"),
  LOCAL_LLM_BASE_URL: env("LOCAL_LLM_BASE_URL"),
  LOCAL_LLM_API_KEY: env("LOCAL_LLM_API_KEY"),
  LOCAL_LLM_JSON_MODE: env("LOCAL_LLM_JSON_MODE"),
}, env("HPC_REGISTER_SECRET") ? hpcBaseUrl : undefined);

const ctx: ApiContext = {
  repo: supabaseRepo(sb),
  db: {
    async rpc(fn, args) {
      const { data, error } = await sb.rpc(fn, args);
      if (error) throw new DbError(error.message, error.code);
      return data;
    },
  },
  providers,
  billing: buildBillingProvider({
    BILLING_PROVIDER: env("BILLING_PROVIDER"),
    BILLING_TEST_WEBHOOK_SECRET: env("BILLING_TEST_WEBHOOK_SECRET"),
    IREMBOPAY_SECRET_KEY: env("IREMBOPAY_SECRET_KEY"),
    IREMBOPAY_PAYMENT_ACCOUNT: env("IREMBOPAY_PAYMENT_ACCOUNT"),
    IREMBOPAY_PLANS: env("IREMBOPAY_PLANS"),
    IREMBOPAY_ENV: env("IREMBOPAY_ENV"),
  }),
  async getUser(jwt) {
    const { data, error } = await sb.auth.getUser(jwt);
    if (error || !data?.user) return null;
    return { id: data.user.id, email: data.user.email ?? null };
  },
  async deleteUser(userId) {
    const { error } = await sb.auth.admin.deleteUser(userId);
    if (error) throw new Error(`delete user: ${error.message}`);
  },
  // Defaults match the public site (menyaneza.com; github.io still allowed), so the only secret the owner
  // must set is the AI provider key. Override with APP_URL / ALLOWED_ORIGINS.
  appUrl: (env("APP_URL") ?? "https://menyaneza.com").replace(/\/$/, ""),
  media: env("GROQ_API_KEY") ? { apiKey: env("GROQ_API_KEY")! } : undefined,
  hpcSecret: env("HPC_REGISTER_SECRET"),
  allowedOrigins: (env("ALLOWED_ORIGINS") ?? "https://menyaneza.com,https://www.menyaneza.com,https://happyaxelo.github.io,http://localhost:5173")
    .split(",").map(s => s.trim()).filter(Boolean),
  // Structured logs (visible in the Supabase dashboard). Never log message content or keys.
  log: (event) => console.log(JSON.stringify({ ts: new Date().toISOString(), ...event })),
};

Deno.serve((req) => handleApi(req, ctx));
