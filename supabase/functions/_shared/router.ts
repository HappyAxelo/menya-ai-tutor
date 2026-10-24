// ============================================================
// Model routing: which configured model serves this request.
// Pure functions; all inputs come from server-side state.
// ============================================================
import type { ModelConfig } from "./providers.ts";
import type { Difficulty } from "./policy.ts";

export type RoutingPolicy = "free" | "pro" | "professional";

// Roles each plan may ever use (including fallbacks).
const ALLOWED_ROLES: Record<RoutingPolicy, string[]> = {
  free: ["local_small", "small", "medium"],
  pro: ["local_small", "small", "medium", "strong"],
  professional: ["local_small", "small", "medium", "strong", "premium"],
};

// Cheap, explainable signal; the model's own difficulty rating from the
// previous turn (stored on the session) refines it.
export function classifyDifficulty(message: string, previous?: Difficulty | null): Difficulty {
  const text = message.toLowerCase();
  let score = 0;
  if (message.length > 400) score += 2; else if (message.length > 150) score += 1;
  if (/\b(prove|proof|derive|derivation|demonstrate|montrer|démontrer|thibitisha)\b/.test(text)) score += 2;
  if (/(∫|∑|∂|\bintegral|\blimit\b|eigen|laplace|fourier|differential equation|recurrence|np-|big-?o|complexity|matrix|thermodynamic|entropy|kirchhoff|phasor)/.test(text)) score += 1;
  if ((message.match(/[=+\-*/^]/g) ?? []).length > 8) score += 1;
  if (/```|def |function |class |#include/.test(message)) score += 1;
  if (previous === "complex") score += 2; else if (previous === "standard") score += 1;
  return score >= 3 ? "complex" : score >= 1 ? "standard" : "basic";
}

export interface RouteInput {
  policy: RoutingPolicy;
  difficulty: Difficulty;
  premiumRemaining: number;      // from the entitlement, after safety margin
  configs: Record<string, ModelConfig>;
  availableProviders: Set<string>;
}

export interface RouteCandidate { role: string; config: ModelConfig; premium: boolean; fallback: boolean }

function usable(role: string, input: RouteInput): ModelConfig | null {
  const c = input.configs[role];
  if (!c || !c.enabled || !input.availableProviders.has(c.provider)) return null;
  if (!ALLOWED_ROLES[input.policy].includes(role)) return null;
  if (c.is_premium && input.premiumRemaining <= 0) return null;
  return c;
}

function preferredRoles(policy: RoutingPolicy, difficulty: Difficulty): string[] {
  switch (policy) {
    case "free":
      // Not "small": gpt-oss-20b never filled the private finalAnswer in testing, so the
      // answer guard couldn't protect it, and it made more factual errors (docs/EVALUATION.md).
      return ["local_small", "medium"];
    case "pro":
      return difficulty === "complex" ? ["strong", "medium"] : ["medium"];
    case "professional":
      // Routine tutoring stays on the strong standard model; only complex
      // reasoning spends the premium allowance.
      return difficulty === "complex" ? ["premium", "strong"] : ["strong"];
  }
}

// Ordered list: the first entry is the primary choice, the rest are
// fallbacks (configured fallback_role chain, bounded to 3 attempts).
export function planRoute(input: RouteInput): RouteCandidate[] {
  const out: RouteCandidate[] = [];
  const seen = new Set<string>();
  const add = (role: string | null | undefined, fallback: boolean) => {
    while (role && !seen.has(role) && out.length < 3) {
      seen.add(role);
      const c = usable(role, input);
      // Fallback chains cover runtime failures of a usable model; an unusable
      // (disabled, no credentials, no allowance) role doesn't hand off its chain.
      if (!c) break;
      out.push({ role, config: c, premium: c.is_premium, fallback: fallback || out.length > 0 });
      role = input.configs[role]?.fallback_role ?? null;
      fallback = true;
    }
  };
  for (const role of preferredRoles(input.policy, input.difficulty)) add(role, false);
  return out;
}
