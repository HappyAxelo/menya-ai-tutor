// Pictures in tutor replies. The model only says WHAT to show (a small structured description);
// this code does the drawing, so curves are really plotted, geometry is really right and nothing
// the model writes can run in a browser: labels are escaped text and everything else is computed.
// Free-form drawings by the model were tried first and were often wrong (marked points off the
// curve, jumbled circuits), which is worse for a learner than no picture.
import { evaluate, parseExpression } from "./engine/expr.ts";

export const DIAGRAM_KINDS = ["graph", "circuit", "triangle", "forces", "flow", "array", "bars", "atom"] as const;
export type DiagramKind = typeof DIAGRAM_KINDS[number];
export interface DiagramItem { role: string; label: string; value: string }
export interface DiagramSpec { kind: DiagramKind; title: string; alt: string; items: DiagramItem[] }
export interface Diagram { svg: string; alt: string; text: string }   // text: every label, for the answer-leak check

const W = 640, H = 400;
const INK = "#1d1b2e", ACCENT = "#251F8C", MARK = "#b42318", SOFT = "#ece9fb", COLORS = [ACCENT, "#b42318", "#0f766e", "#b54708"];
const FONT = 'font-family="Arial, Helvetica, sans-serif"';

const pretty = (s: string) => s.replace(/\^2\b/g, "²").replace(/\^3\b/g, "³").replace(/\*/g, "·");
const esc = (s: unknown) => pretty(String(s ?? "").slice(0, 60)).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const n = (v: number) => (Math.round(v * 10) / 10).toString();
const text = (x: number, y: number, s: string, o: { size?: number; anchor?: string; fill?: string; weight?: string; base?: string; halo?: boolean } = {}) =>
  `<text x="${n(x)}" y="${n(y)}" ${FONT} font-size="${o.size ?? 16}" text-anchor="${o.anchor ?? "middle"}" fill="${o.fill ?? INK}"${o.weight ? ` font-weight="${o.weight}"` : ""}${o.base ? ` dominant-baseline="${o.base}"` : ""}${o.halo ? ' stroke="#fff" stroke-width="3" paint-order="stroke"' : ""}>${esc(s)}</text>`;
const line = (x1: number, y1: number, x2: number, y2: number, o: { color?: string; width?: number; arrow?: boolean; dash?: string } = {}) =>
  `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="${o.color ?? INK}" stroke-width="${o.width ?? 2}"${o.dash ? ` stroke-dasharray="${o.dash}"` : ""}${o.arrow ? ' marker-end="url(#arrow)"' : ""}/>`;
const rect = (x: number, y: number, w: number, h: number, o: { fill?: string; stroke?: string; rx?: number; width?: number; transform?: string } = {}) =>
  `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${o.fill ?? "#fff"}" stroke="${o.stroke ?? INK}" stroke-width="${o.width ?? 2}"${o.rx ? ` rx="${o.rx}"` : ""}${o.transform ? ` transform="${o.transform}"` : ""}/>`;
const circle = (x: number, y: number, r: number, o: { fill?: string; stroke?: string; width?: number } = {}) =>
  `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="${o.fill ?? "#fff"}" stroke="${o.stroke ?? INK}" stroke-width="${o.width ?? 2}"/>`;

// Words into lines that fit a box.
function wrap(s: string, chars: number, maxLines = 3): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const word of s.trim().split(/\s+/)) {
    if (cur && (cur + " " + word).length > chars) { lines.push(cur); cur = word; } else cur = cur ? `${cur} ${word}` : word;
  }
  if (cur) lines.push(cur);
  return lines.slice(0, maxLines);
}

const nums = (s: string) => (s.replace(/[−–]/g, "-").match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);

// ---------- graph: curves are evaluated, never drawn from the model's idea of them ----------
function drawGraph(items: DiagramItem[]): string | null {
  const curves = items.filter(i => i.role === "curve").slice(0, 3)
    .map(i => ({ label: i.label, node: parseExpression(i.value.replace(/[−–]/g, "-").replace(/^\s*[a-z](?:\(x\))?\s*=\s*/i, "")) }));
  if (!curves.length || curves.some(c => !c.node)) return null;
  const f = (c: typeof curves[number], x: number) => { try { return evaluate(c.node!, { x }); } catch { return NaN; } };
  const r = nums(items.find(i => i.role === "range")?.value ?? "");
  const [x0, x1] = r.length >= 2 && r[1] > r[0] ? [r[0], r[1]] : [-5, 5];
  const steps = 240;
  const samples = curves.map(c => Array.from({ length: steps + 1 }, (_, k) => { const x = x0 + (x1 - x0) * k / steps; return [x, f(c, x)] as const; }));
  const ys = samples.flat().map(p => p[1]).filter(Number.isFinite).sort((a, b) => a - b);
  if (ys.length < 10) return null;
  // Ignore the extreme tails (a curve shooting to infinity shouldn't flatten everything else).
  let y0 = Math.min(ys[Math.floor(ys.length * 0.02)], 0), y1 = Math.max(ys[Math.floor(ys.length * 0.98)], 0);
  if (y1 - y0 < 1e-9) { y0 -= 1; y1 += 1; }
  const pad = (y1 - y0) * 0.1; y0 -= pad; y1 += pad;
  const L = 60, R = W - 30, T = 56, B = H - 36;
  const px = (x: number) => L + (x - x0) / (x1 - x0) * (R - L), py = (y: number) => B - (y - y0) / (y1 - y0) * (B - T);
  const clampX = (x: number) => Math.min(Math.max(x, x0), x1), ax = px(clampX(0)), ay = py(Math.min(Math.max(0, y0), y1));
  const out: string[] = [line(L, ay, R + 12, ay, { arrow: true }), line(ax, B + 10, ax, T - 12, { arrow: true }),
    text(R + 8, ay - 10, "x", { anchor: "end" }), text(ax + 12, T - 2, "y", { anchor: "start" })];
  const tick = (span: number) => { const raw = span / 6, p = 10 ** Math.floor(Math.log10(raw)), m = raw / p; return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p; };
  const tx = tick(x1 - x0), ty = tick(y1 - y0);
  for (let v = Math.ceil(x0 / tx) * tx; v <= x1 + 1e-9; v += tx) if (Math.abs(v) > tx / 100) {
    out.push(line(px(v), ay - 4, px(v), ay + 4, { width: 1 }), text(px(v), ay + 20, n(v), { size: 13 }));
  }
  for (let v = Math.ceil(y0 / ty) * ty; v <= y1 + 1e-9; v += ty) if (Math.abs(v) > ty / 100) {
    out.push(line(ax - 4, py(v), ax + 4, py(v), { width: 1 }), text(ax - 8, py(v) + 4, n(v), { size: 13, anchor: "end" }));
  }
  samples.forEach((pts, i) => {
    let seg: string[] = [];
    const flush = () => { if (seg.length > 1) out.push(`<polyline points="${seg.join(" ")}" fill="none" stroke="${COLORS[i]}" stroke-width="3"/>`); seg = []; };
    for (const [x, y] of pts) { if (Number.isFinite(y) && y >= y0 && y <= y1) seg.push(`${n(px(x))},${n(py(y))}`); else flush(); }
    flush();
    const visible = pts.filter(([, y]) => Number.isFinite(y) && y >= y0 && y <= y1);
    const at = visible[Math.floor(visible.length * 0.85)];
    if (at && curves[i].label) out.push(text(Math.min(px(at[0]), R - 70), Math.max(py(at[1]) - 14, T + 14), curves[i].label, { fill: COLORS[i], weight: "bold", anchor: "end" }));
  });
  // A marked point must really lie on a curve (or be on none only if it isn't claiming to be): otherwise it is left out.
  for (const p of items.filter(i => i.role === "point").slice(0, 6)) {
    const [x, y] = nums(p.value);
    if (x == null || y == null || x < x0 || x > x1) continue;
    const onCurve = curves.some(c => Math.abs(f(c, x) - y) <= Math.max(0.02, (y1 - y0) * 0.005));
    if (!onCurve) continue;
    out.push(circle(px(x), py(y), 5, { fill: MARK, stroke: MARK }), text(px(x) + 8, py(y) - 10, p.label || `(${n(x)}, ${n(y)})`, { fill: MARK, size: 14, anchor: "start", halo: true }));
  }
  return out.join("");
}

// ---------- circuit: components on a loop, or parallel rungs between two rails ----------
function symbol(role: string, x: number, y: number, vertical: boolean): string {
  const t = vertical ? ` transform="rotate(90 ${n(x)} ${n(y)})"` : "";
  const g = (s: string) => `<g${t}>${s}</g>`;
  switch (role) {
    case "resistor": return g(rect(x - 28, y - 11, 56, 22));
    case "lamp": return g(circle(x, y, 16) + line(x - 11, y - 11, x + 11, y + 11) + line(x - 11, y + 11, x + 11, y - 11));
    case "capacitor": return g(rect(x - 9, y - 18, 18, 36, { stroke: "#fff" }) + line(x - 8, y - 18, x - 8, y + 18, { width: 3 }) + line(x + 8, y - 18, x + 8, y + 18, { width: 3 }));
    case "switch": return g(rect(x - 22, y - 5, 44, 10, { stroke: "#fff" }) + circle(x - 20, y, 3, { fill: INK }) + circle(x + 20, y, 3, { fill: INK }) + line(x - 20, y, x + 14, y - 18));
    case "ammeter": case "voltmeter": return circle(x, y, 16) + text(x, y + 6, role === "ammeter" ? "A" : "V", { weight: "bold" });
    default: return "";
  }
}
const CIRCUIT_PARTS = new Set(["resistor", "lamp", "capacitor", "switch", "ammeter", "voltmeter"]);

function drawCircuit(items: DiagramItem[]): string | null {
  const battery = items.find(i => i.role === "battery");
  const parts = items.filter(i => CIRCUIT_PARTS.has(i.role));
  if (!battery || !parts.length || parts.length > 8) return null;
  const series = parts.filter(i => i.value !== "parallel"), rungs = parts.filter(i => i.value === "parallel");
  if (rungs.length === 1) return null;
  const L = 110, R = W - 80, T = 90, B = H - 60, midY = (T + B) / 2;
  const out = [`<rect x="${L}" y="${T}" width="${R - L}" height="${B - T}" fill="none" stroke="${INK}" stroke-width="2"/>`];
  // Battery on the left: the long plate is +, at the top, so conventional current leaves along the top wire.
  out.push(rect(L - 22, midY - 11, 44, 22, { stroke: "#fff" }), line(L - 20, midY - 8, L + 20, midY - 8, { width: 3 }), line(L - 11, midY + 8, L + 11, midY + 8, { width: 3 }),
    text(L + 30, midY - 10, "+", { size: 18, anchor: "start" }), text(L + 30, midY + 22, "−", { size: 18, anchor: "start" }), text(L - 28, midY + 5, battery.label, { anchor: "end" }));
  const place = (it: DiagramItem, x: number, y: number, side: "top" | "bottom" | "right") => {
    out.push(symbol(it.role, x, y, side === "right"));
    if (side === "top") out.push(text(x, y - 24, it.label));
    else if (side === "bottom") out.push(text(x, y + 36, it.label));
    else out.push(text(x + 26, y + 5, it.label, { anchor: "start", size: 15 }));
  };
  if (rungs.length) {
    const railEnd = series.length ? L + 40 + series.length * 95 : L + 170;
    series.forEach((it, i) => place(it, L + 75 + i * 95, T, "top"));
    if (rungs.length > 4 || series.length > 3) return null;
    const step = (R - railEnd) / Math.max(rungs.length - 1, 1);
    rungs.forEach((it, i) => {
      const x = rungs.length === 1 ? R : railEnd + step * i;
      if (i < rungs.length - 1) out.push(line(x, T, x, B));
      place(it, x, midY, "right");
    });
  } else {
    // Around the loop: top, then right, then bottom.
    const top = series.slice(0, Math.min(3, series.length)), right = series.slice(3, 4), bottom = series.slice(4);
    top.forEach((it, i) => place(it, L + (R - L) * (i + 1) / (top.length + 1), T, "top"));
    right.forEach(it => place(it, R, midY, "right"));
    bottom.forEach((it, i) => place(it, R - (R - L) * (i + 1) / (bottom.length + 1), B, "bottom"));
  }
  const current = items.find(i => i.role === "current");
  if (current) {
    out.push(line(L + 12, T + 22, L + 58, T + 22, { color: MARK, arrow: true }), text(L + 35, T + 42, current.label || "I", { fill: MARK }));
  }
  return out.join("");
}

// ---------- right-angled triangle: which side is opposite follows from where the angle is ----------
function drawTriangle(items: DiagramItem[]): string | null {
  const get = (role: string) => items.find(i => i.role === role);
  const angle = get("angle"), opp = get("opposite"), adj = get("adjacent"), hyp = get("hypotenuse");
  if (!opp && !adj && !hyp) return null;
  const oV = nums(opp?.value ?? "")[0], aV = nums(adj?.value ?? "")[0];
  const ratio = oV > 0 && aV > 0 ? Math.min(Math.max(oV / aV, 0.25), 1.2) : 0.62;
  const maxW = 400, maxH = 260, w = Math.min(maxW, maxH / ratio), h = w * ratio;
  const Ax = (W - w) / 2, Ay = 340, Bx = Ax + w, Cy = Ay - h;   // right angle at A, the marked angle at B, top at C
  const theta = Math.atan2(h, w), r = 46;
  const out = [`<polygon points="${n(Ax)},${n(Ay)} ${n(Bx)},${n(Ay)} ${n(Ax)},${n(Cy)}" fill="${SOFT}" stroke="${INK}" stroke-width="3"/>`,
    `<polyline points="${n(Ax + 18)},${n(Ay)} ${n(Ax + 18)},${n(Ay - 18)} ${n(Ax)},${n(Ay - 18)}" fill="none" stroke="${INK}" stroke-width="2"/>`,
    `<path d="M ${n(Bx - r)} ${n(Ay)} A ${r} ${r} 0 0 1 ${n(Bx - r * Math.cos(theta))} ${n(Ay - r * Math.sin(theta))}" fill="none" stroke="${MARK}" stroke-width="2"/>`];
  if (angle) out.push(text(Bx - (r + 18) * Math.cos(theta / 2), Ay - (r + 18) * Math.sin(theta / 2) + 5, angle.label, { fill: MARK, weight: "bold" }));
  if (opp) out.push(text(Ax - 12, (Ay + Cy) / 2 + 5, opp.label, { anchor: "end" }));
  if (adj) out.push(text((Ax + Bx) / 2, Ay + 28, adj.label));
  if (hyp) out.push(text((Ax + Bx) / 2 + 16, (Ay + Cy) / 2 - 16, hyp.label, { anchor: "start" }));
  return out.join("");
}

// ---------- forces on a block, flat or on a slope ----------
function drawForces(items: DiagramItem[]): string | null {
  const surface = items.find(i => i.role === "surface")?.value ?? "flat";
  const deg = /incline|slope/i.test(surface) ? Math.min(Math.max(nums(surface)[0] ?? 30, 5), 60) : 0;
  const a = deg * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
  const size = 70, baseX = 320, baseY = deg ? 235 : 270;   // the point on the surface under the block
  const cx = baseX - sa * size / 2, cy = baseY - ca * size / 2;
  const out: string[] = [];
  const far = deg ? 250 : 280;
  out.push(line(baseX - ca * far, baseY + sa * far, baseX + ca * far, baseY - sa * far, { width: 3 }));
  if (deg) {
    const gx = baseX - ca * far, gy = baseY + sa * far;
    out.push(line(gx, gy, gx + 180, gy, { width: 1, dash: "6 5" }), `<path d="M ${n(gx + 60)} ${n(gy)} A 60 60 0 0 0 ${n(gx + 60 * ca)} ${n(gy - 60 * sa)}" fill="none" stroke="${INK}" stroke-width="1.5"/>`,
      text(gx + 76, gy - 8, `${n(deg)}°`, { size: 14, anchor: "start" }));
  }
  out.push(rect(cx - size / 2, cy - size / 2, size, size, { fill: SOFT, transform: `rotate(${n(-deg)} ${n(cx)} ${n(cy)})` }));
  const dirs: Record<string, [number, number]> = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0], normal: [-sa, -ca], perpendicular: [-sa, -ca],
    "along-up": [ca, -sa], "along-down": [-ca, sa] };
  for (const [word, same] of Object.entries({ downward: "down", downwards: "down", upward: "up", upwards: "up", "perpendicular-to-surface": "normal", "perpendicular-to-slope": "normal",
    "up-the-slope": "along-up", "up-slope": "along-up", upslope: "along-up", "up-the-incline": "along-up", "along-up-slope": "along-up",
    "down-the-slope": "along-down", "down-slope": "along-down", downslope: "along-down", "down-the-incline": "along-down", "along-down-slope": "along-down" })) dirs[word] = dirs[same];
  const forces = items.filter(i => i.role === "force").map(f => ({ ...f, value: f.value.replace(/[\s_]+/g, "-") }));
  // A force that can't be placed refuses the whole picture: leaving one out would teach the wrong thing.
  if (!forces.length || forces.length > 6 || forces.some(f => !dirs[f.value])) return null;
  forces.forEach((f, i) => {
    const [dx, dy] = dirs[f.value], len = 105;
    const tipX = cx + dx * len, tipY = cy + dy * len;
    out.push(line(cx, cy, tipX, tipY, { color: COLORS[i % COLORS.length], width: 3, arrow: true }));
    out.push(text(tipX + dx * 16 + (Math.abs(dx) < 0.3 ? 14 : 0), tipY + dy * 16 + 5, f.label, { fill: COLORS[i % COLORS.length], weight: "bold", anchor: dx < -0.3 ? "end" : dx > 0.3 ? "start" : "start" }));
  });
  return out.join("");
}

// ---------- steps in order, or a cycle ----------
function drawFlow(items: DiagramItem[]): string | null {
  const steps = items.filter(i => i.role === "step").slice(0, 8);
  if (steps.length < 2) return null;
  const box = (cx: number, cy: number, w: number, h: number, s: string) => {
    const lines = wrap(s, Math.floor(w / 8.4));
    return rect(cx - w / 2, cy - h / 2, w, h, { fill: SOFT, rx: 8 }) +
      lines.map((l, i) => text(cx, cy + 5 + (i - (lines.length - 1) / 2) * 18, l, { size: 15 })).join("");
  };
  const out: string[] = [];
  if (items.some(i => i.role === "loop")) {
    const r = 125, cx = W / 2, cy = 215, w = 130, h = 54;
    const at = steps.map((_, i) => { const t = -Math.PI / 2 + i * 2 * Math.PI / steps.length; return [cx + r * 1.55 * Math.cos(t), cy + r * Math.sin(t)]; });
    at.forEach(([x, y], i) => {
      const [nx, ny] = at[(i + 1) % at.length], d = Math.hypot(nx - x, ny - y), ux = (nx - x) / d, uy = (ny - y) / d;
      const clip = (ax: number, ay: number) => Math.min(Math.abs(ax) > 0.01 ? (w / 2 + 8) / Math.abs(ax) : 1e9, Math.abs(ay) > 0.01 ? (h / 2 + 8) / Math.abs(ay) : 1e9);
      const c = clip(ux, uy);
      if (d > c * 2) out.push(line(x + ux * c, y + uy * c, nx - ux * c, ny - uy * c, { arrow: true }));
    });
    at.forEach(([x, y], i) => out.push(box(x, y, w, h, steps[i].label)));
    return out.join("");
  }
  const perRow = steps.length <= 4 ? steps.length : Math.ceil(steps.length / 2);
  const rows = Math.ceil(steps.length / perRow), w = Math.min(130, (W - 40 - (perRow - 1) * 34) / perRow), h = 70;
  const rowY = (r: number) => rows === 1 ? 215 : 130 + r * 150;
  const pos = steps.map((_, i) => { const r = Math.floor(i / perRow), c = i % perRow; return [20 + w / 2 + c * (w + 34), rowY(r)]; });
  pos.forEach(([x, y], i) => {
    if (i === steps.length - 1) return;
    const [nx, ny] = pos[i + 1];
    if (ny === y) out.push(line(x + w / 2 + 2, y, nx - w / 2 - 4, y, { arrow: true }));
    else out.push(`<polyline points="${n(x)},${n(y + h / 2)} ${n(x)},${n((y + ny) / 2)} ${n(nx)},${n((y + ny) / 2)} ${n(nx)},${n(ny - h / 2 - 4)}" fill="none" stroke="${INK}" stroke-width="2" marker-end="url(#arrow)"/>`);
  });
  pos.forEach(([x, y], i) => out.push(box(x, y, w, h, steps[i].label)));
  return out.join("");
}

// ---------- rows of cells: arrays, memory, the steps of an algorithm ----------
function drawArray(items: DiagramItem[]): string | null {
  const rows: { name: string; cells: DiagramItem[] }[] = [];
  for (const it of items) {
    if (it.role === "row") rows.push({ name: it.label, cells: [] });
    else if (it.role === "cell") { if (!rows.length) rows.push({ name: "", cells: [] }); rows.at(-1)!.cells.push(it); }
  }
  const used = rows.filter(r => r.cells.length).slice(0, 5);
  const most = Math.max(0, ...used.map(r => r.cells.length));
  if (!most || most > 16) return null;
  const hasNames = used.some(r => r.name);
  const left = hasNames ? 130 : 30, size = Math.min(52, (W - left - 20) / most), gap = Math.min(66, (H - 60) / used.length);
  const out: string[] = [];
  used.forEach((row, r) => {
    const y = 50 + r * gap + (gap - size) / 2;
    if (row.name) out.push(text(left - 12, y + size / 2 + 5, row.name, { anchor: "end", size: 14 }));
    row.cells.forEach((c, i) => {
      const x = left + i * size, on = c.value === "highlight", off = c.value === "dim";
      out.push(rect(x, y, size, size, { fill: on ? ACCENT : off ? "#f1f1f4" : SOFT, stroke: off ? "#b9b8c6" : INK }));
      out.push(text(x + size / 2, y + size / 2 + 5, c.label, { size: Math.min(16, size / 2.4), fill: on ? "#fff" : off ? "#8a8898" : INK, weight: on ? "bold" : undefined }));
    });
  });
  return out.join("");
}

// ---------- bar chart: heights are computed from the numbers given ----------
function drawBars(items: DiagramItem[]): string | null {
  const bars = items.filter(i => i.role === "bar").map(i => ({ label: i.label, v: nums(i.value)[0] })).filter(b => Number.isFinite(b.v) && b.v >= 0).slice(0, 10);
  if (bars.length < 2) return null;
  const max = Math.max(...bars.map(b => b.v));
  if (max <= 0) return null;
  const L = 50, R = W - 20, T = 60, B = H - 60, slot = (R - L) / bars.length, bw = slot * 0.62;
  const out = [line(L, B, R, B)];
  bars.forEach((b, i) => {
    const h = (b.v / max) * (B - T), x = L + slot * i + (slot - bw) / 2;
    out.push(rect(x, B - h, bw, h, { fill: ACCENT, stroke: ACCENT }), text(x + bw / 2, B - h - 8, n(b.v), { size: 14 }));
    wrap(b.label, Math.max(6, Math.floor(slot / 8)), 2).forEach((l, k) => out.push(text(x + bw / 2, B + 20 + k * 17, l, { size: 13 })));
  });
  return out.join("");
}

// ---------- atom: electron shells ----------
function drawAtom(items: DiagramItem[]): string | null {
  const nucleus = items.find(i => i.role === "nucleus");
  const shells = items.filter(i => i.role === "shell").map(i => Math.floor(nums(i.value)[0] ?? 0)).filter(c => c > 0 && c <= 32).slice(0, 5);
  if (!shells.length) return null;
  const cx = W / 2, cy = 218, gap = Math.min(44, 160 / shells.length), r0 = 34;
  const out: string[] = [];
  shells.forEach((count, s) => {
    const r = r0 + gap * (s + 1);
    out.push(circle(cx, cy, r, { fill: "none", stroke: "#8a8898", width: 1.5 }));
    for (let i = 0; i < count; i++) {
      const t = -Math.PI / 2 + i * 2 * Math.PI / count;
      out.push(circle(cx + r * Math.cos(t), cy + r * Math.sin(t), 5, { fill: ACCENT, stroke: ACCENT }));
    }
  });
  const name = nucleus?.label ?? "";
  out.push(circle(cx, cy, r0 - 6, { fill: MARK, stroke: MARK }));
  out.push(name.length <= 5 ? text(cx, cy + 5, name, { fill: "#fff", weight: "bold", size: 14 }) : text(16, H - 14, name, { anchor: "start", size: 15 }));
  out.push(text(W - 16, H - 14, shells.join(", "), { anchor: "end", size: 15 }));
  return out.join("");
}

const DRAW: Record<DiagramKind, (items: DiagramItem[]) => string | null> = {
  graph: drawGraph, circuit: drawCircuit, triangle: drawTriangle, forces: drawForces, flow: drawFlow, array: drawArray, bars: drawBars, atom: drawAtom,
};

export function parseDiagramSpec(raw: unknown): DiagramSpec | null {
  const d = raw as any;
  if (!d || typeof d !== "object" || !DIAGRAM_KINDS.includes(d.kind) || !Array.isArray(d.items)) return null;
  return { kind: d.kind, title: typeof d.title === "string" ? d.title.slice(0, 60) : "", alt: typeof d.alt === "string" ? d.alt.slice(0, 300) : "",
    items: d.items.slice(0, 40).filter((i: any) => i && typeof i.role === "string")
      .map((i: any) => ({ role: i.role.trim().toLowerCase(), label: String(i.label ?? "").slice(0, 60), value: String(i.value ?? "").trim().toLowerCase().slice(0, 80) })) };
}

// The finished picture, or null if the description can't be drawn correctly.
export function renderDiagram(spec: DiagramSpec | null): Diagram | null {
  if (!spec) return null;
  let body: string | null;
  try { body = DRAW[spec.kind](spec.items); } catch { return null; }
  if (!body) return null;
  const defs = `<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke"/></marker></defs>`;
  const title = spec.title ? text(W / 2, 24, spec.title, { weight: "bold", size: 17 }) : "";
  const labels = [spec.title, ...spec.items.map(i => i.label)].filter(Boolean).join(" ");
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img">${defs}<rect width="${W}" height="${H}" fill="#fff"/>${title}${body}</svg>`,
           alt: spec.alt, text: labels };
}

// The learner asked for a picture in their own words (four interface languages).
const PICTURE_WORDS = /\b(draw|sketch|diagram|picture|image|illustrat\w*|visuali[sz]e|plot|graph|dessine\w*|sch[ée]ma\w*|trace[rz]?|shushanya|nshushanyiriza|igishushanyo|ibishushanyo|ifoto|chora|mchoro|michoro|picha)\b/i;
export const asksForPicture = (s: string | null | undefined) => PICTURE_WORDS.test(s ?? "");
