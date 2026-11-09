// What the visual engine guarantees: computed correctness, refusal of what can't be drawn, and that nothing unsafe gets out.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseDiagramSpec, renderDiagram, type DiagramSpec } from "../functions/_shared/diagram.ts";
import { isSafeSvg } from "../functions/_shared/svgKit.ts";
import { GALLERY } from "../dev/visual-gallery.ts";
import { LABELLED_TEMPLATES, VISUAL_CATALOGUE, DIAGRAM_KINDS } from "../functions/_shared/diagramSpec.ts";

const it = (role: string, label = "", value = "") => ({ role, label, value });
const draw = (kind: DiagramSpec["kind"], items: ReturnType<typeof it>[], language = "English") => renderDiagram({ kind, title: "", alt: "a picture", items }, { language });
const attr = (svg: string, tag: string, name: string) => [...svg.matchAll(new RegExp(`<${tag}\\b[^>]*\\b${name}="([^"]+)"`, "g"))].map(m => Number(m[1]));

describe("every visual kind", () => {
  test("the catalogue describes every kind, and every drawing in the gallery is valid and safe", () => {
    for (const k of DIAGRAM_KINDS) assert.ok(VISUAL_CATALOGUE[k], k);
    for (const spec of GALLERY) {
      const d = renderDiagram(spec);
      assert.ok(d, `${spec.kind}: ${spec.title}`);
      if (d!.svg) assert.ok(isSafeSvg(d!.svg), `${spec.kind} is safe`);
      for (const f of d!.frames ?? []) assert.ok(isSafeSvg(f.svg));
      if (d!.svg) assert.ok(d!.svg.length < 60_000, `${spec.kind} stays light for slow connections (${d!.svg.length})`);
    }
  });
  test("a stepped visual stays small enough for a slow connection", () => {
    const d = renderDiagram(GALLERY.find(g => g.kind === "graph")!)!;
    assert.equal(d.frames!.length, 5);
    assert.ok(d.frames!.reduce((n, f) => n + f.svg.length, 0) < 60_000);
  });
});

describe("computed, not guessed", () => {
  test("fractions: 1/2 and 2/4 shade exactly the same length", () => {
    const d = draw("fraction", [it("fraction", "", "1/2"), it("fraction", "", "2/4")])!;
    const rects = [...d.svg!.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="[\d.]+" fill="#251F8C"/g)].map(m => ({ y: Number(m[2]), w: Number(m[3]) }));
    const shaded = (y: number) => rects.filter(r => r.y === y).reduce((s, r) => s + r.w, 0);
    const [a, b] = [...new Set(rects.map(r => r.y))];
    assert.ok(Math.abs(shaded(a) - shaded(b)) < 0.5);
  });
  test("fractions refuse nonsense", () => {
    assert.equal(draw("fraction", [it("fraction", "", "three quarters")]), null);
    assert.equal(draw("fraction", [it("fraction", "", "1/0")]), null);
  });
  test("a number line places points in proportion and refuses one outside its range", () => {
    const d = draw("numberline", [it("range", "", "0,10"), it("point", "A", "5")])!;
    const cx = attr(d.svg!, "circle", "cx")[0];
    assert.ok(Math.abs(cx - 320) < 1, "5 is half way along 0 to 10");
    assert.equal(draw("numberline", [it("range", "", "0,10"), it("point", "A", "12")]), null);
  });
  test("coordinate geometry uses one scale: a 3-4-5 triangle has a true right angle and a circle stays round", () => {
    const d = draw("coordinate", [it("polygon", "", "0,0,4,0,4,3")])!;
    const [A, B, C] = /<polygon points="([^"]+)"/.exec(d.svg!)![1].split(" ").map(p => p.split(",").map(Number));
    const ab = Math.hypot(A[0] - B[0], A[1] - B[1]), bc = Math.hypot(B[0] - C[0], B[1] - C[1]), ca = Math.hypot(C[0] - A[0], C[1] - A[1]);
    assert.ok(Math.abs(ab / bc - 4 / 3) < 0.02);
    assert.ok(Math.abs(ca / bc - 5 / 3) < 0.02);
  });
  test("truth tables are worked out, whatever the model might have believed", () => {
    const row = (expr: string) => draw("truth_table", [it("expression", "Q", expr)])!.table!.rows.map(r => r.at(-1)).join("");
    assert.equal(row("A AND B"), "0001");
    assert.equal(row("A OR B"), "0111");
    assert.equal(row("A XOR B"), "0110");
    assert.equal(row("A NAND B"), "1110");
    assert.equal(row("A NOR B"), "1000");
    assert.equal(row("NOT A"), "10");
    assert.equal(draw("truth_table", [it("expression", "Q", "A AND")]), null);
  });
  test("a logic circuit draws the gates in the expression and carries its truth table", () => {
    const d = draw("logic", [it("expression", "Q", "A NAND B")])!;
    assert.ok(d.svg!.includes(">NAND<"));
    assert.equal(d.table!.rows.length, 4);
  });
  test("a reaction must balance, and its atom tally is counted", () => {
    assert.equal(draw("reaction", [it("equation", "H2 + O2 -> H2O")]), null, "unbalanced is refused");
    const d = draw("reaction", [it("equation", "2H2 + O2 -> 2H2O")])!;
    assert.match(d.svg!, /H: 4 → 4/);
    assert.match(d.svg!, /O: 2 → 2/);
    // 4 H + 2 O on each side, plus two legend dots.
    assert.equal((d.svg!.match(/<circle/g) ?? []).length, 6 + 6 + 2);
  });
  test("an energy diagram needs a real barrier", () => {
    assert.equal(draw("energy", [it("reactants", "R", "50"), it("products", "P", "20"), it("activation", "Ea", "40")]), null);
  });
  test("a histogram counts every value exactly once", () => {
    const d = draw("histogram", [it("data", "", "1,2,3,4,5,6,7,8"), it("bins", "", "2")])!;
    const heights = [...d.svg!.matchAll(/<rect x="[\d.]+" y="[\d.]+" width="[\d.]+" height="([\d.]+)" fill="#251F8C"/g)].map(m => Number(m[1]));
    assert.equal(heights.length, 2);
    assert.ok(Math.abs(heights[0] - heights[1]) < 0.5);
  });
  test("a flowchart refuses a decision with nowhere to go", () => {
    assert.equal(draw("flowchart", [it("start", "S"), it("decision", "x?"), it("end", "E")]), null);
    assert.equal(draw("flowchart", [it("start", "S"), it("decision", "x?", "no:9"), it("end", "E")]), null);
    assert.ok(draw("flowchart", [it("start", "S"), it("decision", "x?", "no:3"), it("end", "E")]));
  });
  test("a slider draws every position on one vertical scale", () => {
    const d = draw("graph", [it("curve", "", "a*x"), it("slider", "a", "1,3"), it("range", "", "-2,2")])!;
    const yAt = (svg: string) => { const pts = /<polyline points="([^"]+)"/.exec(svg)![1].split(" ").map(p => p.split(",").map(Number)); return pts[0][1]; };
    const [first, , , , last] = d.frames!.map(f => yAt(f.svg));
    assert.ok(first !== last, "the curve really moves");
    const zero = d.frames!.map(f => /<line x1="60" y1="([\d.]+)"/.exec(f.svg)![1]);
    assert.equal(new Set(zero).size, 1, "the axis stays where it is");
  });
});

describe("graphs as models really describe them", () => {
  test("e is the constant", () => assert.ok(draw("graph", [it("curve", "y = e^x", "e^x")])));
  test("a slider named e still controls e", () => {
    const d = draw("graph", [it("curve", "", "e*x"), it("slider", "e", "1,3")])!;
    assert.equal(d.frames?.length, 5);
  });
  test("the equation can be read from the label", () => assert.ok(draw("graph", [it("curve", "y = x^2 - 4", "")])));
  test("a letter with no value is still refused", () => assert.equal(draw("graph", [it("curve", "y = mx + c", "m*x+c")]), null));
});

describe("labelled illustrations", () => {
  test("the model can only choose a template: an unknown name is refused", () => {
    for (const t of LABELLED_TEMPLATES) assert.ok(draw("labelled", [it("template", "", t)]), t);
    assert.equal(draw("labelled", [it("template", "", "human_heart")]), null);
  });
  test("photosynthesis shows the right things going in and out, labelled by the app", () => {
    const d = draw("labelled", [it("template", "WRONG LABEL", "photosynthesis")])!;
    for (const part of ["Sunlight", "Carbon dioxide", "Water", "Oxygen", "Sugar"]) assert.ok(d.svg!.includes(part), part);
    assert.ok(!d.svg!.includes("WRONG LABEL"));
  });
  test("no label runs off the edge, in any language", () => {
    for (const language of ["English", "French", "Kinyarwanda", "Swahili"]) for (const t of LABELLED_TEMPLATES) {
      const { svg } = draw("labelled", [it("template", "", t)], language)!;
      for (const m of svg!.matchAll(/<text x="([\d.]+)" y="[\d.]+" font-family="[^"]+" font-size="(\d+)" text-anchor="(\w+)"[^>]*>([^<]*)</g)) {
        const [x, size, anchor, s] = [Number(m[1]), Number(m[2]), m[3], m[4]];
        const width = [...s].length * size * 0.52, left = anchor === "start" ? x : anchor === "end" ? x - width : x - width / 2;
        assert.ok(left >= 0 && left + width <= 640, `${language} ${t}: "${s}" spans ${Math.round(left)} to ${Math.round(left + width)}`);
      }
    }
  });
  test("labels follow the language, and a missing Kinyarwanda term stays in English instead of being invented", () => {
    assert.ok(draw("labelled", [it("template", "", "photosynthesis")], "French")!.svg!.includes("Feuille"));
    const rw = draw("labelled", [it("template", "", "plant_cell")], "Kinyarwanda")!;
    assert.ok(rw.svg!.includes("Nucleus"), "no invented translation");
    assert.ok(draw("labelled", [it("template", "", "photosynthesis")], "Kinyarwanda")!.svg!.includes("Ikibabi"));
  });
});

describe("safety", () => {
  test("nothing a model writes can become code, in any new kind", () => {
    const evil = '<script>alert(1)</script>"onload="x';
    const pictures = [
      draw("timeline", [it("event", evil, "1"), it("event", "b", "2")]),
      draw("flowchart", [it("start", evil), it("end", evil)]),
      draw("scatter", [it("point", evil, "1,2"), it("point", "", "2,3"), it("xlabel", evil)]),
      draw("waveform", [it("signal", evil, "0101")]),
      draw("fraction", [it("fraction", evil, "1/2")]),
    ];
    for (const d of pictures) { assert.ok(d); assert.ok(isSafeSvg(d!.svg!)); assert.ok(!/<script|\sonload=/i.test(d!.svg!)); }
  });
  test("table cells stay as data for the app to escape", () => {
    const d = draw("compare", [it("column", "A"), it("column", "B"), it("row", "<img src=x>", "a|b")])!;
    assert.equal(d.svg, null);
    assert.equal(d.table!.rows[0][0], "<img src=x>");
  });
  test("the safety check rejects anything outside the allowlist", () => {
    const ok = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect x="0" y="0" width="1" height="1"/></svg>';
    assert.ok(isSafeSvg(ok));
    for (const bad of [
      '<svg><script>alert(1)</script></svg>', '<svg onload="alert(1)"></svg>', '<svg><a href="javascript:alert(1)"><text>x</text></a></svg>',
      '<svg><image href="http://x/y.png"/></svg>', '<svg><foreignObject><div/></foreignObject></svg>', '<svg><rect style="x"/></svg>',
      '<svg><rect fill="url(http://x)"/></svg>', '<svg><text>&#60;script</text></svg>', '<div></div>', '<svg><use href="#a"/></svg>',
    ]) assert.equal(isSafeSvg(bad), false, bad);
  });
  test("an invented kind is refused before it reaches the drawing code", () => {
    assert.equal(parseDiagramSpec({ kind: "raw_svg", items: [] }), null);
    assert.equal(parseDiagramSpec({ kind: "graph", svg: "<svg/>" }), null);
  });
  test("what can't be drawn is refused, not guessed: every kind with empty input", () => {
    for (const kind of DIAGRAM_KINDS) assert.equal(renderDiagram({ kind, title: "", alt: "", items: [] }), null, kind);
  });
});
