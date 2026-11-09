// What a model may ask to be shown: the kinds, the checks on its description, and the catalogue it reads.
// Kept apart from the drawing code so the web app's bundle doesn't carry the renderers.
export const DIAGRAM_KINDS = ["graph", "circuit", "triangle", "forces", "flow", "array", "bars", "atom",
  "fraction", "numberline", "coordinate", "logic", "truth_table", "flowchart", "timeline", "compare", "scatter", "histogram", "waveform", "energy", "reaction", "climate", "labelled", "molecule"] as const;
export type DiagramKind = typeof DIAGRAM_KINDS[number];
// Rendered as accessible tables in the app: no picture is drawn, so these don't use the daily picture allowance.
export const TABLE_KINDS: DiagramKind[] = ["truth_table", "compare"];
export const LABELLED_TEMPLATES = ["photosynthesis", "water_cycle", "plant_cell", "animal_cell", "states_of_matter", "volcano"] as const;
export type LabelledTemplate = typeof LABELLED_TEMPLATES[number];

export interface DiagramItem { role: string; label: string; value: string }
export interface DiagramSpec { kind: DiagramKind; title: string; alt: string; items: DiagramItem[] }

export function parseDiagramSpec(raw: unknown): DiagramSpec | null {
  const d = raw as any;
  if (!d || typeof d !== "object" || !DIAGRAM_KINDS.includes(d.kind) || !Array.isArray(d.items)) return null;
  const keepCase = d.kind === "compare";
  const valueLimit = keepCase ? 200 : 80;
  return { kind: d.kind, title: typeof d.title === "string" ? d.title.slice(0, 60) : "", alt: typeof d.alt === "string" ? d.alt.slice(0, 300) : "",
    items: d.items.slice(0, 40).filter((i: any) => i && typeof i.role === "string")
      .map((i: any) => { const v = String(i.value ?? "").trim().slice(0, valueLimit);
        return { role: i.role.trim().toLowerCase(), label: String(i.label ?? "").slice(0, 60), value: keepCase ? v : v.toLowerCase() }; }) };
}

// Sent to the model only for the kinds this turn may use, because every line costs tokens on every request.
export const VISUAL_CATALOGUE: Record<DiagramKind, string> = {
  graph: 'graph: role "curve" (label "y = x^2 - 4", value the expression "x^2-4" in x), optional "point" (label, value "2,0"; points not on the curve are dropped), optional "range" (value "-5,5"). Optional "slider" (label the letter "a", value "-3,3") when the expression uses that letter: the student moves it to see the curve change.',
  circuit: 'circuit: one "battery" (label "12 V"), then in order "resistor", "lamp", "capacitor", "switch", "ammeter" or "voltmeter" (label "4 Ω"; value "parallel" if in parallel with the others marked so, otherwise ""), optional "current" (label "I").',
  triangle: 'triangle (right-angled): "angle" (label "θ"), "opposite", "adjacent", "hypotenuse" (label; value the length if known).',
  forces: 'forces: "surface" (value "flat" or "incline 30"), then one "force" for EVERY force (label "W", value one of down, up, left, right, normal, along-up, along-down). On a slope: weight is down, the normal reaction is normal, friction holding a block still is along-up.',
  flow: 'flow: "step" in order (label); add "loop" if it is a cycle.',
  array: 'array: "cell" (label; value "highlight", "dim" or ""); start a new row with "row" (label) to show steps. Several rows become a step-through for the student.',
  bars: 'bars: "bar" (label, value a number).',
  atom: 'atom: "nucleus" (label, the symbol only, like "Na"), then "shell" (value the number of electrons), innermost first.',
  fraction: 'fraction: "fraction" (value "3/4", label optional), up to 4; bars share one scale, so equal fractions line up.',
  numberline: 'numberline: "range" (value "-5,5"), optional "step" (value "1/4"), "point" (label, value "3/4"), "interval" (label, value "2,inf" or "-1,3", add ",open" for excluded ends), "jump" (label "+3", value "2,5").',
  coordinate: 'coordinate: exact geometry on a grid. "point" (label "A", value "2,3"), "line" (label, value "y=2x+1" or "x=3"), "segment" (value "0,0,4,3"), "polygon" (value "0,0,4,0,4,3"), "circle" (value "0,0,5" for centre and radius).',
  logic: 'logic: a gate circuit worked out from the expression. "expression" (label the output name, value "A AND (NOT B)"; AND, OR, NOT, XOR, NAND, NOR).',
  truth_table: 'truth_table: computed, never typed. "expression" (label the column heading, value "A AND B"), up to 3.',
  flowchart: 'flowchart: "start", "process", "decision" (a yes/no question), "end" in order (label). The yes path continues to the next item; a decision needs value "no:N" where N is the item number to go to; a process may have value "goto:N" to go back.',
  timeline: 'timeline: "event" (label what happened, value the year or order).',
  compare: 'compare: a table of differences. "column" (label) for each thing compared, then "row" (label the feature, value the cells separated by |).',
  scatter: 'scatter: "point" (value "x,y"), optional "xlabel", "ylabel" (label), optional "trend" for a best-fit line that is computed.',
  histogram: 'histogram: "data" (value the numbers "2,3,3,5,7") with optional "bins" (value 5), or "bin" (label "0-10", value the count). Optional "xlabel", "ylabel".',
  waveform: 'waveform: "signal" (label "A", value bits "0110" for digital, or "sine 2", "square 3", "triangle 1" for that many cycles), up to 4.',
  energy: 'energy: "reactants", "products", "activation" (label, value the energy; activation must be the highest), optional "axis" (label).',
  reaction: 'reaction: "equation" with the balanced equation in label ("2H2 + O2 -> 2H2O"). Unbalanced equations are refused.',
  climate: 'climate: only with data the student gave. 12 "month" (label "J", value "temperature,rainfall"), optional "templabel", "rainlabel".',
  labelled: `labelled: a checked science illustration whose labels the app supplies. One "template" (value one of ${LABELLED_TEMPLATES.join(", ")}), optional "highlight" (value a part name).`,
  molecule: 'molecule: one "name" (value one of h2o, co2, o2, h2, n2, ch4, nh3, hcl).',
};
