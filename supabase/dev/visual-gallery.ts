// Draws one of every visual kind into a single HTML page, for a person to check by eye.
//   cd supabase && node dev/visual-gallery.ts <output.html> [language]
import { writeFileSync } from "node:fs";
import { renderDiagram } from "../functions/_shared/diagram.ts";
import type { DiagramSpec } from "../functions/_shared/diagramSpec.ts";

const it = (role: string, label = "", value = "") => ({ role, label, value });
const spec = (kind: DiagramSpec["kind"], title: string, items: ReturnType<typeof it>[]): DiagramSpec => ({ kind, title, alt: title, items });
const language = process.argv[3] ?? "English";

export const GALLERY: DiagramSpec[] = [
  spec("fraction", "1/2 and 2/4 are the same amount", [it("fraction", "", "1/2"), it("fraction", "", "2/4"), it("fraction", "", "3/4")]),
  spec("fraction", "An improper fraction", [it("fraction", "", "7/4")]),
  spec("numberline", "Adding on a number line", [it("range", "", "-2,8"), it("point", "start", "2"), it("jump", "+3", "2,5")]),
  spec("numberline", "x > 1 and -1 < y ≤ 3", [it("range", "", "-3,5"), it("interval", "x > 1", "1,inf,open"), it("interval", "y", "-1,3")]),
  spec("numberline", "Quarters", [it("range", "", "0,1"), it("step", "", "1/4"), it("point", "3/4", "3/4")]),
  spec("coordinate", "A right triangle and a line", [it("polygon", "", "0,0,4,0,4,3"), it("point", "A", "4,3"), it("line", "y = x + 1", "y=x+1")]),
  spec("coordinate", "A circle of radius 5", [it("circle", "", "0,0,5"), it("point", "P", "3,4")]),
  spec("logic", "AND then NOT", [it("expression", "Q", "A AND (NOT B)")]),
  spec("logic", "Three inputs", [it("expression", "Q", "(A NAND B) OR (C XOR D)")]),
  spec("truth_table", "AND", [it("expression", "A AND B", "A AND B")]),
  spec("flowchart", "A for loop", [it("start", "Start"), it("process", "i = 0"), it("decision", "Is i less than 3?", "no:6"), it("process", "print(i)"), it("process", "i = i + 1", "goto:3"), it("end", "Stop")]),
  spec("timeline", "Events in order", [it("event", "Rwanda joins the Commonwealth", "2009"), it("event", "Independence", "1962"), it("event", "New constitution", "2003")]),
  spec("compare", "Series and parallel", [it("column", "Series"), it("column", "Parallel"), it("row", "Current", "same everywhere|splits between branches"), it("row", "Voltage", "shared between parts|same across each branch")]),
  spec("scatter", "Hours and marks", [it("point", "", "1,40"), it("point", "", "2,52"), it("point", "", "3,55"), it("point", "", "5,70"), it("point", "", "6,82"), it("trend"), it("xlabel", "Hours studied"), it("ylabel", "Mark")]),
  spec("histogram", "Marks in a class", [it("data", "", "12,15,18,22,25,25,31,33,34,38,41,44,46,52"), it("bins", "", "4"), it("xlabel", "Mark"), it("ylabel", "Students")]),
  spec("waveform", "Digital and sine", [it("signal", "A", "01101001"), it("signal", "CLK", "square 4"), it("signal", "V", "sine 2"), it("signal", "T", "triangle 2")]),
  spec("energy", "An exothermic reaction", [it("reactants", "Reactants", "50"), it("products", "Products", "20"), it("activation", "Ea", "90"), it("change", "ΔH"), it("axis", "Energy")]),
  spec("reaction", "Burning hydrogen", [it("equation", "2H2 + O2 -> 2H2O")]),
  spec("reaction", "Burning methane", [it("equation", "CH4 + 2O2 -> CO2 + 2H2O")]),
  spec("climate", "A climate graph", ["J:21,80", "F:21,100", "M:21,130", "A:20,190", "M:20,120", "J:20,20", "J:21,15", "A:22,45", "S:22,90", "O:21,110", "N:20,130", "D:20,90"].map(s => { const [m, v] = s.split(":"); return it("month", m, v); })),
  ...(["photosynthesis", "water_cycle", "plant_cell", "animal_cell", "states_of_matter", "volcano"] as const).map(t => spec("labelled", t.replace(/_/g, " "), [it("template", "", t)])),
  ...["h2o", "co2", "ch4", "nh3", "n2"].map(m => spec("molecule", m.toUpperCase(), [it("name", "", m)])),
  spec("graph", "y = a·x²", [it("curve", "y = a x^2", "a*x^2"), it("slider", "a", "-2,2"), it("range", "", "-3,3")]),
  spec("array", "Binary search", [it("row", "start"), ...[1, 3, 5, 7, 9, 11].map(v => it("cell", String(v))), it("row", "half"), ...[1, 3, 5].map(v => it("cell", String(v), "dim")), ...[7, 9, 11].map(v => it("cell", String(v), v === 9 ? "highlight" : ""))]),
];

const out = process.argv[2];
if (out) {
  const cards = GALLERY.map(s => {
    const d = renderDiagram(s, { language });
    const table = d?.table ? `<table border=1 cellpadding=6>${[d.table.headers, ...d.table.rows].map(r => `<tr>${r.map(c => `<td>${c}</td>`).join("")}</tr>`).join("")}</table>` : "";
    const frames = d?.frames ? `<p>${d.frames.length} frames: ${d.frames.map(f => f.label).join(" | ")}</p>` : "";
    return `<div class=c><b>${s.kind}: ${s.title}</b><br>${d ? `${d.svg ?? ""}${table}${frames}` : "<p style=color:red>REFUSED</p>"}</div>`;
  }).join("\n");
  writeFileSync(out, `<!doctype html><meta charset=utf-8><style>body{font:13px Arial;margin:8px;background:#ddd}.c{display:inline-block;vertical-align:top;width:430px;background:#fff;margin:4px;padding:6px}svg{width:100%;height:auto}</style>${cards}`);
  console.log(`Wrote ${GALLERY.length} visuals to ${out}`);
}
