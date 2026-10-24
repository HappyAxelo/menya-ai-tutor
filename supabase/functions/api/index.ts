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

const providers = buildProviders({
  GROQ_API_KEY: env("GROQ_API_KEY"),
  ANTHROPIC_API_KEY: env("ANTHROPIC_API_KEY"),
  LOCAL_LLM_BASE_URL: env("LOCAL_LLM_BASE_URL"),
  LOCAL_LLM_API_KEY: env("LOCAL_LLM_API_KEY"),
  LOCAL_LLM_JSON_MODE: env("LOCAL_LLM_JSON_MODE"),
});

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
  appUrl: required("APP_URL").replace(/\/$/, ""),
  allowedOrigins: (env("ALLOWED_ORIGINS") ?? "").split(",").map(s => s.trim()).filter(Boolean),
  // Structured logs (visible in the Supabase dashboard). Never log message content or keys.
  log: (event) => console.log(JSON.stringify({ ts: new Date().toISOString(), ...event })),
};

Deno.serve((req) => handleApi(req, ctx));
