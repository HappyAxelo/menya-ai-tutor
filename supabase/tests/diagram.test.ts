// Pictures: what the drawing code guarantees, and the per-plan daily limits through the real pipeline.
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { freshDb, createUser, rpc } from "./db.ts";
import { pgRepo } from "./pgRepo.ts";
import { asksForPicture, parseDiagramSpec, renderDiagram, type DiagramSpec } from "../functions/_shared/diagram.ts";
import { handleTutor } from "../functions/_shared/tutorService.ts";
import type { ModelProvider } from "../functions/_shared/providers.ts";

const it = (role: string, label = "", value = "") => ({ role, label, value });
const draw = (kind: DiagramSpec["kind"], items: ReturnType<typeof it>[], title = "") => renderDiagram({ kind, title, alt: "a picture", items });

describe("drawing", () => {
  test("a curve is really plotted: x^2 - 4 comes out symmetric with its lowest point at x = 0", () => {
    const d = draw("graph", [it("curve", "y = x^2 - 4", "x^2-4")])!;
    assert.ok(d.svg.includes("x²"), "x^2 reads as x squared");
    const pts = /<polyline points="([^"]+)"/.exec(d.svg)![1].split(" ").map(p => p.split(",").map(Number));
    // Pixel positions back to x and y: the axes cross at x = 0, y = 0, and the tick marks set the scale.
    const lowest = pts.reduce((a, b) => (b[1] > a[1] ? b : a));
    const left = pts[0], right = pts.at(-1)!;
    assert.ok(Math.abs((left[1] - right[1])) < 1, "symmetric about the y axis");
    assert.ok(Math.abs(lowest[0] - (left[0] + right[0]) / 2) < 3, "lowest point in the middle, at x = 0");
  });

  test("a marked point that isn't on the curve is left out; one that is, is shown", () => {
    const good = draw("graph", [it("curve", "", "x^2-4"), it("point", "A", "2,0"), it("point", "B", "−2,0")])!;
    assert.ok(good.text.includes("A"));
    assert.equal((good.svg.match(/>A</g) ?? []).length, 1);
    assert.equal((good.svg.match(/>B</g) ?? []).length, 1, "a typographic minus sign is understood");
    const wrong = draw("graph", [it("curve", "", "x^2-4"), it("point", "WRONG", "3,0")])!;
    assert.ok(!wrong.svg.includes(">WRONG<"));
  });

  test("what can't be drawn correctly is refused rather than guessed", () => {
    assert.equal(draw("graph", [it("curve", "", "not a formula ((")]), null);
    assert.equal(draw("circuit", [it("resistor", "4 Ω")]), null, "no battery");
    assert.equal(draw("circuit", [it("battery", "9 V"), it("resistor", "6 Ω", "parallel")]), null, "one branch isn't parallel");
    assert.equal(draw("forces", [it("surface", "", "incline 30"), it("force", "W", "down"), it("force", "N", "sideways-ish")]), null,
      "leaving out a force would teach the wrong thing");
    assert.equal(draw("flow", [it("step", "only one")]), null);
    assert.equal(draw("bars", [it("bar", "a", "not a number"), it("bar", "b", "x")]), null);
    assert.equal(parseDiagramSpec({ kind: "freeform", items: [] }), null);
    assert.equal(parseDiagramSpec(null), null);
    assert.equal(renderDiagram(null), null);
  });

  test("in a right-angled triangle, the opposite side is the one across from the marked angle", () => {
    const d = draw("triangle", [it("angle", "θ"), it("opposite", "OPP", "3"), it("adjacent", "ADJ", "4"), it("hypotenuse", "HYP")])!;
    const pos = (s: string) => { const m = new RegExp(`x="([\\d.]+)" y="([\\d.]+)"[^>]*>${s}<`).exec(d.svg)!; return [Number(m[1]), Number(m[2])]; };
    assert.ok(pos("θ")[0] > 320 && pos("OPP")[0] < 320, "the angle is on the right, so the opposite side is on the left");
    assert.ok(pos("ADJ")[1] > pos("HYP")[1], "the adjacent side is along the bottom");
  });

  test("forces on a slope point the right way", () => {
    const d = draw("forces", [it("surface", "", "incline 30"), it("force", "N", "normal"), it("force", "W", "down"), it("force", "f", "along-up")])!;
    const arrows = [...d.svg.matchAll(/<line x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)"[^>]*marker-end/g)].map(m => m.slice(1, 5).map(Number));
    const [N, W, f] = arrows.map(([x1, y1, x2, y2]) => [x2 - x1, y2 - y1]);
    assert.ok(Math.abs(W[0]) < 0.01 && W[1] > 0, "weight straight down");
    assert.ok(N[0] < 0 && N[1] < 0, "normal: away from a slope rising to the right");
    assert.ok(f[0] > 0 && f[1] < 0, "friction up the slope");
    assert.ok(Math.abs(N[0] * f[0] + N[1] * f[1]) < 1, "normal is perpendicular to the slope");
  });

  test("the sodium atom has the shells it was given", () => {
    const d = draw("atom", [it("nucleus", "Na"), it("shell", "", "2"), it("shell", "", "8"), it("shell", "", "1")])!;
    // 3 shell rings, 1 nucleus, 11 electrons.
    assert.equal((d.svg.match(/<circle/g) ?? []).length, 3 + 1 + 11);
    assert.ok(d.svg.includes(">Na<"));
  });

  test("nothing a model or learner writes can become code", () => {
    const evil = '<script>alert(1)</script>"onload="x';
    for (const d of [draw("flow", [it("step", evil), it("step", "<img src=x onerror=y>")], evil),
                     draw("bars", [it("bar", evil, "1"), it("bar", "b", "2")]), draw("array", [it("cell", evil)]),
                     draw("circuit", [it("battery", evil), it("resistor", evil)])]) {
      assert.ok(d);
      assert.ok(!/<script|<img|\sonload=|\sonerror=/i.test(d!.svg), "labels are escaped");
    }
  });

  test("asking for a picture is recognised in the four languages, and ordinary questions aren't", () => {
    for (const q of ["Can you draw this?", "show me a diagram", "Dessine le circuit", "un schéma s'il te plaît", "Nshushanyiriza umuzunguruko", "Chora mchoro wa moyo"]) assert.ok(asksForPicture(q), q);
    for (const q of ["What is the derivative of x^2?", "Explain Ohm's law", "Sobanura amategeko ya Ohm"]) assert.ok(!asksForPicture(q), q);
  });
});

// ---------------- Limits, through the real pipeline with a scripted model ----------------
let db: PGlite;
before(async () => { db = await freshDb(); });

const SPEC = { kind: "flow", title: "Steps", alt: "Two steps", items: [it("step", "First"), it("step", "Second")] };
function model(diagram: unknown = SPEC, finalAnswer = "") {
  const calls: any[] = [];
  const provider: ModelProvider = {
    name: "groq",
    async chat(_c, req) {
      calls.push(req);
      return { text: JSON.stringify({ language: "English", message: "Here is how it goes. What comes first?", type: "explanation", conceptsDetected: [], misconceptionDetected: null,
        hintLevel: null, progressSummary: null, solved: false, finalAnswer, difficulty: "basic", diagram }), inputTokens: 1, outputTokens: 1, latencyMs: 1, ttftMs: null };
    },
    async health() { return { ok: true }; },
  };
  return { provider, calls };
}
const ask = (extra: Record<string, unknown> = {}) => ({ requestId: randomUUID(), action: "message", message: "Please draw how this works", ...extra });
async function subscribe(userId: string, plan: string) {
  await rpc(db, "process_payment_event", { p_provider: "test", p_raw: {}, p_event: { id: randomUUID(), type: "subscription.created",
    subscription: { provider_subscription_id: randomUUID(), user_id: userId, plan_id: plan, status: "active", current_period_end: new Date(Date.now() + 30 * 864e5).toISOString() } } });
}
const run = (u: string, m: ReturnType<typeof model>, input = ask()) => handleTutor({ repo: pgRepo(db), providers: { groq: m.provider }, sleep: async () => {} }, u, input);
const pictures = async (u: string) => (await db.query<any>("select count(*)::int as n from public.media_usage where user_id = $1 and kind = 'diagram'", [u])).rows[0].n;

describe("picture limits per plan", () => {
  test("Free gets 1 picture a day; the next request says why, and tutoring carries on in words", async () => {
    const u = await createUser(db), m = model();
    const first = await run(u, m);
    assert.equal(first.status, 200);
    assert.ok((first.body.diagram as any).svg.startsWith("<svg"));
    assert.equal((first.body.diagram as any).alt, "Two steps");
    assert.equal(await pictures(u), 1);

    const second = await run(u, m, ask({ sessionId: first.body.sessionId }));
    assert.equal(second.status, 200, "the question is still answered");
    assert.equal(second.body.diagram, null);
    assert.equal((second.body.pictureNote as any).reason, "limit");
    assert.equal((second.body.pictureNote as any).limit, 1);
    assert.equal((second.body.pictureNote as any).upgrade_to, "pro");
    assert.equal(await pictures(u), 1);
    assert.ok(!m.calls.at(-1).schema.properties.diagram, "the model isn't even offered a picture");
    assert.ok(JSON.stringify(m.calls.at(-1).messages).includes("used today's picture allowance"));

    // Pressing the picture button with none left is refused before any model call or message is used.
    const before = m.calls.length;
    const button = await run(u, m, { requestId: randomUUID(), action: "diagram", sessionId: first.body.sessionId } as any);
    assert.equal(button.status, 429);
    assert.equal(button.body.error, "diagram_limit");
    assert.equal(m.calls.length, before);
  });

  test("Pro gets 3 a day, and is pointed at Max after that", async () => {
    const u = await createUser(db), m = model();
    await subscribe(u, "pro");
    let sessionId: unknown;
    for (let i = 0; i < 3; i++) { const r = await run(u, m, ask(sessionId ? { sessionId } : {})); sessionId = r.body.sessionId; assert.ok(r.body.diagram, `picture ${i + 1}`); }
    const fourth = await run(u, m, ask({ sessionId }));
    assert.equal(fourth.body.diagram, null);
    assert.equal((fourth.body.pictureNote as any).upgrade_to, "professional");
  });

  test("Max and Exam Pass get 10 a day, with nothing further to upgrade to on Max", async () => {
    for (const plan of ["professional", "exam"]) {
      const u = await createUser(db), m = model();
      await subscribe(u, plan);
      let sessionId: unknown;
      for (let i = 0; i < 10; i++) { const r = await run(u, m, ask(sessionId ? { sessionId } : {})); sessionId = r.body.sessionId; assert.ok(r.body.diagram, `${plan} picture ${i + 1}`); }
      const eleventh = await run(u, m, ask({ sessionId }));
      assert.equal(eleventh.body.diagram, null);
      assert.equal((eleventh.body.pictureNote as any).limit, 10);
      if (plan === "professional") assert.equal((eleventh.body.pictureNote as any).upgrade_to, null);
      assert.equal(await pictures(u), 10);
    }
  });

  test("a picture that can't be drawn, or that gives the answer away, isn't shown and isn't counted", async () => {
    const u = await createUser(db);
    const broken = await run(u, model({ kind: "circuit", title: "", alt: "", items: [it("resistor", "4 Ω")] }));
    assert.equal(broken.body.diagram, null);
    assert.equal((broken.body.pictureNote as any).reason, "failed");
    assert.equal(await pictures(u), 0);

    const leak = await run(u, model({ kind: "flow", title: "", alt: "", items: [it("step", "So the current is 3 A"), it("step", "Done")] }, "3 A"),
      ask({ message: "Draw it: 12 V across 4 ohm, what is the current?" }));
    assert.equal(leak.body.diagram, null);
    assert.equal(await pictures(u), 0, "still has today's picture");
  });

  test("the picture stays with the conversation; the model's description never reaches the browser", async () => {
    const u = await createUser(db);
    const r = await run(u, model());
    assert.equal((r.body.reply as any).diagram, undefined);
    const rows = await db.query<any>("select role, content, meta from public.tutoring_messages where session_id = $1 order by id", [r.body.sessionId]);
    assert.ok(rows.rows[1].meta.diagram.svg.startsWith("<svg"));
    assert.ok(!rows.rows[1].content.includes("<svg"), "the model doesn't get the drawing back in its context");
  });

  test("quick guiding turns aren't offered pictures, and bank questions never carry one", async () => {
    const u = await createUser(db), m = model();
    const r = await run(u, m, ask({ message: "What is 2 + 2 and why?" }));
    assert.equal(r.status, 200);
    assert.ok(!m.calls[0].schema.properties.diagram);
    assert.equal(r.body.diagram, null);
    assert.equal(r.body.pictureNote, null);
    const review = await run(u, m, { requestId: randomUUID(), action: "review", objective: "ee.ohms_law" } as any);
    assert.equal(review.body.diagram, null);
  });

  test("the plans table holds the limits and the new name and price", async () => {
    const plans = await rpc(db, "public_plans", {}) as any[];
    const by = Object.fromEntries(plans.map(p => [p.id, p]));
    assert.deepEqual([by.free.daily_image_limit, by.pro.daily_image_limit, by.exam.daily_image_limit, by.professional.daily_image_limit], [1, 3, 10, 10]);
    assert.equal(by.professional.name, "Max");
    assert.equal(by.professional.price_monthly_cents, 800);
  });
});
