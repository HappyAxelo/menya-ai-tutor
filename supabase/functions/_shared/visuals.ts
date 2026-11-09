// Visual kinds beyond the original eight. The rule is the same as in diagram.ts: the model says WHAT to show,
// this code computes where everything goes, and anything that can't be drawn correctly is refused.
// Fractions are measured, truth tables and gates are worked out from the expression, reactions must balance.
import { checkEquation, formulaCounts } from "./chemistry.ts";
import { bEval, bVars, parseBoolean, parseExpression, evaluate, type BNode } from "./engine/expr.ts";
import type { DiagramItem, DiagramSpec } from "./diagramSpec.ts";
import { ACCENT, AMBER, circle, COLORS, GREEN, GREY, H, INK, LIGHT, line, MARK, n, niceStep, nums, parseValue, path, rect, SOFT, text, W, wrap } from "./svgKit.ts";
import { drawLabelled, drawMolecule } from "./visualTemplates.ts";

export interface RenderOptions { language?: string | null }
export interface VisualTable { headers: string[]; rows: string[][]; emphasise?: number }
type Drawn = string | { body: string; height: number } | null;
const byRole = (items: DiagramItem[], role: string) => items.filter(i => i.role === role);
const one = (items: DiagramItem[], role: string) => items.find(i => i.role === role);

// ---------- fractions: every bar is the same length, so equal fractions really line up ----------
function drawFraction(items: DiagramItem[]): Drawn {
  const list = byRole(items, "fraction").slice(0, 4).map(i => {
    const m = /^(\d+)\s*\/\s*(\d+)$/.exec(i.value);
    return m ? { a: Number(m[1]), b: Number(m[2]), label: i.label || `${m[1]}/${m[2]}` } : null;
  });
  if (!list.length || list.some(f => !f || f.b < 1 || f.b > 24 || f.a > f.b * 3)) return null;
  const wholes = Math.max(1, ...list.map(f => Math.ceil(f!.a / f!.b)));
  const L = 100, unit = (W - L - 24) / wholes, h = 44, gap = Math.min(40, 240 / list.length), top = 56;
  const out: string[] = [];
  list.forEach((f, r) => {
    const y = top + r * (h + gap);
    out.push(text(L - 14, y + h / 2 + 6, f!.label, { anchor: "end", weight: "bold", size: 18 }));
    const bars = Math.max(1, Math.ceil(f!.a / f!.b));
    for (let w = 0; w < bars; w++) for (let k = 0; k < f!.b; k++) {
      const filled = w * f!.b + k < f!.a, cell = unit / f!.b;
      out.push(rect(L + w * unit + k * cell, y, cell, h, { fill: filled ? ACCENT : "#fff", stroke: INK }));
    }
  });
  return { body: out.join(""), height: top + list.length * (h + gap) + 8 };
}

// ---------- number line ----------
function drawNumberline(items: DiagramItem[]): Drawn {
  const points = byRole(items, "point").map(p => ({ label: p.label, v: parseValue(p.value) }));
  const intervals = byRole(items, "interval").map(i => {
    const [a, b, flag] = i.value.split(",").map(s => s.trim());
    const toV = (s: string) => /^-?inf/.test(s) ? (s.startsWith("-") ? -Infinity : Infinity) : parseValue(s);
    return { label: i.label, a: toV(a), b: toV(b ?? ""), open: flag === "open" };
  });
  const jumps = byRole(items, "jump").map(j => { const [a, b] = j.value.split(",").map(parseValue); return { label: j.label, a, b }; });
  if ([...points.map(p => p.v), ...jumps.flatMap(j => [j.a, j.b])].some(v => !Number.isFinite(v)) || intervals.some(i => Number.isNaN(i.a) || Number.isNaN(i.b) || !(i.a < i.b))) return null;
  const finite = [...points.map(p => p.v), ...jumps.flatMap(j => [j.a, j.b]), ...intervals.flatMap(i => [i.a, i.b]).filter(Number.isFinite)];
  if (!finite.length && !one(items, "range")) return null;
  const r = (one(items, "range")?.value ?? "").split(",").map(parseValue);
  let x0 = r.length >= 2 && r[1] > r[0] ? r[0] : Math.floor(Math.min(0, ...finite)) - 1;
  let x1 = r.length >= 2 && r[1] > r[0] ? r[1] : Math.ceil(Math.max(0, ...finite)) + 1;
  // Something outside the stated range can't be shown honestly.
  if (finite.some(v => v < x0 - 1e-9 || v > x1 + 1e-9)) return null;
  const stepRaw = one(items, "step")?.value ?? "", stepV = parseValue(stepRaw);
  const step = stepV > 0 && (x1 - x0) / stepV <= 24 ? stepV : niceStep(x1 - x0);
  const denom = /\/\s*(\d+)$/.exec(stepRaw)?.[1];
  const tickLabel = (v: number) => {
    if (!denom) return n(v);
    const d = Number(denom), a = Math.round(v * d);
    const gcd = (p: number, q: number): number => q ? gcd(q, p % q) : Math.abs(p), g = gcd(a, d) || 1;
    return d / g === 1 ? String(a / g) : `${a / g}/${d / g}`;
  };
  const L = 40, R = W - 40, Y = 230, px = (v: number) => L + (v - x0) / (x1 - x0) * (R - L);
  const out = [line(R - 2, Y, R + 26, Y, { arrow: true }), line(L + 2, Y, L - 26, Y, { arrow: true }), line(L, Y, R, Y)];
  for (let i = 0, v = x0; v <= x1 + 1e-9; i++, v = x0 + i * step) out.push(line(px(v), Y - 8, px(v), Y + 8), text(px(v), Y + 30, tickLabel(v), { size: 15 }));
  intervals.forEach((iv, i) => {
    const a = Math.max(iv.a, x0), b = Math.min(iv.b, x1), y = Y - 30 - i * 48, color = COLORS[(i + 1) % COLORS.length];
    out.push(line(px(a), y, px(b), y, { color, width: 6 }));
    if (Number.isFinite(iv.a)) out.push(circle(px(iv.a), y, 8, { fill: iv.open ? "#fff" : color, stroke: color, width: 3 }));
    if (Number.isFinite(iv.b)) out.push(circle(px(iv.b), y, 8, { fill: iv.open ? "#fff" : color, stroke: color, width: 3 }));
    if (iv.label) out.push(text((px(a) + px(b)) / 2, y - 16, iv.label, { fill: color, weight: "bold" }));
  });
  jumps.forEach((j, i) => {
    const a = px(j.a), b = px(j.b), rise = 40 + Math.min(70, Math.abs(b - a) / 4);
    out.push(path(`M ${n(a)} ${Y - 10} Q ${n((a + b) / 2)} ${n(Y - 10 - rise * 2)} ${n(b)} ${Y - 10}`, { stroke: COLORS[i % COLORS.length], width: 3, arrow: true }));
    if (j.label) out.push(text((a + b) / 2, Y - 18 - rise, j.label, { fill: COLORS[i % COLORS.length], weight: "bold", halo: true }));
  });
  points.forEach((p, i) => {
    out.push(circle(px(p.v), Y, 8, { fill: MARK, stroke: MARK }));
    if (p.label) out.push(text(px(p.v), Y + 56 + (i % 2) * 22, p.label, { fill: MARK, weight: "bold" }));
  });
  return out.join("");
}

// ---------- coordinate geometry: one scale on both axes, so shapes are the right shape ----------
function drawCoordinate(items: DiagramItem[]): Drawn {
  type P = [number, number];
  const pts = byRole(items, "point").map(i => ({ label: i.label, p: nums(i.value) as number[] }));
  const segs = byRole(items, "segment").map(i => ({ label: i.label, v: nums(i.value) }));
  const polys = byRole(items, "polygon").map(i => ({ label: i.label, v: nums(i.value) }));
  const circles = byRole(items, "circle").map(i => ({ label: i.label, v: nums(i.value) }));
  const lines = byRole(items, "line").map(i => ({ label: i.label, raw: i.value.replace(/\s+/g, "") }));
  if (pts.some(a => a.p.length < 2) || segs.some(s => s.v.length !== 4) || polys.some(s => s.v.length < 6 || s.v.length % 2) || circles.some(c => c.v.length !== 3 || c.v[2] <= 0)) return null;
  if (!pts.length && !segs.length && !polys.length && !circles.length && !lines.length) return null;
  const xs = [0, ...pts.map(a => a.p[0]), ...segs.flatMap(s => [s.v[0], s.v[2]]), ...polys.flatMap(s => s.v.filter((_, i) => i % 2 === 0)), ...circles.flatMap(c => [c.v[0] - c.v[2], c.v[0] + c.v[2]])];
  const ys = [0, ...pts.map(a => a.p[1]), ...segs.flatMap(s => [s.v[1], s.v[3]]), ...polys.flatMap(s => s.v.filter((_, i) => i % 2 === 1)), ...circles.flatMap(c => [c.v[1] - c.v[2], c.v[1] + c.v[2]])];
  let x0 = Math.min(...xs) - 1, x1 = Math.max(...xs) + 1, y0 = Math.min(...ys) - 1, y1 = Math.max(...ys) + 1;
  if (lines.length && xs.length === 1) { x0 = -5; x1 = 5; y0 = -5; y1 = 5; }
  if (x1 - x0 < 6) { const m = (x0 + x1) / 2; x0 = m - 3; x1 = m + 3; }
  if (y1 - y0 < 6) { const m = (y0 + y1) / 2; y0 = m - 3; y1 = m + 3; }
  const pad = 34, top = 44, availW = W - 2 * pad, availH = H - top - pad;
  const u = Math.min(availW / (x1 - x0), availH / (y1 - y0));
  const ox = pad + (availW - u * (x1 - x0)) / 2 - x0 * u, oy = top + (availH + u * (y1 - y0)) / 2 + y0 * u;
  const px = (x: number) => ox + x * u, py = (y: number) => oy - y * u;
  const step = niceStep(Math.max(x1 - x0, y1 - y0));
  const out: string[] = [];
  for (let v = Math.ceil(x0 / step) * step; v <= x1 + 1e-9; v += step) out.push(line(px(v), py(y0), px(v), py(y1), { color: LIGHT, width: 1 }));
  for (let v = Math.ceil(y0 / step) * step; v <= y1 + 1e-9; v += step) out.push(line(px(x0), py(v), px(x1), py(v), { color: LIGHT, width: 1 }));
  out.push(line(px(x0), py(0), px(x1) + 14, py(0), { arrow: true }), line(px(0), py(y0), px(0), py(y1) - 14, { arrow: true }),
    text(px(x1) + 8, py(0) - 10, "x", { anchor: "end" }), text(px(0) + 10, py(y1) - 2, "y", { anchor: "start" }));
  for (let v = Math.ceil(x0 / step) * step; v <= x1 + 1e-9; v += step) if (Math.abs(v) > step / 100) out.push(text(px(v), py(0) + 18, n(v), { size: 14, halo: true }));
  for (let v = Math.ceil(y0 / step) * step; v <= y1 + 1e-9; v += step) if (Math.abs(v) > step / 100) out.push(text(px(0) - 7, py(v) + 5, n(v), { size: 14, anchor: "end", halo: true }));
  polys.forEach((poly, i) => {
    const corners: P[] = []; for (let k = 0; k < poly.v.length; k += 2) corners.push([poly.v[k], poly.v[k + 1]]);
    out.push(`<polygon points="${corners.map(([x, y]) => `${n(px(x))},${n(py(y))}`).join(" ")}" fill="${SOFT}" stroke="${COLORS[i % 4]}" stroke-width="3"/>`);
  });
  segs.forEach((s, i) => { out.push(line(px(s.v[0]), py(s.v[1]), px(s.v[2]), py(s.v[3]), { color: COLORS[i % 4], width: 3 }));
    if (s.label) out.push(text(px((s.v[0] + s.v[2]) / 2), py((s.v[1] + s.v[3]) / 2) - 10, s.label, { fill: COLORS[i % 4], weight: "bold", halo: true })); });
  circles.forEach((c, i) => out.push(circle(px(c.v[0]), py(c.v[1]), c.v[2] * u, { fill: "none", stroke: COLORS[i % 4], width: 3 })));
  for (const [i, l] of lines.entries()) {
    const color = COLORS[(i + 1) % 4];
    const vert = /^x=(.+)$/.exec(l.raw);
    if (vert) {
      const x = parseValue(vert[1]);
      if (!Number.isFinite(x)) return null;
      out.push(line(px(x), py(y0), px(x), py(y1), { color, width: 3 }));
      if (l.label) out.push(text(px(x) + 8, py(y1) + 18, l.label, { fill: color, weight: "bold", anchor: "start", halo: true }));
      continue;
    }
    const node = parseExpression(l.raw.replace(/^y=/, ""));
    if (!node) return null;
    const pts2 = Array.from({ length: 2 }, (_, k) => { const x = k ? x1 : x0; return [x, evaluate(node, { x })] as P; });
    if (pts2.some(p => !Number.isFinite(p[1]))) return null;
    // Clip to the frame.
    const [[ax, ay], [bx, by]] = pts2, m = (by - ay) / (bx - ax);
    const clip = (x: number) => { const y = ay + m * (x - ax); return y > y1 ? [ax + (y1 - ay) / m, y1] : y < y0 ? [ax + (y0 - ay) / m, y0] : [x, y]; };
    const [cx0, cy0] = clip(x0), [cx1, cy1] = clip(x1);
    out.push(line(px(cx0), py(cy0), px(cx1), py(cy1), { color, width: 3 }));
    if (l.label) {
      // Beside the line's far end, on whichever side has room.
      const room = px(cx1) + 10 + l.label.length * 9 < W;
      out.push(text(room ? px(cx1) + 10 : px(cx1) - 22 - (m > 0 ? 14 : 0), py(cy1) + (m > 0 ? 26 : -12), l.label, { fill: color, weight: "bold", anchor: room ? "start" : "end", halo: true }));
    }
  }
  pts.forEach(a => { out.push(circle(px(a.p[0]), py(a.p[1]), 6, { fill: MARK, stroke: MARK }));
    if (a.label) out.push(text(px(a.p[0]) + 9, py(a.p[1]) - 9, a.label, { fill: MARK, weight: "bold", anchor: "start", halo: true })); });
  return out.join("");
}

// ---------- digital logic: gates and truth tables worked out from the expression ----------
const booleanText = (s: string) => s
  .replace(/(\([^()]*\)|\b[a-z0-9]\b)\s*\bnand\b\s*(\([^()]*\)|\b[a-z0-9]\b)/gi, "~($1&$2)")
  .replace(/(\([^()]*\)|\b[a-z0-9]\b)\s*\bnor\b\s*(\([^()]*\)|\b[a-z0-9]\b)/gi, "~($1|$2)")
  .replace(/(\([^()]*\)|\b[a-z0-9]\b)\s*\bxnor\b\s*(\([^()]*\)|\b[a-z0-9]\b)/gi, "~($1^$2)");
export const readBoolean = (s: string) => parseBoolean(booleanText(s));

type Gate = { kind: "input"; name: string } | { kind: "and" | "or" | "xor" | "nand" | "nor" | "xnor" | "not"; inputs: Gate[] };
function toGate(b: BNode): Gate {
  if (b.k === "v") return { kind: "input", name: b.n };
  if (b.k === "c") return { kind: "input", name: b.v ? "1" : "0" };
  if (b.k === "not") {
    const a = b.a;
    if (a.k === "and") return { kind: "nand", inputs: [toGate(a.a), toGate(a.b)] };
    if (a.k === "or") return { kind: "nor", inputs: [toGate(a.a), toGate(a.b)] };
    if (a.k === "xor") return { kind: "xnor", inputs: [toGate(a.a), toGate(a.b)] };
    return { kind: "not", inputs: [toGate(a)] };
  }
  return { kind: b.k, inputs: [toGate(b.a), toGate(b.b)] };
}
const gateDepth = (g: Gate): number => g.kind === "input" ? 0 : 1 + Math.max(...g.inputs.map(gateDepth));
const leafCount = (g: Gate): number => g.kind === "input" ? 1 : g.inputs.reduce((s, i) => s + leafCount(i), 0);

function gateSymbol(kind: Exclude<Gate["kind"], "input">, x: number, y: number): string {
  const body = (d: string) => path(d, { fill: SOFT, width: 2.5 });
  const bubble = (ox: number) => circle(ox, y, 6, { fill: "#fff", width: 2.5 });
  const name = kind.toUpperCase();
  if (kind === "not") return body(`M ${x} ${y - 20} L ${x + 44} ${y} L ${x} ${y + 20} Z`) + bubble(x + 50);
  const label = text(x + (kind === "xor" || kind === "xnor" ? 32 : 26), y + 5, name, { size: 14, weight: "bold" });
  if (kind === "and" || kind === "nand") return body(`M ${x} ${y - 24} H ${x + 32} A 24 24 0 0 1 ${x + 32} ${y + 24} H ${x} Z`) + label + (kind === "nand" ? bubble(x + 62) : "");
  const or = body(`M ${x} ${y - 24} Q ${x + 18} ${y} ${x} ${y + 24} Q ${x + 40} ${y + 24} ${x + 58} ${y} Q ${x + 40} ${y - 24} ${x} ${y - 24} Z`);
  const extra = kind === "xor" || kind === "xnor" ? path(`M ${x - 8} ${y - 24} Q ${x + 10} ${y} ${x - 8} ${y + 24}`, { width: 2.5 }) : "";
  return or + extra + label + (kind === "nor" || kind === "xnor" ? bubble(x + 64) : "");
}

function drawLogic(items: DiagramItem[]): Drawn {
  const expr = one(items, "expression");
  const tree = expr ? readBoolean(expr.value) : null;
  if (!tree) return null;
  const root = toGate(tree);
  const leaves = leafCount(root), depth = gateDepth(root);
  if (root.kind === "input" || leaves > 6 || depth > 4) return null;
  const rowH = 62, height = Math.max(240, 56 + leaves * rowH), L = 60, R = W - 76, colW = (R - L - 72) / Math.max(depth, 1);
  const out: string[] = [];
  let next = 0;
  // Each gate sits in the column of its depth; its height is the middle of its inputs.
  const place = (g: Gate, level: number): { x: number; y: number } => {
    if (g.kind === "input") {
      const y = 56 + next++ * rowH + rowH / 2;
      out.push(text(L - 14, y + 6, g.name, { anchor: "end", weight: "bold", size: 18 }));
      return { x: L, y };
    }
    const kids = g.inputs.map(c => place(c, level + 1));
    const y = (kids[0].y + kids[kids.length - 1].y) / 2;
    const x = L + 30 + (depth - level - 1) * colW;
    const inY = g.kind === "not" ? [y] : [y - 12, y + 12];
    kids.forEach((k, i) => {
      const midX = Math.max(k.x + 8, x - 16 - i * 8);
      out.push(`<polyline points="${n(k.x)},${n(k.y)} ${n(midX)},${n(k.y)} ${n(midX)},${n(inY[i])} ${n(x + (g.kind === "or" || g.kind === "nor" || g.kind === "xor" || g.kind === "xnor" ? 6 : 0))},${n(inY[i])}" fill="none" stroke="${INK}" stroke-width="2"/>`);
    });
    out.push(gateSymbol(g.kind, x, y));
    const wide = g.kind === "nand" ? 68 : g.kind === "nor" || g.kind === "xnor" ? 70 : g.kind === "not" ? 56 : 58;
    return { x: x + wide, y };
  };
  const end = place(root, 0);
  out.push(line(end.x, end.y, R + 6, end.y), text(R + 12, end.y + 6, expr!.label || "Q", { anchor: "start", weight: "bold", size: 18 }));
  return { body: out.join(""), height };
}

// Tables are computed; the model only names what to compute.
export function tableFor(spec: DiagramSpec): VisualTable | null {
  if (spec.kind === "compare") {
    const columns = byRole(spec.items, "column").map(c => c.label.trim()).filter(Boolean).slice(0, 3);
    const rows = byRole(spec.items, "row").slice(0, 10).map(r => [r.label, ...r.value.split("|").map(c => c.trim())]);
    if (columns.length < 2 || !rows.length || rows.some(r => r.length !== columns.length + 1)) return null;
    return { headers: ["", ...columns], rows };
  }
  if (spec.kind === "truth_table" || spec.kind === "logic") {
    const exprs = byRole(spec.items, "expression").slice(0, 3).map(e => ({ label: e.label || e.value.toUpperCase(), tree: readBoolean(e.value) }));
    if (!exprs.length || exprs.some(e => !e.tree)) return null;
    const vars = [...new Set(exprs.flatMap(e => [...bVars(e.tree!)]))].sort();
    if (!vars.length || vars.length > 4) return null;
    const rows: string[][] = [];
    for (let m = 0; m < 1 << vars.length; m++) {
      const env = Object.fromEntries(vars.map((v, i) => [v, Boolean((m >> (vars.length - 1 - i)) & 1)]));
      rows.push([...vars.map(v => env[v] ? "1" : "0"), ...exprs.map(e => bEval(e.tree!, env) ? "1" : "0")]);
    }
    return { headers: [...vars, ...exprs.map(e => e.label)], rows, emphasise: vars.length + exprs.length - 1 };
  }
  return null;
}

// ---------- flowchart: the learner reads downward; other paths go round the right-hand side ----------
function drawFlowchart(items: DiagramItem[]): Drawn {
  const nodes = items.filter(i => ["start", "process", "decision", "end"].includes(i.role)).slice(0, 9);
  if (nodes.length < 2) return null;
  const cx = 250, boxW = 330, boxH = 58, diaH = 84, gap = 36, top = 46;
  let y = top;
  const pos = nodes.map(nd => { const h = nd.role === "decision" ? diaH : boxH, mid = y + h / 2; y += h + gap; return { top: mid - h / 2, mid, bottom: mid + h / 2, h }; });
  const target = (v: string, prefix: string) => { const m = new RegExp(`${prefix}\\s*:\\s*(\\d+)`).exec(v); return m ? Number(m[1]) - 1 : null; };
  const out: string[] = [];
  let exits = 0, loops = 0;
  // A "no" path leaves on the right and enters its target from the right.
  const exitRoute = (from: number, to: number) => {
    const startX = cx + boxW / 2, laneX = startX + 28 + exits++ * 20, y1 = pos[from].mid, y2 = pos[to].mid;
    out.push(`<polyline points="${n(startX)},${n(y1)} ${n(laneX)},${n(y1)} ${n(laneX)},${n(y2)} ${n(startX + 4)},${n(y2)}" fill="none" stroke="${INK}" stroke-width="2" marker-end="url(#arrow)"/>`);
    out.push(text(startX + 16, y1 - 8, "✗", { size: 18, weight: "bold", fill: MARK }));
  };
  // A loop goes back up the left side and joins the arrow coming into its target, so no two lines share a point.
  const loopRoute = (from: number, to: number) => {
    const startX = cx - boxW / 2, laneX = startX - 26 - loops++ * 16, y1 = pos[from].mid, y2 = pos[to].top - gap / 2;
    out.push(`<polyline points="${n(startX)},${n(y1)} ${n(laneX)},${n(y1)} ${n(laneX)},${n(y2)} ${n(cx - 3)},${n(y2)}" fill="none" stroke="${INK}" stroke-width="2" marker-end="url(#arrow)"/>`);
  };
  for (let i = 0; i < nodes.length; i++) {
    const nd = nodes[i], isEnd = nd.role === "end";
    const no = nd.role === "decision" ? target(nd.value, "no") : null;
    const go = nd.role === "process" ? target(nd.value, "goto") : null;
    if (nd.role === "decision" && (no == null || no < 0 || no >= nodes.length || no === i)) return null;
    if (go != null && (go < 0 || go >= nodes.length || go === i)) return null;
    if (!isEnd && go == null && i === nodes.length - 1 && nd.role !== "end") return null;
    if (!isEnd && go == null && i < nodes.length - 1) {
      out.push(line(cx, pos[i].bottom + 1, cx, pos[i + 1].top - 4, { arrow: true }));
      if (nd.role === "decision") out.push(text(cx + 14, pos[i].bottom + 24, "✓", { size: 18, weight: "bold", fill: GREEN, anchor: "start" }));
    }
    if (no != null) exitRoute(i, no);
    if (go != null) loopRoute(i, go);
  }
  nodes.forEach((nd, i) => {
    const p = pos[i], lines = wrap(nd.label, nd.role === "decision" ? 30 : 38, 2);
    if (nd.role === "decision") out.push(`<polygon points="${cx},${n(p.top)} ${cx + boxW / 2},${n(p.mid)} ${cx},${n(p.bottom)} ${cx - boxW / 2},${n(p.mid)}" fill="#fff4e5" stroke="${INK}" stroke-width="2"/>`);
    else if (nd.role === "process") out.push(rect(cx - boxW / 2, p.top, boxW, p.h, { fill: SOFT, rx: 6 }));
    else out.push(rect(cx - boxW / 2, p.top, boxW, p.h, { fill: "#e6f4f1", rx: 29 }));
    lines.forEach((l, k) => out.push(text(cx, p.mid + 6 + (k - (lines.length - 1) / 2) * 19, l, { size: 16 })));
  });
  return { body: out.join(""), height: y + 4 };
}

// ---------- timeline ----------
function drawTimeline(items: DiagramItem[]): Drawn {
  const events = byRole(items, "event").slice(0, 8);
  if (events.length < 2) return null;
  const years = events.map(e => nums(e.value)[0]);
  const ordered = years.every(Number.isFinite) ? events.map((e, i) => ({ e, y: years[i] })).sort((a, b) => a.y - b.y).map(a => a.e) : events;
  const rowH = 62, X = 150, top = 56, height = top + ordered.length * rowH + 8;
  const out = [line(X, top - 8, X, height - 18, { width: 3, arrow: true })];
  ordered.forEach((e, i) => {
    const y = top + i * rowH + 18;
    out.push(circle(X, y, 8, { fill: ACCENT, stroke: ACCENT }), text(X - 20, y + 6, e.value, { anchor: "end", weight: "bold" }));
    const lines = wrap(e.label, 50, 2);
    lines.forEach((l, k) => out.push(text(X + 22, y + 6 + (k - (lines.length - 1) / 2) * 20, l, { anchor: "start" })));
  });
  return { body: out.join(""), height };
}

// ---------- statistics ----------
function axes(xs: number[], ys: number[], items: DiagramItem[], from0 = false) {
  const span = (a: number[]) => { let lo = Math.min(...a), hi = Math.max(...a); if (hi - lo < 1e-9) { lo -= 1; hi += 1; } const p = (hi - lo) * 0.08; return [lo - p, hi + p]; };
  const [x0, x1] = span(xs); let [y0, y1] = span(ys);
  if (from0) { y0 = 0; y1 = Math.max(...ys) * 1.12 || 1; }
  const L = 72, R = W - 24, T = 48, B = H - 66;
  const px = (x: number) => L + (x - x0) / (x1 - x0) * (R - L), py = (y: number) => B - (y - y0) / (y1 - y0) * (B - T);
  const out = [line(L, B, R, B), line(L, B, L, T)];
  const tx = niceStep(x1 - x0), ty = niceStep(y1 - y0);
  for (let v = Math.ceil(x0 / tx) * tx; v <= x1 + 1e-9; v += tx) out.push(line(px(v), B, px(v), B + 6, { width: 1 }), text(px(v), B + 24, n(v), { size: 14 }));
  for (let v = Math.ceil(y0 / ty) * ty; v <= y1 + 1e-9; v += ty) out.push(line(L, py(v), R, py(v), { color: LIGHT, width: 1 }), text(L - 8, py(v) + 5, n(v), { size: 14, anchor: "end" }));
  const xl = one(items, "xlabel")?.label, yl = one(items, "ylabel")?.label;
  if (xl) out.push(text((L + R) / 2, H - 14, xl));
  if (yl) out.push(text(L - 60, T - 14, yl, { anchor: "start" }));
  return { out, px, py, L, R, T, B };
}

function drawScatter(items: DiagramItem[]): Drawn {
  const pts = byRole(items, "point").map(p => nums(p.value)).filter(v => v.length >= 2).slice(0, 60);
  if (pts.length < 2) return null;
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const a = axes(xs, ys, items);
  pts.forEach(([x, y]) => a.out.push(circle(a.px(x), a.py(y), 6, { fill: ACCENT, stroke: ACCENT })));
  if (one(items, "trend")) {
    const mx = xs.reduce((s, v) => s + v, 0) / xs.length, my = ys.reduce((s, v) => s + v, 0) / ys.length;
    const denom = xs.reduce((s, v) => s + (v - mx) ** 2, 0);
    if (denom > 0) {
      const m = xs.reduce((s, v, i) => s + (v - mx) * (ys[i] - my), 0) / denom, b = my - m * mx;
      const lo = Math.min(...xs), hi = Math.max(...xs);
      a.out.push(line(a.px(lo), a.py(m * lo + b), a.px(hi), a.py(m * hi + b), { color: MARK, width: 3 }));
    }
  }
  return a.out.join("");
}

function drawHistogram(items: DiagramItem[]): Drawn {
  const given = byRole(items, "bin").map(b => ({ label: b.label, count: nums(b.value)[0] })).filter(b => Number.isFinite(b.count) && b.count >= 0);
  let bars: { label: string; count: number }[] = given;
  if (!given.length) {
    const data = byRole(items, "data").flatMap(d => nums(d.value));
    if (data.length < 3) return null;
    const lo = Math.min(...data), hi = Math.max(...data);
    const k = Math.min(Math.max(Math.floor(nums(one(items, "bins")?.value ?? "")[0] ?? Math.ceil(Math.log2(data.length) + 1)), 2), 12);
    const width = hi > lo ? (hi - lo) / k : 1;
    bars = Array.from({ length: k }, (_, i) => ({ label: `${n(lo + i * width)}–${n(lo + (i + 1) * width)}`, count: 0 }));
    for (const v of data) bars[Math.min(k - 1, Math.floor((v - lo) / width))].count++;
  }
  if (bars.length < 2 || bars.length > 14) return null;
  const max = Math.max(...bars.map(b => b.count));
  if (max <= 0) return null;
  const L = 64, R = W - 20, T = 50, B = H - 70, slot = (R - L) / bars.length;
  const out = [line(L, B, R, B), line(L, B, L, T)];
  const ty = Math.max(niceStep(max), 1);
  for (let v = 0; v <= max * 1.001; v += ty) out.push(line(L, B - v / max * (B - T), R, B - v / max * (B - T), { color: LIGHT, width: 1 }), text(L - 8, B - v / max * (B - T) + 5, n(v), { size: 14, anchor: "end" }));
  bars.forEach((b, i) => {
    const h = b.count / max * (B - T), x = L + slot * i;
    out.push(rect(x, B - h, slot, h, { fill: ACCENT, stroke: "#fff" }));
    if (bars.length <= 8 || i % 2 === 0) out.push(text(x + slot / 2, B + 22, b.label, { size: 14 }));
  });
  const xl = one(items, "xlabel")?.label, yl = one(items, "ylabel")?.label;
  if (xl) out.push(text((L + R) / 2, H - 14, xl));
  if (yl) out.push(text(10, T - 14, yl, { anchor: "start" }));
  return out.join("");
}

// ---------- signals ----------
function drawWaveform(items: DiagramItem[]): Drawn {
  const signals = byRole(items, "signal").slice(0, 4);
  if (!signals.length) return null;
  const L = 86, R = W - 26, rowH = 92, top = 52, height = top + signals.length * rowH + 28;
  const out: string[] = [];
  for (const [r, s] of signals.entries()) {
    const yMid = top + r * rowH + rowH / 2 - 8, amp = 30, color = COLORS[r % 4];
    out.push(text(L - 14, yMid + 6, s.label, { anchor: "end", weight: "bold" }));
    if (/^[01]+$/.test(s.value)) {
      if (s.value.length > 32) return null;
      const stepX = (R - L) / s.value.length, level = (c: string) => c === "1" ? yMid - amp : yMid + amp;
      const coords: string[] = [];
      [...s.value].forEach((c, i) => coords.push(`${n(L + i * stepX)},${n(level(c))}`, `${n(L + (i + 1) * stepX)},${n(level(c))}`));
      out.push(`<polyline points="${coords.join(" ")}" fill="none" stroke="${color}" stroke-width="3"/>`);
      for (let i = 0; i <= s.value.length; i++) out.push(line(L + i * stepX, yMid - amp - 6, L + i * stepX, yMid + amp + 6, { color: LIGHT, width: 1 }));
    } else {
      const m = /^(sine|square|triangle)\s+(\d+(?:\.\d+)?)$/.exec(s.value);
      if (!m || Number(m[2]) <= 0 || Number(m[2]) > 8) return null;
      const cycles = Number(m[2]), steps = 400;
      const wave = (t: number) => { const ph = (t * cycles) % 1; return m[1] === "sine" ? Math.sin(2 * Math.PI * ph) : m[1] === "square" ? (ph < 0.5 ? 1 : -1) : (ph < 0.25 ? 4 * ph : ph < 0.75 ? 2 - 4 * ph : 4 * ph - 4); };
      const coords = Array.from({ length: steps + 1 }, (_, k) => `${n(L + (R - L) * k / steps)},${n(yMid - amp * wave(k / steps))}`);
      out.push(line(L, yMid, R, yMid, { color: LIGHT, width: 1 }), `<polyline points="${coords.join(" ")}" fill="none" stroke="${color}" stroke-width="3"/>`);
    }
  }
  out.push(line(L, height - 22, R + 14, height - 22, { arrow: true }), text(R + 8, height - 6, "t", { anchor: "end" }));
  return { body: out.join(""), height };
}

// ---------- reaction energy ----------
function drawEnergy(items: DiagramItem[]): Drawn {
  const re = one(items, "reactants"), pr = one(items, "products"), ac = one(items, "activation");
  if (!re || !pr || !ac) return null;
  const a = nums(re.value)[0], b = nums(pr.value)[0], c = nums(ac.value)[0];
  if (![a, b, c].every(Number.isFinite) || c <= Math.max(a, b)) return null;
  const lo = Math.min(a, b), L = 70, R = W - 80, T = 60, B = H - 60;
  const py = (v: number) => B - (v - lo) / (c - lo) * (B - T);
  const ease = (t: number) => (1 - Math.cos(Math.PI * t)) / 2;
  const coords: string[] = [];
  const flat = 0.18, peak = 0.5, steps = 200;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const v = t < flat ? a : t < peak ? a + (c - a) * ease((t - flat) / (peak - flat)) : t < 1 - flat ? c + (b - c) * ease((t - peak) / (1 - flat - peak)) : b;
    coords.push(`${n(L + (R - L) * t)},${n(py(v))}`);
  }
  const out = [line(L, B + 10, L, T - 20, { arrow: true }), line(L, B + 10, R + 30, B + 10, { arrow: true }),
    `<polyline points="${coords.join(" ")}" fill="none" stroke="${ACCENT}" stroke-width="3"/>`];
  const xA = L + (R - L) * 0.1, xB = L + (R - L) * 0.9, xPeak = L + (R - L) * peak;
  out.push(text(xA, py(a) - 12, re.label), text(xB, py(b) - 12, pr.label));
  out.push(line(xPeak - 90, py(a), xPeak - 90, py(c) + 3, { color: MARK, arrow: true, width: 2.5 }), line(L + (R - L) * 0.1 + 40, py(a), xPeak - 84, py(a), { color: GREY, width: 1, dash: "5 5" }),
    line(xPeak - 90, py(c), xPeak, py(c), { color: GREY, width: 1, dash: "5 5" }), text(xPeak - 98, (py(a) + py(c)) / 2, ac.label, { fill: MARK, weight: "bold", anchor: "end", halo: true }));
  const change = one(items, "change")?.label;
  if (Math.abs(a - b) > 1e-9) {
    const x = L + (R - L) * 0.76;
    out.push(line(x, py(a), x, py(b) + (b < a ? -3 : 3), { color: GREEN, arrow: true, width: 2.5 }), line(xA + 40, py(a), x + 6, py(a), { color: GREY, width: 1, dash: "5 5" }));
    if (change) out.push(text(x + 10, (py(a) + py(b)) / 2, change, { fill: GREEN, weight: "bold", anchor: "start", halo: true }));
  }
  const ax = one(items, "axis")?.label;
  if (ax) out.push(text(L + 8, T - 14, ax, { anchor: "start" }));
  return out.join("");
}

// ---------- reaction as particles: refuses an unbalanced equation; counts come from the formulas ----------
const ELEMENT_COLORS: Record<string, string> = { H: "#c9c7d6", O: "#b42318", C: "#1d1b2e", N: "#251F8C", Cl: "#0f766e", Na: "#b54708", S: "#ca8a04", Fe: "#7c2d12", Mg: "#4d7c0f", Ca: "#6d28d9" };
function drawReaction(items: DiagramItem[]): Drawn {
  const label = one(items, "equation")?.label ?? "";
  const check = checkEquation(label);
  if (!check || !check.balanced) return null;
  const [left, right] = check.equation.replace(/[₀-₉]/g, c => String("₀₁₂₃₄₅₆₇₈₉".indexOf(c))).split(/\s*(?:→|->|⟶|⇌|<=>)\s*/);
  const terms = (side: string) => side.split("+").map(t => { const m = /^\s*(\d*)\s*(.+?)\s*$/.exec(t)!; return { times: Number(m[1] || 1), formula: m[2], counts: formulaCounts(m[2]) }; });
  const sides = [terms(left), terms(right)];
  if (sides.flat().some(t => !t.counts || t.times > 6)) return null;
  const atomsIn = (t: ReturnType<typeof terms>[number]) => [...t.counts!].flatMap(([el, c]) => Array(c).fill(el) as string[]);
  if (sides.flat().some(t => atomsIn(t).length > 12)) return null;
  const r = 11, widthOf = (t: ReturnType<typeof terms>[number]) => Math.min(atomsIn(t).length, 4) * (2 * r + 2) + 14;
  const signW = 34;
  const full = sides.flat().reduce((s, t) => s + widthOf(t), 0) + (sides.flat().length - 1) * signW;
  if (full > W - 24) return null;
  let x = (W - full) / 2;
  const out: string[] = [], cy = 142, used = new Set<string>();
  const drawTerm = (t: ReturnType<typeof terms>[number]) => {
    const w = widthOf(t), rowsOfAtoms = Math.ceil(atomsIn(t).length / 4), cluster = rowsOfAtoms * (2 * r + 2) + 10;
    for (let c = 0; c < t.times; c++) {
      const yTop = cy - (t.times * cluster) / 2 + c * cluster;
      atomsIn(t).forEach((el, i) => {
        used.add(el);
        out.push(circle(x + 7 + r + (i % 4) * (2 * r + 2), yTop + r + Math.floor(i / 4) * (2 * r + 2), r, { fill: ELEMENT_COLORS[el] ?? GREY, stroke: INK, width: 1.5 }));
      });
    }
    out.push(text(x + w / 2, 266, `${t.times > 1 ? t.times : ""}${t.formula}`, { weight: "bold", size: 17 }));
    x += w;
  };
  sides.forEach((side, s) => {
    side.forEach((t, i) => { drawTerm(t); if (i < side.length - 1) { out.push(text(x + signW / 2, cy + 7, "+", { size: 22, weight: "bold" })); x += signW; } });
    if (s === 0) { out.push(line(x + 4, cy, x + signW - 4, cy, { arrow: true, width: 3 })); x += signW; }
  });
  const tally = Object.entries(check.counts).map(([el, [a, b]]) => `${el}: ${a} → ${b}`).join("  ·  ");
  out.push(text(W / 2, 304, tally, { size: 16, fill: GREEN, weight: "bold" }));
  [...used].forEach((el, i) => { const lx = 40 + i * 74; out.push(circle(lx, 340, 9, { fill: ELEMENT_COLORS[el] ?? GREY, stroke: INK, width: 1.5 }), text(lx + 14, 345, el, { anchor: "start", size: 15 })); });
  return { body: out.join(""), height: 364 };
}

// ---------- climate graph ----------
function drawClimate(items: DiagramItem[]): Drawn {
  const months = byRole(items, "month").map(m => ({ label: m.label, v: nums(m.value) }));
  if (months.length !== 12 || months.some(m => m.v.length < 2 || m.v[1] < 0)) return null;
  const L = 60, R = W - 60, T = 56, B = H - 56, slot = (R - L) / 12;
  const maxRain = Math.max(...months.map(m => m.v[1]), 1), temps = months.map(m => m.v[0]);
  const tMin = Math.min(0, ...temps), tMax = Math.max(...temps, 1) * 1.1;
  const rainY = (v: number) => B - v / maxRain * (B - T), tempY = (v: number) => B - (v - tMin) / (tMax - tMin) * (B - T);
  const out = [line(L, B, R, B), line(L, B, L, T), line(R, B, R, T)];
  months.forEach((m, i) => { const h = B - rainY(m.v[1]); out.push(rect(L + i * slot + slot * 0.15, B - h, slot * 0.7, h, { fill: "#7c9ed9", stroke: "#7c9ed9" }), text(L + i * slot + slot / 2, B + 22, m.label, { size: 14 })); });
  out.push(`<polyline points="${months.map((m, i) => `${n(L + i * slot + slot / 2)},${n(tempY(m.v[0]))}`).join(" ")}" fill="none" stroke="${MARK}" stroke-width="3"/>`);
  const rt = niceStep(maxRain), tt = niceStep(tMax - tMin);
  for (let v = 0; v <= maxRain + 1e-9; v += rt) out.push(text(L - 8, rainY(v) + 5, n(v), { size: 14, anchor: "end" }));
  for (let v = Math.ceil(tMin / tt) * tt; v <= tMax + 1e-9; v += tt) out.push(text(R + 8, tempY(v) + 5, n(v), { size: 14, anchor: "start", fill: MARK }));
  const rl = one(items, "rainlabel")?.label ?? "mm", tl = one(items, "templabel")?.label ?? "°C";
  out.push(text(L, T - 12, rl, { anchor: "start", fill: AMBER }), text(R, T - 12, tl, { anchor: "end", fill: MARK }));
  return out.join("");
}

export const EXTRA_DRAW: Record<string, (items: DiagramItem[], options: RenderOptions) => Drawn> = {
  fraction: drawFraction, numberline: drawNumberline, coordinate: drawCoordinate, logic: drawLogic, flowchart: drawFlowchart, timeline: drawTimeline,
  scatter: drawScatter, histogram: drawHistogram, waveform: drawWaveform, energy: drawEnergy, reaction: drawReaction, climate: drawClimate,
  labelled: (items, options) => drawLabelled(one(items, "template")?.value ?? "", options.language ?? null, one(items, "highlight")?.value ?? null),
  molecule: items => drawMolecule(one(items, "name")?.value ?? ""),
};
