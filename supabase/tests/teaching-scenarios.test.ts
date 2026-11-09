// The 13 teaching scenarios, run through the real pipeline and database with a scripted model.
//
// These prove what the SERVER controls: which teaching move is chosen, what the model is instructed to do,
// that a question-first reply is rewritten, that visuals are correct and that mastery isn't given away.
// They do NOT prove the quality of what a real model writes: that needs dev/eval-teaching.ts and human reviewers.
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { freshDb, createUser } from "./db.ts";
import { pgRepo } from "./pgRepo.ts";
import { handleTutor } from "../functions/_shared/tutorService.ts";
import type { ChatRequest, ModelProvider } from "../functions/_shared/providers.ts";
import { checkTeachingOrder, classifyEvidence, isBriefFact, lessonShape, suggestVisual, type LessonShape } from "../functions/_shared/engine/pedagogy.ts";
import { parseLesson, splitSteps, stripLessonMarkers } from "../functions/_shared/lessonFormat.ts";
import { densityProblems, inferLevelFromText, levelFromProfile, normalizeLevel, readability } from "../functions/_shared/language.ts";
import { polishReply } from "../functions/_shared/policy.ts";

let db: PGlite;
before(async () => { db = await freshDb(); });

const LESSON = "@@idea\nThink of sharing a loaf of bread between friends. The idea here is that equal parts make a whole, and we can count those parts carefully every time.\n@@see\nThe bars show the same whole cut into different numbers of parts. Notice that the shaded length is what matters.\n@@example\n1. We know the whole has 4 equal parts.\n2. We shade 2 of them because the top number says so.\n3. Check: 2 of 4 fills half the bar.\n@@try\nLook at the first bar. How many parts are shaded?";
const assessment = (over = {}) => ({ verdict: "not_an_attempt", reasoning: "none", misconception: null, confidence: 0.9, prerequisiteGap: null, objective: "other", evidence: "unclear", ...over });
const reply = (over: Record<string, unknown> = {}) => JSON.stringify({
  teachingPlan: { goal: "g", alreadyKnows: "k", prerequisite: "p", visual: "v", example: "e", question: "q" },
  language: "English", message: LESSON, type: "explanation", conceptsDetected: [], misconceptionDetected: null, hintLevel: null, progressSummary: null, solved: false,
  finalAnswer: "", difficulty: "basic", assessment: assessment(), diagram: null, ...over });

function model(script: (req: ChatRequest, last: string, n: number) => string = () => reply()) {
  const calls: ChatRequest[] = [];
  const provider: ModelProvider = {
    name: "groq",
    async chat(_c, req) {
      calls.push(req);
      const last = String(req.messages.at(-1)!.content);
      if (last.startsWith("[PRESENT PROBLEM]")) return { text: reply({ message: `Practice problem\n\n${last.split("\n\n").slice(1).join("\n\n")}\n\nShow your working.`, type: "question" }), inputTokens: 1, outputTokens: 1, latencyMs: 1, ttftMs: null };
      return { text: script(req, last, calls.length), inputTokens: 1, outputTokens: 1, latencyMs: 1, ttftMs: null };
    },
    async health() { return { ok: true }; },
  };
  const note = (i = -1) => String(calls.at(i)!.messages.map(m => String(m.content)).find(t => t.startsWith("[TUTOR ENGINE]")) ?? "");
  return { provider, calls, note };
}
const run = (u: string, m: ReturnType<typeof model>, input: Record<string, unknown>) =>
  handleTutor({ repo: pgRepo(db), providers: { groq: m.provider }, sleep: async () => {} }, u, { requestId: randomUUID(), ...input });
const ask = (message: string, extra: Record<string, unknown> = {}) => ({ action: "message", message, ...extra });
const events = async (u: string) => (await db.query<any>("select kind, visual_kind from public.teaching_events where user_id = $1 order by id", [u])).rows;
const state = (r: any) => r.body.engine.state as string;
const format = (r: any) => r.body.engine.format as string;
const it = (role: string, label = "", value = "") => ({ role, label, value });

describe("the 13 teaching scenarios (server behaviour)", () => {
  test("1. fractions, a secondary student: teaches first, at their level, with a measured picture", async () => {
    const u = await createUser(db), m = model(() => reply({ diagram: { kind: "fraction", title: "Halves", alt: "Two equal bars", items: [it("fraction", "", "1/2"), it("fraction", "", "2/4")] } }));
    const r: any = await run(u, m, ask("I am in S2 and I don't understand fractions"));
    assert.equal(r.status, 200);
    assert.equal(format(r), "lesson");
    assert.match(m.note(), /@@idea[\s\S]*@@see[\s\S]*@@example[\s\S]*@@try/, "the model is told the order");
    assert.match(m.note(), /nothing in the reply may be a question until the @@try/);
    assert.match(m.calls[0].system, /Lower secondary/);
    assert.match(JSON.stringify(m.calls[0].messages), /fraction: \\"fraction\\"/, "offered the fraction visual");
    assert.equal(r.body.diagram.kind, "fraction");
    const kinds = (await events(u)).map(e => e.kind);
    for (const k of ["concept_introduced", "example_shown", "visual_shown"]) assert.ok(kinds.includes(k), k);
  });

  test("2. photosynthesis: a checked illustration is used even if the model offers no picture", async () => {
    const u = await createUser(db), m = model();
    const r: any = await run(u, m, ask("Explain photosynthesis"));
    assert.equal(format(r), "lesson");
    assert.equal(r.body.diagram.kind, "labelled");
    assert.ok(r.body.diagram.svg.includes("Carbon dioxide"));
    assert.ok(r.body.diagram.alt.length > 40, "described in words as well");
  });

  test("3. Newton's laws: every force the model names must be drawable", async () => {
    const u = await createUser(db), good = model(() => reply({ diagram: { kind: "forces", title: "Forces", alt: "A block", items: [it("surface", "", "flat"), it("force", "W", "down"), it("force", "N", "up")] } }));
    const r: any = await run(u, good, ask("Explain Newton's first law"));
    assert.equal(r.body.diagram.kind, "forces");
    const u2 = await createUser(db), bad = model(() => reply({ diagram: { kind: "forces", title: "", alt: "", items: [it("surface", "", "flat"), it("force", "W", "sideways-ish")] } }));
    const r2: any = await run(u2, bad, ask("Explain Newton's first law"));
    assert.equal(r2.body.diagram, null, "not guessed");
    assert.equal(bad.calls.length, 2, "one chance to correct it");
    assert.match(String(bad.calls[1].messages.at(-1)!.content), /FIX THE PICTURE/);
    assert.equal((await db.query<any>("select count(*)::int n from public.media_usage where user_id = $1 and kind='diagram'", [u2])).rows[0].n, 0, "costs the learner nothing");
  });

  test("4. basic algebra: a reply that only asks is rewritten to teach; the answer stays protected", async () => {
    const u = await createUser(db);
    const m = model((_r, last) => last.startsWith("[TEACH FIRST]") ? reply({ finalAnswer: "x = 4", message: "@@idea\nAn equation is like a balanced scale, and whatever you do to one side you must do to the other side too so it stays level.\n@@example\n1. For 3x + 1 = 7, take 1 from both sides to get 3x = 6.\n2. Divide both sides by 3, so x = 2.\n3. Check: 3 times 2 plus 1 is 7.\n@@try\nWhat would you take away from both sides of your equation first?" })
      : reply({ finalAnswer: "x = 4", type: "question", message: "What do you think the first step is?" }));
    const r: any = await run(u, m, ask("Solve 2x + 3 = 11"));
    assert.equal(state(r), "TEACH");
    assert.equal(m.calls.length, 2);
    assert.match(String(m.calls[1].messages.at(-1)!.content), /\[TEACH FIRST\]/);
    assert.match(r.body.reply.message, /@@idea/);
    assert.doesNotMatch(r.body.reply.message, /x = 4/);
    assert.equal(r.body.reply.finalAnswer, undefined);
  });

  test("4b. a rewrite that reveals the answer is thrown away", async () => {
    const u = await createUser(db);
    const m = model((_r, last) => last.startsWith("[TEACH FIRST]") ? reply({ finalAnswer: "x = 4", message: `@@idea\n${"Equations balance like a scale, so keep both sides level at every single step you take today. ".repeat(2)}The answer is x = 4.\n@@try\nDo you agree?` })
      : reply({ finalAnswer: "x = 4", type: "question", message: "What do you think the first step is?" }));
    const r: any = await run(u, m, ask("Solve 2x + 3 = 11"));
    assert.doesNotMatch(r.body.reply.message, /x = 4/);
  });

  test("5. Python loops: a real flowchart, and the code example stays code", async () => {
    const u = await createUser(db), m = model(() => reply({ diagram: { kind: "flowchart", title: "A loop", alt: "A loop", items: [it("start", "Start"), it("decision", "More items?", "no:4"), it("process", "Run the body", "goto:2"), it("end", "Stop")] } }));
    const r: any = await run(u, m, ask("I don't understand how a for loop works in Python"));
    assert.equal(r.body.diagram.kind, "flowchart");
    assert.match(JSON.stringify(m.calls[0].messages), /flowchart: \\"start\\"/);
  });

  test("6. logic gates: the truth table is computed, and needs none of the day's pictures", async () => {
    const u = await createUser(db), m = model(() => reply({ diagram: { kind: "truth_table", title: "AND", alt: "The AND gate", items: [it("expression", "A AND B", "A AND B")] } }));
    const r: any = await run(u, m, ask("Explain logic gates, starting with AND"));
    assert.equal(r.body.diagram.svg, null);
    assert.deepEqual(r.body.diagram.table.rows.map((x: string[]) => x.at(-1)), ["0", "0", "0", "1"]);
    assert.equal((await db.query<any>("select count(*)::int n from public.media_usage where user_id = $1 and kind='diagram'", [u])).rows[0].n, 0);
    // With today's pictures used up, tables are still offered.
    await db.query("insert into public.media_usage (user_id, kind) select $1, 'diagram' from generate_series(1, 3)", [u]);
    const r2: any = await run(u, m, ask("Explain the OR gate truth table"));
    assert.ok(r2.body.diagram.table);
    // Even a gate drawing keeps its computed table once the pictures are gone.
    const gate = model(() => reply({ diagram: { kind: "logic", title: "", alt: "A gate", items: [it("expression", "Q", "A OR B")] } }));
    const r3: any = await run(u, gate, ask("Explain the OR gate"));
    assert.equal(r3.body.diagram.svg, null);
    assert.deepEqual(r3.body.diagram.table.rows.map((x: string[]) => x.at(-1)), ["0", "1", "1", "1"]);
  });

  test("7. circuits: the picture's labels can't give away their own problem's answer", async () => {
    const u = await createUser(db), m = model(() => reply({ finalAnswer: "3 A", diagram: { kind: "circuit", title: "So I = 3 A", alt: "", items: [it("battery", "12 V"), it("resistor", "4 Ω")] } }));
    const r: any = await run(u, m, ask("A 12 V battery is across a 4 Ω resistor. What is the current?"));
    assert.equal(r.body.diagram, null);
  });

  test("8. français facile: the French rules are sent, and asking for easy French simplifies further", async () => {
    const u = await createUser(db), m = model(() => reply({ language: "French" }));
    await run(u, m, ask("Explique-moi la photosynthèse en français facile s'il te plaît", { language: "French" }));
    assert.match(m.calls[0].system, /Français facile/);
    assert.match(m.calls[0].system, /phrases courtes/);
    assert.match(m.calls[0].system, /shorter sentences and more common words/);
    assert.doesNotMatch(m.calls[0].system, /Kinyarwanda: explain the way/, "only the rules that apply");
  });

  test("8b. the reading measure tells the brief's two French sentences apart", () => {
    const hard = "La photosynthèse constitue un processus biochimique par lequel les organismes chlorophylliens convertissent l'énergie lumineuse en énergie chimique.";
    const easy = "La photosynthèse est le processus qui permet aux plantes de fabriquer leur nourriture grâce à la lumière du soleil.";
    assert.ok(densityProblems(hard, "lower_secondary", "French").includes("words_hard"));
    assert.deepEqual(densityProblems(easy, "upper_secondary", "French"), []);
    assert.ok(readability(hard).longWordShare > readability(easy).longWordShare * 2);
  });

  test("9. Kinyarwanda: taught naturally, no invented terms, and a mid-lesson switch keeps the lesson", async () => {
    const u = await createUser(db), m = model(() => reply({ language: "Kinyarwanda" }));
    const first: any = await run(u, m, ask("Sobanura amashanyarazi", { language: "Kinyarwanda" }));
    assert.match(m.calls[0].system, /Never invent a Kinyarwanda word/);
    assert.match(m.calls[0].system, /never translate English sentence by sentence/);
    await run(u, m, ask("Can you continue in English please", { language: "English", sessionId: first.body.sessionId }));
    assert.match(JSON.stringify(m.calls.at(-1)!.messages), /has switched from Kinyarwanda to English\. Carry on the same lesson/);
    assert.ok(m.calls.at(-1)!.messages.some(x => x.role === "assistant"), "the lesson so far is still there");
  });

  test("10. repeated wrong answers: the approach changes each time and ends at the prerequisite", async () => {
    const u = await createUser(db);
    const m = model((_r, last) => reply({ type: "redirect", finalAnswer: "x = 4", message: "Not yet, because the two sides no longer balance after that step. Look at how we kept both sides level before.", assessment: assessment({ verdict: "incorrect", reasoning: "flawed", prerequisiteGap: last.includes("first") ? "inverse operations" : "inverse operations" }) }));
    let r: any = await run(u, m, ask("Solve 2x + 3 = 11"));
    const sessionId = r.body.sessionId, seen: string[] = [];
    for (const a of ["x = 7 is my first try because I added", "x = 8 I think since 11 minus 3", "x = 9, I did 11 minus 2", "x = 10, adding this time", "x = 11 I kept it the same"]) {
      r = await run(u, m, ask(a, { sessionId }));
      seen.push(state(r));
    }
    assert.ok(seen.includes("EXPLAIN"), seen.join());
    assert.ok(seen.includes("MODEL"), seen.join());
    assert.ok(seen.includes("PREREQ"), seen.join());
    assert.ok(seen.indexOf("EXPLAIN") < seen.indexOf("MODEL") && seen.indexOf("MODEL") < seen.indexOf("PREREQ"), seen.join());
    const prereq = m.calls.map(c => String(c.messages.map(x => String(x.content)).find(t => t.startsWith("[TUTOR ENGINE]")))).find(n => /Teaching move: PREREQ/.test(n))!;
    assert.match(prereq, /Go back to: inverse operations/);
  });

  test("11. 'I don't understand': never the same question; help grows, then goes back further", async () => {
    const u = await createUser(db), m = model(() => reply({ finalAnswer: "x = 4", type: "hint", message: "Let me help with that. Start by keeping both sides of the equation level, which is what balancing means here. What could you do?" }));
    let r: any = await run(u, m, ask("Solve 2x + 3 = 11"));
    const sessionId = r.body.sessionId, seen: string[] = [];
    for (let i = 0; i < 5; i++) { r = await run(u, m, ask("I don't know", { sessionId })); seen.push(state(r)); }
    assert.deepEqual(seen.slice(0, 4), ["HINT", "EXPLAIN", "MODEL", "PREREQ"]);
    assert.equal(seen[4], "EXPLAIN", "after everything else, the full explanation");
    assert.match(m.calls.at(-1)!.system, /very short sentences|Very short sentences/i, "the language gets plainer too");
  });

  test("12. asking for a diagram: drawn and explained, within the plan's daily limit", async () => {
    const u = await createUser(db), m = model(() => reply({ message: "@@see\nThe bars show how much is shaded, and the shaded part is what the fraction counts.\n@@try\nWhich bar is longer?", diagram: { kind: "fraction", title: "Bars", alt: "Two bars", items: [it("fraction", "", "1/2")] } }));
    const first: any = await run(u, m, ask("Show me a diagram of fractions"));
    assert.ok(first.body.diagram.svg);
    for (let i = 2; i <= 3; i++) assert.ok((await run(u, m, ask("Draw another picture of it", { sessionId: first.body.sessionId }))).body.diagram);
    const again: any = await run(u, m, ask("Draw another picture of it", { sessionId: first.body.sessionId }));
    assert.equal(again.body.diagram, null);
    assert.equal(again.body.pictureNote.reason, "limit");
    assert.equal(again.status, 200, "the lesson carries on in words");
  });

  test("13. follows the example but fails alone: no mastery, and the teaching changes", async () => {
    const u = await createUser(db), m = model(() => reply({ type: "redirect", message: "Not yet, because the current depends on dividing the voltage by the resistance here." }));
    const first: any = await run(u, m, ask("Can you help me with Ohm's law? 12 V and 4 Ω"));
    const sessionId = first.body.sessionId;
    await db.query("update public.tutoring_sessions set objective = 'ee.ohms_law' where id = $1", [sessionId]);
    await run(u, m, { action: "practice", sessionId });
    let item = (await db.query<any>("select item from public.session_items where session_id = $1", [sessionId])).rows[0].item;
    let [V, R] = item.question.match(/[\d.]+(?= V| Ω)/g).map(Number);
    const guided: any = await run(u, m, ask(`I = V/R = ${V}/${R} = ${V / R} A`, { sessionId }));
    assert.equal(guided.body.engine.verified, "correct");
    await run(u, m, { action: "test", sessionId });
    item = (await db.query<any>("select item, kind from public.session_items where session_id = $1", [sessionId])).rows[0].item;
    [V, R] = item.question.match(/[\d.]+(?= V| Ω)/g).map(Number);
    const alone: any = await run(u, m, ask(`I took V plus R and got ${V + R + 1} A as the current`, { sessionId }));
    assert.equal(alone.body.engine.verified, "incorrect");
    assert.equal(state(alone), "MODEL");
    assert.match(m.note(), /can't start it independently/);
    assert.notEqual(alone.body.engine.mastery.status, "mastered");
    const kinds = (await events(u)).map(e => e.kind);
    assert.ok(kinds.includes("independent_answered"));
  });
});

describe("teaching layer rules", () => {
  const lesson: LessonShape = { format: "lesson", sections: ["idea", "see", "example", "try"], foundation: true, visual: "should" };
  test("question-first replies fail the order check; teaching-first replies pass", () => {
    assert.deepEqual(checkTeachingOrder("What do you already know about fractions?", lesson).problems, ["asks_before_teaching"]);
    assert.ok(checkTeachingOrder(LESSON, lesson).ok);
    assert.deepEqual(checkTeachingOrder("@@idea\nWhat is a fraction? It is a part of a whole, which we can write with two numbers one above the other on the page for everyone.\n@@try\nWhat is 1/2?", lesson).problems, ["asks_while_teaching"]);
    assert.ok(checkTeachingOrder("@@idea\nToo short.\n@@try\nWhat is it?", lesson).problems.includes("too_little_teaching"));
    assert.ok(checkTeachingOrder("@@idea\nA loop repeats a block of code many times so you do not need to write it out, which saves effort and keeps programs short and clear.\n@@example\n```python\nprint('why?')\n```\n@@try\nWhat prints?", lesson).ok, "a ? inside code isn't a question");
  });
  test("a short fact stays short; greetings aren't lessons", () => {
    for (const q of ["What is the capital of Rwanda?", "hello", "murakoze", "What is 2 + 2?"]) assert.ok(isBriefFact(q), q);
    for (const q of ["What is photosynthesis?", "Why is the sky blue?", "Solve 2x + 3 = 11"]) assert.ok(!isBriefFact(q), q);
  });
  test("each kind of move gets the right shape", () => {
    const of = (state: any, extra = {}) => lessonShape({ plan: { state, hintLevel: 1, revealAllowed: false, presentItem: null, rationale: "" }, action: "message", requestKind: "other", brief: false, researching: false, presenting: false, ...extra } as any).format;
    assert.equal(of("TEACH"), "lesson");
    assert.equal(of("MODEL"), "demonstrate");
    assert.equal(of("PREREQ"), "prerequisite");
    assert.equal(of("GUIDE"), "guide");
    assert.equal(of("EXPLAIN", { action: "diagram" }), "picture");
    assert.equal(of("TEACH", { brief: true }), "brief");
    assert.equal(of("TEACH", { researching: true }), "plain");
    assert.equal(of("TEACH", { presenting: true }), "plain");
  });
  test("what an answer is evidence of comes from the server's facts first", () => {
    const base = { verified: "unknown", unexplained: false, misconception: null, itemKind: null, guidedSuccessBefore: false, assessment: null } as any;
    const conf = (over: object) => ({ verdict: "correct", reasoning: "valid", misconception: null, confidence: 0.9, prerequisiteGap: null, objective: "other", ...over }) as any;
    assert.equal(classifyEvidence({ ...base, verified: "correct", unexplained: true }), "possible_guess");
    assert.equal(classifyEvidence({ ...base, verified: "incorrect", misconception: "swapped" }), "misconception");
    assert.equal(classifyEvidence({ ...base, verified: "incorrect", itemKind: "verify", guidedSuccessBefore: true }), "cannot_apply");
    assert.equal(classifyEvidence({ ...base, verified: "correct", assessment: conf({ evidence: "memorised" }) }), "memorised");
    assert.equal(classifyEvidence({ ...base, assessment: conf({ prerequisiteGap: "fractions" }) }), "missing_prerequisite");
    assert.equal(classifyEvidence({ ...base, assessment: conf({ evidence: "memorised", confidence: 0.3 }) }), "unclear", "a low-confidence reading is ignored");
  });
  test("visuals are matched to the subject in the three main languages", () => {
    assert.equal(suggestVisual("Explain photosynthesis")!.template, "photosynthesis");
    assert.equal(suggestVisual("Explique la photosynthèse")!.template, "photosynthesis");
    assert.equal(suggestVisual("what is a volcano")!.template, "volcano");
    assert.ok(suggestVisual("how do logic gates work")!.kinds.includes("logic"));
    assert.ok(suggestVisual("Sobanura umuzunguruko w'amashanyarazi")!.kinds.includes("circuit"));
    assert.ok(suggestVisual("les fractions")!.kinds.includes("fraction"));
    assert.equal(suggestVisual("tell me about your day"), null, "no decoration");
  });
  test("levels: chosen, stated or from the profile; older settings keep working; unknown is not 'university'", () => {
    assert.equal(normalizeLevel("secondary"), "upper_secondary");
    assert.equal(normalizeLevel("postgraduate"), "university_advanced");
    assert.equal(normalizeLevel("auto"), null);
    assert.equal(inferLevelFromText("I'm in S2"), "lower_secondary");
    assert.equal(inferLevelFromText("je suis en terminale"), "upper_secondary");
    assert.equal(inferLevelFromText("second-year university student"), "university_intro");
    assert.equal(inferLevelFromText("Solve 2x + 3 = 11"), null);
    assert.equal(levelFromProfile("secondary", 2), "lower_secondary");
    assert.equal(levelFromProfile("university", 4), "university_advanced");
  });
  test("lesson text: markers split cleanly, code is safe from them, and copies come out clean", () => {
    const parsed = parseLesson(LESSON);
    assert.deepEqual(parsed.sections.map(s => s.id), ["idea", "see", "example", "try"]);
    assert.ok(!stripLessonMarkers(LESSON).includes("@@"));
    assert.deepEqual(parseLesson("just a normal reply").sections, []);
    assert.equal(parseLesson("just a normal reply").intro, "just a normal reply");
    const inCode = "@@example\n```python\n@@staticmethod\n```";
    assert.equal(parseLesson(inCode).sections.length, 1);
    assert.match(parseLesson(inCode).sections[0].body, /@@staticmethod/);
    assert.equal(parseLesson("@@idea: The point\n@@nonsense\n@@try\nWhy?").sections[0].body, "The point");
    const steps = splitSteps("Here we go.\n1. First\n2. Second\n\nSo that's it.")!;
    assert.deepEqual([steps.lead, steps.steps.length, steps.tail], ["Here we go.", 2, "So that's it."]);
  });
  test("polish still removes machine-sounding openers inside a lesson, and keeps the marker", () => {
    assert.equal(polishReply("@@idea\nCertainly! A loop repeats."), "@@idea\nA loop repeats.");
  });
});

describe("what must not change", () => {
  test("plan limits are the owner's: Free 3 pictures, the rest unchanged", async () => {
    const rows = (await db.query<any>("select id, daily_image_limit, daily_request_limit, monthly_request_limit, price_monthly_cents from public.plans where id in ('free','pro','exam','professional') order by id")).rows;
    const by = Object.fromEntries(rows.map(p => [p.id, p]));
    assert.deepEqual([by.free.daily_image_limit, by.pro.daily_image_limit, by.exam.daily_image_limit, by.professional.daily_image_limit], [3, 3, 10, 10]);
    assert.equal(by.professional.price_monthly_cents, 800);
  });
  test("a learner can't write teaching events, and sees only their own; forgetting data removes them", async () => {
    const { asUser, rpc } = await import("./db.ts");
    const a = await createUser(db), b = await createUser(db);
    await db.query("insert into public.teaching_events (user_id, kind) values ($1, 'visual_shown')", [a]);
    const seen = (u: string) => asUser(db, u, () => db.query<any>("select count(*)::int n from public.teaching_events"));
    assert.equal((await seen(a)).rows[0].n, 1);
    assert.equal((await seen(b)).rows[0].n, 0);
    await assert.rejects(asUser(db, b, () => db.query("insert into public.teaching_events (user_id, kind) values ($1, 'visual_shown')", [b])));
    const exported: any = await rpc(db, "export_my_data", { p_user: a });
    assert.equal(exported.teaching_events.length, 1);
    await rpc(db, "delete_my_learning_data", { p_user: a });
    assert.equal((await seen(a)).rows[0].n, 0);
  });
  test("a teaching-event failure never stops the reply", async () => {
    const u = await createUser(db), m = model();
    const repo = { ...pgRepo(db), recordTeachingEvents: async () => { throw new Error("table missing"); }, teachingSignals: async () => { throw new Error("table missing"); } };
    const r = await handleTutor({ repo, providers: { groq: m.provider }, sleep: async () => {} }, u, { requestId: randomUUID(), ...ask("Explain gravity") });
    assert.equal(r.status, 200);
  });
  test("what the browser gets never includes the private teaching plan or the model's picture description", async () => {
    const u = await createUser(db), m = model(() => reply({ diagram: { kind: "flow", title: "T", alt: "A", items: [it("step", "a"), it("step", "b")] } }));
    const r: any = await run(u, m, ask("Explain the steps of digestion"));
    assert.equal(r.body.reply.teachingPlan, undefined);
    assert.equal(r.body.reply.diagram, undefined);
    assert.equal(r.body.reply.assessment, undefined);
  });
});
