// ============================================================
// Model providers behind one interface. Provider-specific request
// formats, reasoning settings and error shapes stay in this file.
// ============================================================
import Anthropic from "@anthropic-ai/sdk";

export interface ModelConfig {
  role: string;
  provider: "groq" | "anthropic" | "openai_compatible";
  model: string;
  enabled: boolean;
  is_premium: boolean;
  input_usd_per_mtok: number;
  output_usd_per_mtok: number;
  timeout_ms: number;
  max_output_tokens: number;
  options: Record<string, unknown>;
  fallback_role: string | null;
}

export interface ChatMessage { role: "user" | "assistant"; content: string }

export interface ChatRequest {
  system: string;
  messages: ChatMessage[];
  schema: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface ChatResult {
  text: string;
  inputTokens: number | null;   // provider-reported
  outputTokens: number | null;  // provider-reported (includes hidden reasoning where the provider bills it)
  latencyMs: number;
  ttftMs: number | null;        // null: these calls are not streamed
}

export type ProviderErrorKind = "timeout" | "rate_limited" | "auth" | "unavailable" | "bad_request" | "refused" | "cancelled";

// Messages are safe to log: never contain keys or provider response bodies.
export class ProviderError extends Error {
  kind: ProviderErrorKind;
  provider: string;
  status?: number;
  retryAfterMs?: number;
  constructor(kind: ProviderErrorKind, provider: string, status?: number, retryAfterMs?: number) {
    super(`${provider}: ${kind}${status ? ` (${status})` : ""}`);
    this.kind = kind;
    this.provider = provider;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
  get retryable() { return this.kind === "timeout" || this.kind === "rate_limited" || this.kind === "unavailable"; }
}

export interface ModelProvider {
  name: string;
  chat(config: ModelConfig, req: ChatRequest): Promise<ChatResult>;
  health(): Promise<{ ok: boolean; detail?: string }>;
}

export function estimateCostUsd(config: ModelConfig, r: Pick<ChatResult, "inputTokens" | "outputTokens">): number | null {
  if (r.inputTokens == null || r.outputTokens == null) return null;
  return (r.inputTokens * Number(config.input_usd_per_mtok) + r.outputTokens * Number(config.output_usd_per_mtok)) / 1e6;
}

function withTimeout(ms: number, outer?: AbortSignal) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error("timeout")), ms);
  const onOuter = () => ctrl.abort(new Error("cancelled"));
  outer?.addEventListener("abort", onOuter, { once: true });
  return { signal: ctrl.signal, done: () => { clearTimeout(timer); outer?.removeEventListener("abort", onOuter); } };
}

function kindForStatus(status: number): ProviderErrorKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate_limited";
  if (status === 400 || status === 404 || status === 422) return "bad_request";
  return "unavailable";
}

// ------------------------------------------------------------
// OpenAI-compatible chat completions: Groq, vLLM, Ollama, LM Studio...
// ------------------------------------------------------------
export interface OpenAICompatibleOptions {
  name: string;
  baseUrl: string;            // e.g. https://api.groq.com/openai/v1 or http://gpu-host:8000/v1
  apiKey?: string;
  fetchImpl?: typeof fetch;
  // Groq: strict json_schema + hidden reasoning. Local servers: json_schema
  // support varies (vLLM yes, older Ollama only json_object) — configurable.
  jsonMode?: "json_schema_strict" | "json_schema" | "json_object";
  hideReasoning?: boolean;
}

export function openAICompatibleProvider(o: OpenAICompatibleOptions): ModelProvider {
  const doFetch = o.fetchImpl ?? fetch;
  const headers = { "Content-Type": "application/json", ...(o.apiKey ? { Authorization: `Bearer ${o.apiKey}` } : {}) };
  return {
    name: o.name,
    async chat(config, req) {
      const jsonMode = (config.options.json_mode as string) ?? o.jsonMode ?? "json_schema_strict";
      const body: Record<string, unknown> = {
        model: config.model,
        messages: [{ role: "system", content: req.system }, ...req.messages],
        max_completion_tokens: config.max_output_tokens,
        temperature: (config.options.temperature as number) ?? 0.4,
        response_format: jsonMode === "json_object"
          ? { type: "json_object" }
          : { type: "json_schema", json_schema: { name: "tutor_reply", strict: jsonMode === "json_schema_strict", schema: req.schema } },
      };
      if (config.options.reasoning_effort) body.reasoning_effort = config.options.reasoning_effort;
      if (o.hideReasoning) body.include_reasoning = false;

      const t = withTimeout(config.timeout_ms, req.signal);
      const started = Date.now();
      let res: Response;
      try {
        res = await doFetch(`${o.baseUrl}/chat/completions`, { method: "POST", headers, body: JSON.stringify(body), signal: t.signal });
      } catch (err) {
        t.done();
        const reason = String((t.signal.reason as Error)?.message ?? err);
        throw new ProviderError(reason.includes("cancelled") ? "cancelled" : reason.includes("timeout") ? "timeout" : "unavailable", o.name);
      }
      t.done();
      if (!res.ok) {
        const retryAfter = Number(res.headers.get("retry-after"));
        await res.body?.cancel();
        throw new ProviderError(kindForStatus(res.status), o.name, res.status, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined);
      }
      const data = await res.json();
      return {
        text: data?.choices?.[0]?.message?.content ?? "",
        inputTokens: data?.usage?.prompt_tokens ?? null,
        outputTokens: data?.usage?.completion_tokens ?? null,
        latencyMs: Date.now() - started,
        ttftMs: null,
      };
    },
    async health() {
      const t = withTimeout(5000);
      try {
        const res = await doFetch(`${o.baseUrl}/models`, { headers, signal: t.signal });
        await res.body?.cancel();
        return { ok: res.ok, detail: res.ok ? undefined : `HTTP ${res.status}` };
      } catch {
        return { ok: false, detail: "unreachable" };
      } finally { t.done(); }
    },
  };
}

// ------------------------------------------------------------
// Anthropic (premium reasoning tier)
// ------------------------------------------------------------
export function anthropicProvider(apiKey: string, client?: Anthropic): ModelProvider {
  const anthropic = client ?? new Anthropic({ apiKey, maxRetries: 0 }); // retries are the router's job
  return {
    name: "anthropic",
    async chat(config, req) {
      const started = Date.now();
      try {
        const response = await anthropic.beta.messages.create({
          model: config.model,
          max_tokens: config.max_output_tokens,
          system: req.system,
          messages: req.messages,
          output_config: {
            effort: (config.options.effort as "low" | "medium" | "high") ?? "medium",
            format: { type: "json_schema", schema: req.schema },
          },
          // Refused requests are retried server-side on a model chosen by refusal category.
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
        } as any, { timeout: config.timeout_ms, signal: req.signal });

        if (response.stop_reason === "refusal") throw new ProviderError("refused", "anthropic");
        const text = response.content
          .filter((b: { type: string }) => b.type === "text")
          .map((b: { type: string; text?: string }) => b.text ?? "")
          .join("");
        return {
          text,
          inputTokens: response.usage?.input_tokens ?? null,
          outputTokens: response.usage?.output_tokens ?? null,
          latencyMs: Date.now() - started,
          ttftMs: null,
        };
      } catch (err) {
        if (err instanceof ProviderError) throw err;
        if (err instanceof Anthropic.APIConnectionTimeoutError) throw new ProviderError("timeout", "anthropic");
        if (err instanceof Anthropic.APIUserAbortError) throw new ProviderError("cancelled", "anthropic");
        if (err instanceof Anthropic.RateLimitError) throw new ProviderError("rate_limited", "anthropic", 429);
        if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) throw new ProviderError("auth", "anthropic", 401);
        if (err instanceof Anthropic.BadRequestError) throw new ProviderError("bad_request", "anthropic", 400);
        if (err instanceof Anthropic.APIError) throw new ProviderError("unavailable", "anthropic", err.status);
        throw new ProviderError("unavailable", "anthropic");
      }
    },
    async health() {
      try {
        await anthropic.models.list({ limit: 1 } as any);
        return { ok: true };
      } catch (err) {
        return { ok: false, detail: err instanceof Anthropic.APIError ? `HTTP ${err.status}` : "unreachable" };
      }
    },
  };
}

// ------------------------------------------------------------
// Registry built from server-side configuration (env vars / secrets).
// Providers without credentials are simply absent; the router skips them.
// ------------------------------------------------------------
export interface ProviderEnv {
  GROQ_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  LOCAL_LLM_BASE_URL?: string;
  LOCAL_LLM_API_KEY?: string;
  LOCAL_LLM_JSON_MODE?: string;
}

export function buildProviders(env: ProviderEnv): Record<string, ModelProvider> {
  const providers: Record<string, ModelProvider> = {};
  if (env.GROQ_API_KEY) {
    providers.groq = openAICompatibleProvider({
      name: "groq", baseUrl: "https://api.groq.com/openai/v1", apiKey: env.GROQ_API_KEY,
      jsonMode: "json_schema_strict", hideReasoning: true,
    });
  }
  if (env.ANTHROPIC_API_KEY) providers.anthropic = anthropicProvider(env.ANTHROPIC_API_KEY);
  if (env.LOCAL_LLM_BASE_URL) {
    providers.openai_compatible = openAICompatibleProvider({
      name: "openai_compatible", baseUrl: env.LOCAL_LLM_BASE_URL.replace(/\/$/, ""), apiKey: env.LOCAL_LLM_API_KEY,
      jsonMode: (env.LOCAL_LLM_JSON_MODE as OpenAICompatibleOptions["jsonMode"]) ?? "json_schema",
    });
  }
  return providers;
}
