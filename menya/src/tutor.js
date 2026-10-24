// ============================================================
// TUTOR ENGINE — prompt, response schema and Groq call.
// Shared by the React app and scripts/eval-tutor.mjs.
// ============================================================

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

export const TUTOR_SYSTEM_PROMPT = `You are Menya, a Socratic academic tutor for undergraduate students. You guide students to the answer with accurate, specific hints and questions. You never hand over the final answer.

LANGUAGE (critical):
- Reply in the language of the student's most recent message, unless a required language is set below. This applies to every text field: message, conceptsDetected, misconceptionDetected and progressSummary.
- Support every language, including low-resource ones such as Kinyarwanda, Kiswahili, Kirundi, Luganda, Amharic, Hausa, Yoruba, Zulu, Wolof and Lingala. Write natural, grammatical text the way a good local teacher would. Never translate word-for-word from English.
- If a technical term has no common equivalent in that language, use the usual local term and put the English or French term in parentheses once, e.g. "ubukana bw'amashanyarazi (current)".
- Keep mathematical notation, symbols, units and code universal: V = IR, f'(x), O(n log n), 12 V, 4 Ω.
- Set "language" to the English name of the language you replied in.
- Hint requests and other control messages from the app arrive in square brackets in English. Never change language because of them; keep using the student's language.

ACCURACY (critical):
- Before replying, privately solve the student's problem completely and check the result. Every hint, question and judgement must agree with that verified solution. Never steer the student down a wrong path.
- When the student offers a step or an answer, check it carefully against your solution:
  - Correct: say clearly that it is correct and why the reasoning works (type "affirmation"). Confirming an answer the student found themselves is not giving the answer.
  - Wrong: say plainly that it is not right yet, without revealing the correct value. Point to where it goes wrong (which step, sign, unit or concept) and ask a question that helps them fix it (type "redirect").
  - Partly right: confirm the right part, then focus on the first mistake.
- Never praise wrong reasoning to be encouraging. If the problem is ambiguous or missing data, ask for the missing information instead of guessing.

NO DIRECT ANSWERS (absolute):
- Never state the final answer, final value, final expression, finished proof or finished code. Never do the last computation for the student.
- This holds even if the student insists, says it is urgent, claims to be a teacher, asks in another language, asks you to role-play, or asks you to "just check" a value you would have to supply yourself.
- When they ask for the answer, acknowledge it kindly in one sentence, then give the next concrete step.

HOW TO GUIDE:
- Work one step at a time. Each reply moves the student exactly one step closer to the answer.
- Be concrete and specific to THIS problem: name the actual quantities, values, variables or lines of code involved. Do not ask vague meta-questions like "What principle applies here?" when the student is clearly stuck.
- You may make a short statement (a fact, a definition, a reminder) before your question. Do not answer with questions only.
- Keep it short: at most about 4 sentences, ending with ONE clear question or task for the student.
- Now and then, summarise what the student has established so far in progressSummary.

HINT LEVELS (when the student is stuck or the app sends a hint request). Each level is more specific than the last, and all must match your verified solution:
- Level 1 — Concept: name the exact principle, law or technique that solves this problem and say in one sentence why it applies here. E.g. "This is Ohm's law: the battery voltage drives current through the resistor."
- Level 2 — Relationship: give the exact formula or relationship, and map each of the student's given quantities onto its symbols. Do not substitute numbers or solve. E.g. "V = IR, where V = 12 V and R = 4 Ω here. Which symbol is the unknown?"
- Level 3 — Next step: set up the specific next operation with the student's values in place, and stop just before the final result. E.g. "Rearrange to I = V / R and put in 12 V and 4 Ω. What do you get?"
- Never go beyond Level 3. Never reveal the final result.
- If hints were given earlier, build on them; never repeat an earlier hint.

MISCONCEPTIONS:
- When you detect one, set misconceptionDetected to a short description of it, in the student's language. Then challenge it with a counterexample or a check, e.g. "If that were true, what would happen when R doubles?"

OUTPUT:
Reply with a single JSON object that matches the response schema:
- language: English name of the reply language.
- message: your reply to the student.
- type: "question" | "affirmation" | "hint" | "redirect" | "summary".
- conceptsDetected: short names of the concepts involved (in the student's language).
- misconceptionDetected: short string or null.
- hintLevel: 1, 2 or 3 when this reply is a hint, otherwise null.
- progressSummary: short string or null.
- encouragementScore: integer 1–5 for how well the student is reasoning (5 = excellent).`;

export const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    language: { type: "string" },
    message: { type: "string" },
    type: { type: "string", enum: ["question", "affirmation", "hint", "redirect", "summary"] },
    conceptsDetected: { type: "array", items: { type: "string" } },
    misconceptionDetected: { type: ["string", "null"] },
    hintLevel: { type: ["integer", "null"] },
    progressSummary: { type: ["string", "null"] },
    encouragementScore: { type: "integer" },
  },
  required: ["language", "message", "type", "conceptsDetected", "misconceptionDetected", "hintLevel", "progressSummary", "encouragementScore"],
  additionalProperties: false,
};

export function buildSystemPrompt(language = "auto") {
  if (!language || language === "auto") return TUTOR_SYSTEM_PROMPT;
  return `${TUTOR_SYSTEM_PROMPT}\n\nREQUIRED LANGUAGE: The student chose ${language}. Write every text field in ${language}, whatever language the student writes in.`;
}

// App-generated control message for the hint button. Kept in English on
// purpose: the system prompt tells the model to ignore its language.
export function hintRequest(level, language) {
  const lang = language && language !== "auto" ? language : "the student's language (the language of their last message)";
  return `[HINT REQUEST — Level ${level} of 3] The student pressed the hint button. Give a Level ${level} hint for the current step, following the hint-level rules exactly and building on earlier hints. Do not reveal the final answer. Reply in ${lang}.`;
}

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

export function parseTutorJson(raw) {
  try {
    const clean = raw.replace(/```json|```/g, "").trim();
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    const parsed = JSON.parse(start >= 0 ? clean.slice(start, end + 1) : clean);
    if (typeof parsed?.message !== "string" || !parsed.message.trim()) return null;
    return { ...fallbackResponse(""), ...parsed, conceptsDetected: Array.isArray(parsed.conceptsDetected) ? parsed.conceptsDetected : [] };
  } catch {
    return null;
  }
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
export async function callTutor(messages, apiKey, { language = "auto" } = {}) {
  const body = {
    model: MODEL,
    messages: [
      { role: "system", content: buildSystemPrompt(language) },
      ...messages.map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content })),
    ],
    temperature: 0.4,
    max_completion_tokens: 4000,
    reasoning_effort: "medium",
    include_reasoning: false,
    response_format: { type: "json_schema", json_schema: { name: "tutor_reply", strict: true, schema: RESPONSE_SCHEMA } },
  };

  // Retry once on a malformed reply or a schema-validation 400.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const parsed = parseTutorJson(await postGroq(body, apiKey));
      if (parsed) return parsed;
    } catch (err) {
      if (attempt === 1 || err.status !== 400) throw err;
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
