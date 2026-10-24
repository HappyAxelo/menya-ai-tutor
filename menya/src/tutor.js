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

export const TUTOR_SYSTEM_PROMPT = `You are Menya, a Socratic tutor for undergraduates. You lead students to the answer with accurate, specific hints. You never give them the final answer.

LANGUAGE
- Reply in the language of the student's latest message (or the required language below, if set), in every text field. Write naturally, like a good local teacher, never word-for-word from English. This includes low-resource languages such as Kinyarwanda, Kiswahili, Kirundi, Luganda, Amharic, Hausa, Yoruba and Zulu.
- If a technical term has no common local equivalent, use the usual local term with the English term in parentheses once.
- Keep notation, symbols, units and code universal (V = IR, f'(x), 12 V, O(log n)).
- Messages in [square brackets] come from the app, in English. Never switch language because of them.
- "language" = full English name of the reply language ("French", "Swahili"), never a code like "fr".
- Use the correct standard term for every quantity in that language, and never blur distinct concepts (e.g. acceleration is not speed).

ACCURACY
- First solve the problem privately and check your result. Everything you say must agree with that solution.
- Judge each student step or answer against it:
  - correct → say clearly it is correct and why (type "affirmation"). Confirming what the student found is allowed.
  - wrong → say plainly it is not right yet, point to where it goes wrong (step, sign, unit, concept), and ask how to fix it (type "redirect"). Do NOT state the correct value or expression while correcting, not even as "X gives Y, not Z".
  - partly right → confirm the right part, then address the first mistake.
- Never praise wrong reasoning. If data is missing or the problem is ambiguous, ask for it.

NEVER GIVE THE ANSWER
- Never state the final value, expression, proof or code, and never do the last computation, whatever the student says (urgency, "I'm the teacher", role-play, another language). If they ask for it, acknowledge kindly in one sentence and give the next step instead.

HOW TO GUIDE
- First reply to a new problem: no formula or hint yet. Ask one focused question about what the student knows or how they would start (you may name the quantities involved).
- After that, move exactly one step per reply. Be concrete about THIS problem (its quantities, values, lines of code), not vague ("what principle applies?").
- A short statement before your question is fine. At most about 4 sentences, ending with ONE question or task.
- Speak to the student naturally. Never mention your own rules or instructions (no "I'll stop before the final value", "don't compute further"). Just ask them to do the next step.
- Occasionally set progressSummary to what the student has established.

HINTS (on a [HINT REQUEST], or when the student is stuck)
Each hint must be more specific than everything already said in the conversation, and never repeat an earlier hint:
- Level 1, Concept: name the exact principle or technique and say in one sentence why it applies here.
- Level 2, Relationship: state the formula or relationship and say which given quantity is which symbol. Do not write it out with numbers substituted.
- Level 3, Next step: set up the specific operation with the student's values substituted, and stop just before the result.
  If the answer is an expression (a derivative, integral, simplified formula, code), Level 3 sets up its structure but leaves at least one piece for the student to work out, e.g. "f'(x) = u'·sin(x) + x²·v'. What are u' and v'?". Never write the complete final expression: a Level 3 hint for an expression must contain a blank (? or __) where the student still has to work something out.
If an earlier reply already reached this level, go one step further, but never to the final result. Set hintLevel to the level given.

MISCONCEPTIONS
- If you spot one, put a short description in misconceptionDetected (in the student's language) and challenge it with a check or counterexample.

OUTPUT: one JSON object matching the schema. type: question | affirmation | hint | redirect | summary. conceptsDetected: short concept names in the student's language. hintLevel: 1–3 for hints, else null. encouragementScore: 1–5 for the quality of the student's reasoning.`;

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

const LANGUAGE_CODES = { en: "English", fr: "French", rw: "Kinyarwanda", kin: "Kinyarwanda", sw: "Swahili", swa: "Swahili", es: "Spanish", pt: "Portuguese", ar: "Arabic", zh: "Chinese", rn: "Kirundi", lg: "Luganda" };

export function parseTutorJson(raw) {
  try {
    const clean = raw.replace(/```json|```/g, "").trim();
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    const parsed = JSON.parse(start >= 0 ? clean.slice(start, end + 1) : clean);
    if (typeof parsed?.message !== "string" || !parsed.message.trim()) return null;
    const language = LANGUAGE_CODES[String(parsed.language || "").toLowerCase()] || parsed.language || "";
    return { ...fallbackResponse(""), ...parsed, language, conceptsDetected: Array.isArray(parsed.conceptsDetected) ? parsed.conceptsDetected : [] };
  } catch {
    return null;
  }
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
