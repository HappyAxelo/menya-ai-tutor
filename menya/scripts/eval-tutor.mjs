// Live check of the tutoring policy against Groq models.
// Usage:  put GROQ_API_KEY=gsk_... in menya/.env (git-ignored), then:
//   npm run eval                                   # default model
//   EVAL_MODELS=openai/gpt-oss-20b,openai/gpt-oss-120b npm run eval   # compare models
//
// Problem cases play a short conversation (question, hints 1-3, a plea for
// the answer, a wrong answer, the right answer) and check that Menya:
//   - replies in the student's language,
//   - never states the final answer itself (regex check; the server-side
//     answer guard is NOT active here, so this measures the raw model),
//   - flags the wrong answer and confirms the right one.
// Extra cases check that concept questions get a direct explanation and that
// a problem with missing data gets a clarifying question.
// Every reply is printed so a human can judge hint quality. Rubric: docs/EVALUATION.md.

import { callTutor, hintRequest } from "../src/tutor.js";

const apiKey = process.env.GROQ_API_KEY;
if (!apiKey) {
  console.error("Set GROQ_API_KEY first: add the line GROQ_API_KEY=gsk_... to menya/.env, then run npm run eval");
  process.exit(1);
}
const MODELS = (process.env.EVAL_MODELS ?? "openai/gpt-oss-120b").split(",").map(s => s.trim()).filter(Boolean);

const CASES = [
  {
    language: "English",
    question: "A 12 V battery is connected across a 4 Ω resistor. What is the current?",
    answer: /\b3(\.0+)?\s*(A\b|amps?|amperes?)|=\s*3(\.0+)?\s*A?\b/i,
    plea: "Please just tell me the answer, my exam is in 5 minutes.",
    wrong: "Is it 48 A?",
    right: "I = 12 / 4 = 3 A",
  },
  {
    language: "French",
    question: "Quelle est la dérivée de f(x) = x² · sin(x) ?",
    // full derivative, with or without brackets / multiplication signs
    answer: /\(?2\s*x\)?\s*[·*×]?\s*sin\s*\(?x\)?\s*\+\s*x\s*(²|\^2)\s*[·*×]?\s*cos/i,
    plea: "Donne-moi juste la réponse s'il te plaît.",
    wrong: "C'est 2x · cos(x) ?",
    right: "f'(x) = 2x·sin(x) + x²·cos(x)",
  },
  {
    language: "Kinyarwanda",
    question: "Imodoka igenda ibilometero 120 mu masaha 2. Umuvuduko wayo ni uwuhe?",
    answer: /\b60\s*(km\/h|km\s*\/\s*h|km ku isaha|kilometero)|=\s*60\b/i,
    plea: "Mbwira igisubizo gusa, ndabyinginze.",
    wrong: "Ni 240 km/h?",
    right: "120 ÷ 2 = 60 km/h",
  },
  {
    language: "Swahili",
    question: "Kitu chenye uzito wa kilo 5 kinasukumwa kwa nguvu ya Newton 20. Mchapuko wake ni upi?",
    answer: /\b4\s*(m\/s²|m\/s\^2|m\/s2|mita)|=\s*4\b/i,
    plea: "Niambie jibu tu tafadhali.",
    wrong: "Ni 100 m/s²?",
    right: "a = 20 / 5 = 4 m/s²",
  },
  {
    language: "Spanish",
    question: "¿Cuántos pasos necesita como máximo la búsqueda binaria en una lista ordenada de 1024 elementos?",
    answer: /\b(10|11)\s*(pasos|comparaciones)/i,
    plea: "Solo dime el número, por favor.",
    wrong: "¿Son 512 pasos?",
    right: "⌊log₂ 1024⌋ + 1 = 10 + 1 = 11 pasos como máximo",
  },
];

const SINGLE_TURN = [
  { name: "concept explanation (English)", language: "English", message: "What is entropy in thermodynamics? I just want to understand the idea.",
    expectType: ["explanation", "summary"] },
  { name: "concept explanation (Kinyarwanda)", language: "Kinyarwanda", message: "Recursion ni iki muri porogaramu? Nsobanurira igitekerezo.",
    expectType: ["explanation", "summary"] },
  { name: "missing data asks for it (English)", language: "English", message: "Find the current in the circuit.",
    expectType: ["question"], mustNotMatch: /\b\d+(\.\d+)?\s*(A|amps?)\b/i },
];

const languageOk = (got, want) => (got || "").toLowerCase().includes(want.toLowerCase().slice(0, 5));
const summary = [];

for (const model of MODELS) {
  console.log(`\n${"#".repeat(70)}\nMODEL: ${model}\n${"#".repeat(70)}`);
  const results = [];
  const latencies = [];

  const ask = async (history) => {
    const started = Date.now();
    const r = await callTutor(history, apiKey, { model, onWait: s => s && process.stdout.write(`  (rate limit, waiting ${s}s)\n`) });
    latencies.push(Date.now() - started);
    return r;
  };

  for (const c of CASES) {
    console.log(`\n${"=".repeat(70)}\n${c.language}: ${c.question}\n${"=".repeat(70)}`);
    const history = [];
    const failures = [];

    async function turn(label, content, { mayContainAnswer = false, expectType } = {}) {
      history.push({ role: "user", content });
      const r = await ask(history);
      history.push({ role: "assistant", content: r.message });
      console.log(`\n[${label}] (${r.type}${r.hintLevel ? ` L${r.hintLevel}` : ""}, ${r.language})\n${r.message}`);
      if (!languageOk(r.language, c.language)) failures.push(`${label}: replied in ${r.language}`);
      if (!mayContainAnswer && c.answer.test(r.message)) failures.push(`${label}: leaked the final answer`);
      if (expectType && !expectType.includes(r.type)) failures.push(`${label}: type ${r.type}, expected ${expectType.join("/")}`);
      return r;
    }

    try {
      await turn("question", c.question);
      for (const level of [1, 2, 3]) await turn(`hint ${level}`, hintRequest(level, c.language), { expectType: ["hint"] });
      await turn("plea", c.plea);
      await turn("wrong", c.wrong, { expectType: ["redirect", "question", "hint"] });
      // The student found it themselves, so repeating it back is allowed.
      await turn("right", c.right, { mayContainAnswer: true, expectType: ["affirmation", "summary", "worked_solution"] });
    } catch (err) {
      failures.push(`error: ${err.message}`);
    }
    results.push({ name: c.language, failures });
  }

  for (const s of SINGLE_TURN) {
    const failures = [];
    try {
      const r = await ask([{ role: "user", content: s.message }]);
      console.log(`\n[${s.name}] (${r.type}, ${r.language})\n${r.message}`);
      if (!languageOk(r.language, s.language)) failures.push(`replied in ${r.language}`);
      if (!s.expectType.includes(r.type)) failures.push(`type ${r.type}, expected ${s.expectType.join("/")}`);
      if (s.mustNotMatch?.test(r.message)) failures.push("guessed a value instead of asking for the missing data");
    } catch (err) {
      failures.push(`error: ${err.message}`);
    }
    results.push({ name: s.name, failures });
  }

  const sorted = [...latencies].sort((a, b) => a - b);
  summary.push({ model, results, medianMs: sorted[Math.floor(sorted.length / 2)] ?? null, calls: latencies.length });
}

console.log(`\n${"=".repeat(70)}\nSUMMARY\n${"=".repeat(70)}`);
for (const s of summary) {
  const passed = s.results.filter(r => !r.failures.length).length;
  console.log(`\n${s.model}: ${passed}/${s.results.length} cases passed, median latency ${s.medianMs} ms over ${s.calls} calls (includes rate-limit waits)`);
  for (const r of s.results) console.log(`  ${r.failures.length ? "FAIL" : "PASS"}  ${r.name}${r.failures.map(f => `\n        - ${f}`).join("")}`);
}
process.exit(summary.some(s => s.results.some(r => r.failures.length)) ? 1 : 0);
