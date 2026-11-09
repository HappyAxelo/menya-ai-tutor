// Checked illustrations for what can't be computed from numbers: a leaf, a cell, the water cycle.
// The model picks a template by name and writes the explanation. It cannot move or relabel anything,
// because a wrong arrow or a label on the wrong part teaches the wrong thing.
//
// Kinyarwanda labels use only everyday words. Scientific terms stay in their usual English form
// rather than an invented translation; a fluent teacher should review this list (docs/LANGUAGE_REVIEW.md).
import { LABELLED_TEMPLATES, type LabelledTemplate } from "./diagramSpec.ts";
import { ACCENT, AMBER, circle, GREEN, GREY, INK, line, MARK, path, rect, text, W } from "./svgKit.ts";

type Labels = Record<string, string>;
const LABELS: Record<string, Labels> = {
  English: {
    sun: "Sunlight", co2: "Carbon dioxide (CO₂)", water: "Water (H₂O)", oxygen: "Oxygen (O₂)", sugar: "Sugar (glucose)", leaf: "Leaf", roots: "Roots", stem: "Stem", air: "from the air", soil: "from the soil",
    evaporation: "Evaporation", condensation: "Condensation", precipitation: "Rain (precipitation)", runoff: "Runoff", infiltration: "Water soaks in", sea: "Sea or lake", cloud: "Clouds",
    wall: "Cell wall", membrane: "Cell membrane", nucleus: "Nucleus", vacuole: "Vacuole", chloroplast: "Chloroplast", mitochondrion: "Mitochondrion", cytoplasm: "Cytoplasm", ribosome: "Ribosomes",
    solid: "Solid", liquid: "Liquid", gas: "Gas", solid2: "Particles fixed, packed tight", liquid2: "Particles close, can slide", gas2: "Particles far apart, moving fast",
    crater: "Crater", vent: "Main vent", magma: "Magma chamber", lava: "Lava flow", ash: "Ash cloud", layers: "Layers",
  },
  French: {
    sun: "Lumière du soleil", co2: "Dioxyde de carbone (CO₂)", water: "Eau (H₂O)", oxygen: "Dioxygène (O₂)", sugar: "Sucre (glucose)", leaf: "Feuille", roots: "Racines", stem: "Tige", air: "dans l'air", soil: "dans le sol",
    evaporation: "Évaporation", condensation: "Condensation", precipitation: "Pluie (précipitations)", runoff: "Ruissellement", infiltration: "Infiltration", sea: "Mer ou lac", cloud: "Nuages",
    wall: "Paroi cellulaire", membrane: "Membrane cellulaire", nucleus: "Noyau", vacuole: "Vacuole", chloroplast: "Chloroplaste", mitochondrion: "Mitochondrie", cytoplasm: "Cytoplasme", ribosome: "Ribosomes",
    solid: "Solide", liquid: "Liquide", gas: "Gaz", solid2: "Particules fixes et serrées", liquid2: "Particules proches, qui glissent", gas2: "Particules éloignées et rapides",
    crater: "Cratère", vent: "Cheminée", magma: "Chambre magmatique", lava: "Coulée de lave", ash: "Nuage de cendres", layers: "Couches",
  },
  Kinyarwanda: {
    sun: "Izuba", water: "Amazi (H₂O)", leaf: "Ikibabi", roots: "Imizi", stem: "Uruti", sugar: "Isukari (glucose)", co2: "CO₂ (carbon dioxide)", oxygen: "O₂ (oxygen)", air: "mu mwuka", soil: "mu butaka",
    precipitation: "Imvura", sea: "Inyanja cyangwa ikiyaga", cloud: "Ibicu", gas: "Gaz",
  },
  Swahili: {
    sun: "Mwanga wa jua", water: "Maji (H₂O)", leaf: "Jani", roots: "Mizizi", stem: "Shina", sugar: "Sukari (glukosi)", co2: "Kaboni dioksidi (CO₂)", oxygen: "Oksijeni (O₂)", air: "kutoka hewani", soil: "kutoka udongoni",
    precipitation: "Mvua", sea: "Bahari au ziwa", cloud: "Mawingu",
  },
};
const label = (language: string | null, key: string) => LABELS[language ?? "English"]?.[key] ?? LABELS.English[key];

// A label joined to the part it names by a thin line.
function callout(fromX: number, fromY: number, toX: number, toY: number, s: string, side: "left" | "right", on: boolean) {
  const color = on ? MARK : INK;
  return line(fromX, fromY, toX, toY, { color, width: on ? 2.5 : 1.5 }) + circle(toX, toY, 3.5, { fill: color, stroke: color, width: 1 }) +
    text(fromX + (side === "left" ? -6 : 6), fromY + 5, s, { anchor: side === "left" ? "end" : "start", size: 15, fill: color, weight: on ? "bold" : undefined, halo: true });
}

function photosynthesis(L: (k: string) => string, hot: string | null) {
  const out: string[] = [];
  const on = (k: string) => hot === k;
  // The ground and the plant.
  out.push(rect(0, 352, W, 48, { fill: "#d9c7a8", stroke: "#d9c7a8" }));
  out.push(line(320, 352, 320, 190, { color: GREEN, width: 8 }));
  out.push(path("M 320 352 L 288 392 M 320 352 L 320 396 M 320 352 L 354 392 M 300 376 L 276 382 M 340 376 L 366 380", { stroke: "#7c5a2b", width: 4 }));
  out.push(`<ellipse cx="320" cy="150" rx="125" ry="66" fill="#6fbf73" stroke="${GREEN}" stroke-width="3"/>`, line(205, 150, 435, 150, { color: GREEN, width: 2 }));
  out.push(text(320, 142, L("leaf"), { weight: "bold", size: 17 }));
  // In.
  out.push(circle(52, 60, 26, { fill: "#fbbf24", stroke: AMBER }));
  out.push(line(84, 74, 214, 118, { color: AMBER, width: 4, arrow: true }), text(14, 122, L("sun"), { fill: on("sun") ? MARK : AMBER, weight: "bold", anchor: "start", halo: true }));
  out.push(line(50, 200, 204, 170, { color: ACCENT, width: 4, arrow: true }), text(14, 228, L("co2"), { fill: on("co2") ? MARK : ACCENT, weight: "bold", anchor: "start", halo: true }), text(14, 248, L("air"), { anchor: "start", size: 14 }));
  out.push(line(345, 330, 345, 222, { color: "#2563eb", width: 4, arrow: true }), text(358, 300, L("water"), { fill: on("water") ? MARK : "#2563eb", weight: "bold", anchor: "start", halo: true }), text(358, 320, L("soil"), { anchor: "start", size: 14 }));
  // Out.
  out.push(line(430, 118, 576, 74, { color: GREEN, width: 4, arrow: true }), text(626, 58, L("oxygen"), { fill: on("oxygen") ? MARK : GREEN, weight: "bold", anchor: "end", halo: true }));
  out.push(line(442, 170, 586, 206, { color: MARK, width: 4, arrow: true }), text(626, 234, L("sugar"), { fill: MARK, weight: "bold", anchor: "end", halo: true }));
  return out.join("");
}

function waterCycle(L: (k: string) => string, hot: string | null) {
  const c = (k: string, base: string) => hot === k ? MARK : base;
  const out: string[] = [];
  out.push(circle(58, 62, 28, { fill: "#fbbf24", stroke: AMBER }));
  // Sea on the left, land rising to the right.
  out.push(`<polygon points="0,322 250,322 300,300 470,180 640,150 640,400 0,400" fill="#d9c7a8" stroke="#a88d62" stroke-width="2"/>`);
  out.push(`<polygon points="0,322 272,322 250,360 0,360" fill="#7cb4e8" stroke="#2563eb" stroke-width="2"/>`, text(120, 348, L("sea"), { weight: "bold", size: 15 }));
  // Clouds.
  for (const [x, y, r] of [[350, 92, 30], [392, 78, 38], [440, 92, 30], [395, 106, 34]] as const) out.push(circle(x, y, r, { fill: "#e6e8ef", stroke: "#e6e8ef" }));
  out.push(text(395, 96, L("cloud"), { weight: "bold", size: 15 }));
  // Evaporation up, condensation across, rain down, runoff back, water soaking in.
  out.push(line(135, 318, 135, 180, { color: c("evaporation", "#2563eb"), width: 4, dash: "9 7", arrow: true }), line(195, 318, 195, 180, { color: c("evaporation", "#2563eb"), width: 4, dash: "9 7", arrow: true }), text(120, 160, L("evaporation"), { weight: "bold", fill: c("evaporation", "#2563eb"), halo: true }));
  out.push(path("M 165 148 C 220 106 272 94 334 94", { stroke: c("condensation", GREY), width: 4, arrow: true }), text(232, 84, L("condensation"), { weight: "bold", fill: c("condensation", INK), halo: true }));
  for (const x of [430, 470, 510]) out.push(line(x, 146, x - 10, 186 + (x - 430) * -0.2, { color: c("precipitation", "#2563eb"), width: 3, arrow: true }));
  out.push(text(636, 130, L("precipitation"), { weight: "bold", anchor: "end", fill: c("precipitation", "#2563eb"), halo: true }));
  out.push(path("M 470 204 C 410 248 346 294 282 326", { stroke: c("runoff", "#2563eb"), width: 5, arrow: true }), text(402, 300, L("runoff"), { weight: "bold", anchor: "start", fill: c("runoff", INK), halo: true }));
  out.push(line(560, 196, 560, 300, { color: c("infiltration", "#7c5a2b"), width: 4, dash: "6 6", arrow: true }), text(626, 332, L("infiltration"), { weight: "bold", anchor: "end", fill: c("infiltration", INK), halo: true }));
  return out.join("");
}

function plantCell(L: (k: string) => string, hot: string | null) {
  const out: string[] = [];
  out.push(rect(170, 56, 300, 300, { fill: "#e7f3e0", stroke: GREEN, rx: 16, width: 7 }));
  out.push(rect(180, 66, 280, 280, { fill: "#f4f9ec", stroke: "#73a15c", rx: 10, width: 2 }));
  out.push(rect(258, 96, 180, 212, { fill: "#cfe7fb", stroke: "#2563eb", rx: 30 }));
  out.push(circle(216, 128, 30, { fill: "#d7c4f2", stroke: ACCENT }), circle(216, 128, 10, { fill: ACCENT, stroke: ACCENT }));
  for (const [x, y] of [[212, 216], [214, 268], [300, 330], [380, 330]]) out.push(`<ellipse cx="${x}" cy="${y}" rx="22" ry="11" fill="#6fbf73" stroke="${GREEN}" stroke-width="2"/>`);
  out.push(`<ellipse cx="206" cy="316" rx="18" ry="10" fill="#f0a97a" stroke="${AMBER}" stroke-width="2"/>`);
  const c = (a: number[], s: string, side: "left" | "right", k: string) => callout(a[0], a[1], a[2], a[3], L(s), side, hot === k);
  out.push(c([150, 70, 170, 90], "wall", "left", "wall"), c([160, 150, 184, 150], "membrane", "left", "membrane"), c([150, 118, 192, 124], "nucleus", "left", "nucleus"),
    c([150, 230, 202, 222], "chloroplast", "left", "chloroplast"), c([150, 316, 192, 316], "mitochondrion", "left", "mitochondrion"),
    c([490, 180, 430, 180], "vacuole", "right", "vacuole"), c([490, 322, 440, 322], "cytoplasm", "right", "cytoplasm"));
  return out.join("");
}

function animalCell(L: (k: string) => string, hot: string | null) {
  const out: string[] = [];
  out.push(`<ellipse cx="320" cy="208" rx="176" ry="146" fill="#fbe9de" stroke="${AMBER}" stroke-width="3"/>`);
  out.push(circle(300, 190, 54, { fill: "#d7c4f2", stroke: ACCENT }), circle(300, 190, 18, { fill: ACCENT, stroke: ACCENT }));
  for (const [x, y] of [[396, 134], [414, 262], [214, 284]]) out.push(`<ellipse cx="${x}" cy="${y}" rx="28" ry="13" fill="#f0a97a" stroke="${AMBER}" stroke-width="2"/>`);
  for (const [x, y] of [[240, 118], [262, 106], [286, 104], [354, 288], [330, 300], [306, 304], [400, 200], [420, 190]]) out.push(circle(x, y, 3.5, { fill: INK, stroke: INK, width: 1 }));
  const c = (a: number[], s: string, side: "left" | "right", k: string) => callout(a[0], a[1], a[2], a[3], L(s), side, hot === k);
  out.push(c([150, 180, 262, 186], "nucleus", "left", "nucleus"), c([150, 300, 194, 288], "mitochondrion", "left", "mitochondrion"), c([160, 92, 196, 104.5], "membrane", "left", "membrane"),
    c([510, 110, 290, 104], "ribosome", "right", "ribosome"), c([510, 240, 452, 226], "cytoplasm", "right", "cytoplasm"));
  return out.join("");
}

function statesOfMatter(L: (k: string) => string) {
  const out: string[] = [];
  const boxW = 180, top = 60, boxH = 210, xs = [20, 230, 440];
  // Fixed positions so the picture is the same every time and particles never overlap.
  const solid: number[][] = [], R = 13;
  for (let i = 0; i < 6; i++) for (let j = 0; j < 7; j++) solid.push([xs[0] + 16 + i * 30, top + 18 + j * 30]);
  const liquid: number[][] = [];
  for (let j = 0; j < 4; j++) for (let i = 0; i < 6; i++) liquid.push([xs[1] + 20 + i * 28 + (j % 2) * 8 + ((i * 7 + j * 3) % 5), top + 100 + j * 27 + ((i * 3 + j) % 3)]);
  const gas = [[34, 34], [120, 22], [150, 96], [60, 112], [24, 176], [106, 182], [156, 164]].map(([x, y]) => [xs[2] + x, top + y]);
  xs.forEach(x => out.push(rect(x, top, boxW, boxH, { fill: "#fff", stroke: INK, width: 2.5 })));
  for (const [x, y] of [...solid, ...liquid]) out.push(circle(x, y, R, { fill: ACCENT, stroke: "#fff", width: 1.5 }));
  for (const [x, y] of gas) out.push(circle(x, y, R, { fill: ACCENT, stroke: "#fff", width: 1.5 }));
  ["solid", "liquid", "gas"].forEach((k, i) => {
    out.push(text(xs[i] + boxW / 2, top + boxH + 28, L(k), { weight: "bold", size: 18 }));
    const words = L(`${k}2`).split(" "), half = Math.ceil(words.length / 2);
    out.push(text(xs[i] + boxW / 2, top + boxH + 52, words.slice(0, half).join(" "), { size: 14 }), text(xs[i] + boxW / 2, top + boxH + 72, words.slice(half).join(" "), { size: 14 }));
  });
  return out.join("");
}

function volcano(L: (k: string) => string, hot: string | null) {
  const out: string[] = [];
  out.push(rect(0, 330, W, 70, { fill: "#d9c7a8", stroke: "#d9c7a8" }));
  out.push(`<polygon points="110,330 288,110 352,110 530,330" fill="#b8a78c" stroke="#7c5a2b" stroke-width="2"/>`);
  // Old layers inside the cone.
  for (const k of [1, 2, 3]) out.push(path(`M ${110 + k * 44} ${330 - k * 54} L ${530 - k * 44} ${330 - k * 54}`, { stroke: "#7c5a2b", width: 1.5, dash: "7 6" }));
  out.push(`<ellipse cx="320" cy="362" rx="118" ry="30" fill="${MARK}" stroke="#7f1d1d" stroke-width="2"/>`);
  out.push(`<polygon points="310,334 330,334 330,110 310,110" fill="${MARK}" stroke="#7f1d1d" stroke-width="2"/>`);
  out.push(path("M 330 112 C 370 170 410 240 470 322", { stroke: "#ea580c", width: 9 }));
  for (const [x, y, r] of [[300, 84, 22], [332, 68, 30], [368, 82, 24], [340, 102, 26]] as const) out.push(circle(x, y, r, { fill: GREY, stroke: GREY }));
  const c = (a: number[], s: string, side: "left" | "right", k: string) => callout(a[0], a[1], a[2], a[3], L(s), side, hot === k);
  out.push(c([240, 80, 300, 84], "ash", "left", "ash"), c([190, 126, 312, 118], "crater", "left", "crater"), c([180, 220, 312, 222], "vent", "left", "vent"),
    c([172, 366, 216, 362], "magma", "left", "magma"), c([516, 206, 412, 240], "lava", "right", "lava"), c([560, 292, 440, 276], "layers", "right", "layers"));
  return out.join("");
}

const DRAWINGS: Record<LabelledTemplate, (L: (k: string) => string, hot: string | null) => string> = {
  photosynthesis, water_cycle: waterCycle, plant_cell: plantCell, animal_cell: animalCell, states_of_matter: statesOfMatter, volcano,
};

export function drawLabelled(template: string, language: string | null, highlight: string | null): string | null {
  const name = template.trim().replace(/[\s-]+/g, "_") as LabelledTemplate;
  if (!LABELLED_TEMPLATES.includes(name)) return null;
  return DRAWINGS[name](k => label(language, k), highlight ? highlight.replace(/[\s-]+/g, "") : null);
}

// A description for readers who can't see the picture, in the two languages the labels are complete in.
const ALT: Record<LabelledTemplate, { English: string; French: string }> = {
  photosynthesis: { English: "A plant. Sunlight and carbon dioxide go into the leaf, and water comes up from the roots. Oxygen and sugar come out.", French: "Une plante. La lumière et le dioxyde de carbone entrent dans la feuille, l'eau monte depuis les racines. Le dioxygène et le sucre sortent." },
  water_cycle: { English: "Water evaporates from the sea, condenses into clouds, falls as rain, then runs back to the sea or soaks into the ground.", French: "L'eau s'évapore de la mer, se condense en nuages, tombe en pluie, puis retourne à la mer ou s'infiltre dans le sol." },
  plant_cell: { English: "A plant cell with its cell wall, cell membrane, nucleus, large vacuole, chloroplasts, mitochondrion and cytoplasm.", French: "Une cellule végétale avec sa paroi, sa membrane, son noyau, sa grande vacuole, ses chloroplastes, une mitochondrie et le cytoplasme." },
  animal_cell: { English: "An animal cell with its cell membrane, nucleus, mitochondria, ribosomes and cytoplasm.", French: "Une cellule animale avec sa membrane, son noyau, des mitochondries, des ribosomes et le cytoplasme." },
  states_of_matter: { English: "Particles in a solid are packed in rows, in a liquid they are close but disordered, and in a gas they are far apart.", French: "Dans un solide, les particules sont rangées et serrées. Dans un liquide, elles sont proches mais en désordre. Dans un gaz, elles sont éloignées." },
  volcano: { English: "A cross-section of a volcano: a magma chamber below, a main vent rising to the crater, layers of old lava and ash, a lava flow and an ash cloud.", French: "Une coupe de volcan : la chambre magmatique en bas, la cheminée jusqu'au cratère, des couches de lave et de cendres, une coulée de lave et un nuage de cendres." },
};
export const templateAlt = (name: LabelledTemplate, language: string | null) => ALT[name][language === "French" ? "French" : "English"];

// ---------- molecules: geometry from a fixed table, bonds as drawn in a school textbook ----------
type Bond = [number, number, 1 | 2 | 3];
const MOLECULES: Record<string, { atoms: [string, number, number][]; bonds: Bond[]; shape: string }> = {
  h2o: { atoms: [["O", 0, 0], ["H", -1.3, 1.0], ["H", 1.3, 1.0]], bonds: [[0, 1, 1], [0, 2, 1]], shape: "H₂O" },
  co2: { atoms: [["O", -2.2, 0], ["C", 0, 0], ["O", 2.2, 0]], bonds: [[0, 1, 2], [1, 2, 2]], shape: "CO₂" },
  o2: { atoms: [["O", -1.1, 0], ["O", 1.1, 0]], bonds: [[0, 1, 2]], shape: "O₂" },
  h2: { atoms: [["H", -1, 0], ["H", 1, 0]], bonds: [[0, 1, 1]], shape: "H₂" },
  n2: { atoms: [["N", -1.2, 0], ["N", 1.2, 0]], bonds: [[0, 1, 3]], shape: "N₂" },
  hcl: { atoms: [["H", -1.2, 0], ["Cl", 1.2, 0]], bonds: [[0, 1, 1]], shape: "HCl" },
  ch4: { atoms: [["C", 0, 0], ["H", 0, -1.8], ["H", 1.8, 0], ["H", 0, 1.8], ["H", -1.8, 0]], bonds: [[0, 1, 1], [0, 2, 1], [0, 3, 1], [0, 4, 1]], shape: "CH₄" },
  nh3: { atoms: [["N", 0, -0.2], ["H", -1.6, 1.0], ["H", 0, 1.8], ["H", 1.6, 1.0]], bonds: [[0, 1, 1], [0, 2, 1], [0, 3, 1]], shape: "NH₃" },
};
const ATOM_FILL: Record<string, string> = { H: "#e3e1ef", O: MARK, C: "#3d3a52", N: ACCENT, Cl: GREEN };
export function drawMolecule(name: string): string | null {
  const m = MOLECULES[name.trim().toLowerCase().replace(/[₂]/g, "2").replace(/[₃]/g, "3").replace(/[₄]/g, "4")];
  if (!m) return null;
  const cx = W / 2, cy = 196, u = 64, px = (v: number) => cx + v * u, py = (v: number) => cy + v * u;
  const out: string[] = [];
  for (const [a, b, order] of m.bonds) {
    const [, ax, ay] = m.atoms[a], [, bx, by] = m.atoms[b];
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy), nx = -dy / len * 7, ny = dx / len * 7;
    for (let k = 0; k < order; k++) { const off = k - (order - 1) / 2; out.push(line(px(ax) + nx * off, py(ay) + ny * off, px(bx) + nx * off, py(by) + ny * off, { width: 4 })); }
  }
  for (const [el, x, y] of m.atoms) {
    const r = el === "H" ? 24 : 36;
    out.push(circle(px(x), py(y), r, { fill: ATOM_FILL[el] ?? GREY, stroke: INK }), text(px(x), py(y) + 7, el, { fill: el === "H" ? INK : "#fff", weight: "bold", size: 20 }));
  }
  out.push(text(W / 2, 372, m.shape, { weight: "bold", size: 20 }));
  return out.join("");
}
