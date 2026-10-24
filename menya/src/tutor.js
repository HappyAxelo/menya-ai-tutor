// ============================================================
// DEVELOPER MODE TUTOR — calls Groq directly with the developer's own key.
// Used when the app runs without a backend (no VITE_SUPABASE_URL), and by
// scripts/eval-tutor.mjs. The commercial app calls the backend instead.
// ============================================================
import { buildResponseSchema, buildSystemPrompt as buildPolicyPrompt, hintRequest, parseTutorJson } from "../../supabase/functions/_shared/policy.ts";

export function buildSystemPrompt(language = "auto") {
  return buildPolicyPrompt({ language, workedSolutions: true });
}

// gpt-oss-120b reasons privately before answering, which lets it solve the
// problem itself (so hints are accurate) without sending the solution to the
// browser (include_reasoning: false). It is also far stronger than
// llama-3.3-70b in non-English languages.
export const MODEL = "openai/gpt-oss-120b";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

export const LANGUAGES = [
  { code: "auto", label: "Auto-detect" },
  { code: "English", label: "English" },
  { code: "Kinyarwanda", label: "Kinyarwanda" },
  { code: "French", label: "Français" },
  { code: "Swahili", label: "Kiswahili" },
  { code: "Spanish", label: "Español" },
  { code: "Portuguese", label: "Português" },
  { code: "Arabic", label: "العربية" },
  { code: "Chinese", label: "中文" },
];

// The tutoring policy is shared with the backend so every model follows the
// same rules. Developer mode asks for no private fields (they would reach the browser).
export const RESPONSE_SCHEMA = buildResponseSchema(false);
export { hintRequest, parseTutorJson };

function fallbackResponse(message) {
  return {
    language: "",
    message,
    type: "question",
    conceptsDetected: [],
    misconceptionDetected: null,
    hintLevel: null,
    progressSummary: null,
    encouragementScore: 3,
  };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Groq's free tier allows ~8k tokens/minute for this model, so a few quick
// messages hit 429. Read the suggested wait from the error ("try again in 7.25s").
function retryDelayMs(err) {
  const m = /try again in (?:(\d+)m)?([\d.]+)s/i.exec(err.message || "");
  const seconds = m ? Number(m[1] || 0) * 60 + Number(m[2]) : 10;
  return Math.ceil(seconds * 1000) + 500;
}

async function postGroq(body, apiKey) {
  const response = await fetch(GROQ_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const e = new Error(err?.error?.message || `API error: ${response.status}`);
    e.status = response.status;
    throw e;
  }
  const data = await response.json();
  return data?.choices?.[0]?.message?.content || "";
}

// messages: [{ role: "user" | "assistant", content }]
// onWait(seconds) is called while waiting out a rate limit.
export async function callTutor(messages, apiKey, { language = "auto", onWait } = {}) {
  const body = {
    model: MODEL,
    messages: [
      { role: "system", content: buildSystemPrompt(language) },
      ...messages.map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content })),
    ],
    temperature: 0.4,
    // Covers hidden reasoning + the JSON reply; kept low because it counts
    // against the free tier's tokens-per-minute budget.
    max_completion_tokens: 2000,
    reasoning_effort: "medium", // "low" made more language and accuracy slips in testing
    include_reasoning: false,
    response_format: { type: "json_schema", json_schema: { name: "tutor_reply", strict: true, schema: RESPONSE_SCHEMA } },
  };

  let badReplies = 0;
  for (let rateLimited = 0; ;) {
    try {
      const parsed = parseTutorJson(await postGroq(body, apiKey));
      if (parsed) return parsed;
      if (++badReplies >= 2) break;
    } catch (err) {
      if (err.status === 429 && rateLimited++ < 4) {
        const ms = retryDelayMs(err);
        if (ms > 90000) throw err; // daily limit, not worth waiting for
        onWait?.(Math.ceil(ms / 1000));
        await sleep(ms);
        onWait?.(null);
        continue;
      }
      // Retry once on a schema-validation 400 (malformed reply).
      if (err.status === 400 && ++badReplies < 2) continue;
      throw err;
    }
  }
  return fallbackResponse("Sorry, I couldn't process that. Please try again.");
}

export async function verifyKey(apiKey) {
  try {
    await postGroq({ model: MODEL, messages: [{ role: "user", content: "hi" }], max_completion_tokens: 16, include_reasoning: false }, apiKey);
    return { ok: true };
  } catch (err) {
    if (err.status === 401) return { ok: false, error: "Invalid API key. Please check and try again." };
    if (err.status) return { ok: true }; // key accepted; other errors (e.g. rate limit) surface later
    return { ok: false, error: "Connection failed. Check your internet and try again." };
  }
}
