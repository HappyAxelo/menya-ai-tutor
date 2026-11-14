import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "../i18n.js";
import { evaluate, parseExpression } from "../../../supabase/functions/_shared/engine/expr.ts";
import ProjectileLab from "./ProjectileLab.jsx";
import { prettyMath } from "../lib/learning.js";

// "See how it works": an interactive visual that starts at the worked example's numbers. Everything is
// computed here, from the same relationships the lesson teaches, so moving a slider shows the rule at work.
const W = 520, H = 250;
export const fmt = (v, sig = 3) => {
  if (!Number.isFinite(v)) return "—";
  if (v === 0) return "0";
  const r = Number(v.toPrecision(sig));
  return Math.abs(r) >= 1e5 || Math.abs(r) < 1e-3 ? r.toExponential(2) : String(r);
};

function Slider({ label, value, min, max, step, unit, onChange }) {
  return (
    <label>
      <span>{label}: <b>{fmt(value)}{unit ? ` ${unit}` : ""}</b></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} />
    </label>
  );
}

function Rule({ children, ok }) {
  return <li className={ok === undefined ? "" : ok ? "ok" : "no"}>{children}{ok !== undefined && <span aria-hidden="true">{ok ? " ✓" : ""}</span>}</li>;
}

// ---------------- Circuit: Ohm's law and Kirchhoff's laws, live ----------------
const ohms = r => (r >= 1000 ? `${fmt(r / 1000)} kΩ` : `${fmt(r)} Ω`);
const amps = i => (Math.abs(i) < 0.1 ? `${fmt(i * 1000)} mA` : `${fmt(i)} A`);
const volts = v => `${fmt(v)} V`;

function Resistor({ x, y, vertical, label, sub }) {
  const w = vertical ? 16 : 48, h = vertical ? 48 : 16;
  return (
    <g>
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx="3" className="part" />
      <text x={vertical ? x + 14 : x} y={vertical ? y - 4 : y - 16} textAnchor={vertical ? "start" : "middle"} className="lbl">{label}</text>
      {sub && <text x={vertical ? x + 14 : x} y={vertical ? y + 12 : y + 26} textAnchor={vertical ? "start" : "middle"} className="val">{sub}</text>}
    </g>
  );
}

function CircuitLab({ params }) {
  const { t } = useT();
  const kilo = params.R1 >= 1000;
  const [V, setV] = useState(params.V), [R1, setR1] = useState(params.R1), [R2, setR2] = useState(params.R2), [R3, setR3] = useState(params.R3);
  const range = r0 => ({ min: kilo ? 100 : 1, max: Math.max(r0 * 3, kilo ? 10000 : 30), step: kilo ? 100 : 1 });
  const mode = !params.R2 ? "single" : !params.R3 ? "series" : "parallel";
  const Rp = mode === "parallel" ? (R2 * R3) / (R2 + R3) : mode === "series" ? R2 : 0;
  const Rt = R1 + Rp, I = V / Rt, V1 = I * R1, Vp = V - V1;
  const I2 = mode === "parallel" ? Vp / R2 : I, I3 = mode === "parallel" ? Vp / R3 : 0;
  // Battery on the left, R1 on the top wire, then R2 (and R3 beside it) down to the bottom wire.
  const L = 60, T = 50, B = 210, X2 = mode === "parallel" ? 330 : 400, X3 = 450, R = mode === "parallel" ? X3 : X2;
  return (
    <div className="mn-lab">
      <div className="mn-section-label">{t("lab.circuit.title")}</div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("lab.circuit.alt", { v: fmt(V), i: amps(I) })}>
        <path d={`M${L},${B} L${L},${T} L${R},${T} L${R},${B} Z${mode === "parallel" ? ` M${X2},${T} L${X2},${B}` : ""}`} className="wire" />
        {/* battery: the long plate is the positive terminal */}
        <rect x={L - 18} y={122} width="36" height="22" className="gap" />
        <line x1={L - 16} x2={L + 16} y1={126} y2={126} className="cell long" />
        <line x1={L - 9} x2={L + 9} y1={140} y2={140} className="cell" />
        <text x={L - 22} y={136} textAnchor="end" className="lbl">{volts(V)}</text>
        <Resistor x={190} y={T} label={`R1 = ${ohms(R1)}`} sub={`${volts(V1)}`} />
        {mode !== "single" && <Resistor x={X2} y={130} vertical label={`R2 = ${ohms(R2)}`} sub={`${amps(I2)}`} />}
        {mode === "parallel" && <Resistor x={X3} y={130} vertical label={`R3 = ${ohms(R3)}`} sub={`${amps(I3)}`} />}
        {mode === "single" && <text x={R + 8} y={134} className="val">{amps(I)}</text>}
        <text x={120} y={T - 10} textAnchor="middle" className="cur">→ I = {amps(I)}</text>
        {mode === "parallel" && <><circle cx={X2} cy={T} r="4" className="node" /><text x={X2} y={T - 10} textAnchor="middle" className="lbl">{t("lab.circuit.junction")}</text></>}
      </svg>
      <div className="mn-lab-controls">
        <Slider label={t("lab.circuit.battery")} value={V} min={1} max={Math.max(params.V * 3, 30)} step={0.5} unit="V" onChange={setV} />
        <Slider label="R1" value={R1} {...range(params.R1)} unit="Ω" onChange={setR1} />
        {mode !== "single" && <Slider label="R2" value={R2} {...range(params.R2)} unit="Ω" onChange={setR2} />}
        {mode === "parallel" && <Slider label="R3" value={R3} {...range(params.R3)} unit="Ω" onChange={setR3} />}
      </div>
      <ul className="mn-lab-rules">
        {mode === "parallel" && <Rule>{t("lab.circuit.parallel")}: R2·R3/(R2 + R3) = {ohms(Rp)}</Rule>}
        <Rule>{t("lab.circuit.ohm")}: I = V / R_total = {fmt(V)} / {fmt(Rt)} = {amps(I)}</Rule>
        {mode !== "single" && <Rule ok>{t("lab.circuit.kvl")}: {fmt(V)} V = {fmt(V1)} V + {fmt(Vp)} V</Rule>}
        {mode === "parallel" && <Rule ok>{t("lab.circuit.kcl")}: {amps(I)} = {amps(I2)} + {amps(I3)}</Rule>}
      </ul>
      <p className="mn-fine left">{t(`lab.circuit.note.${mode}`)}</p>
    </div>
  );
}

// ---------------- Plotting helpers for the two calculus labs ----------------
function useFunction(expr) {
  return useMemo(() => {
    const node = parseExpression(String(expr));
    return node ? x => { const y = evaluate(node, { x }); return Number.isFinite(y) ? y : NaN; } : null;
  }, [expr]);
}
function frame(f, x0, x1, extra = []) {
  const ys = [...Array.from({ length: 121 }, (_, i) => f(x0 + ((x1 - x0) * i) / 120)), ...extra].filter(Number.isFinite);
  let y0 = Math.min(0, ...ys), y1 = Math.max(0, ...ys);
  if (y1 - y0 < 1e-6) { y0 -= 1; y1 += 1; }
  const pad = (y1 - y0) * 0.08;
  y0 -= pad; y1 += pad;
  const P = { l: 40, r: 12, t: 12, b: 26 };
  const sx = x => P.l + ((x - x0) / (x1 - x0)) * (W - P.l - P.r), sy = y => H - P.b - ((y - y0) / (y1 - y0)) * (H - P.t - P.b);
  return { sx, sy, y0, y1, P };
}
function Axes({ fr, x0, x1 }) {
  const { sx, sy, P } = fr;
  return (
    <g>
      <line x1={P.l} x2={W - P.r} y1={sy(0)} y2={sy(0)} className="axis" />
      {x0 <= 0 && x1 >= 0 && <line x1={sx(0)} x2={sx(0)} y1={P.t} y2={H - P.b} className="axis" />}
      {[x0, (x0 + x1) / 2, x1].map(x => <text key={x} x={sx(x)} y={H - 8} textAnchor="middle">{fmt(x, 2)}</text>)}
      {[fr.y0 + (fr.y1 - fr.y0) * 0.08, fr.y1 - (fr.y1 - fr.y0) * 0.08].map(y => <text key={y} x={P.l - 4} y={sy(y) + 4} textAnchor="end">{fmt(y, 2)}</text>)}
    </g>
  );
}
const pathOf = (f, x0, x1, fr) => {
  let d = "", pen = false;
  for (let i = 0; i <= 160; i++) {
    const x = x0 + ((x1 - x0) * i) / 160, y = f(x);
    if (!Number.isFinite(y) || y < fr.y0 - (fr.y1 - fr.y0) || y > fr.y1 + (fr.y1 - fr.y0)) { pen = false; continue; }
    d += `${pen ? "L" : "M"}${fr.sx(x).toFixed(1)},${fr.sy(y).toFixed(1)} `; pen = true;
  }
  return d;
};

// ---------------- Derivative: the slope of a secant becomes the slope of the tangent ----------------
function TangentLab({ params }) {
  const { t } = useT();
  const f = useFunction(params.f), df = useFunction(params.df);
  // A window where the curve stays readable (e^(5x²) is not, beyond |x| ≈ 1).
  const span = useMemo(() => {
    if (!f) return 2;
    for (const s of [3, 2, 1.5, 1, 0.7, 0.5]) { const ys = Array.from({ length: 41 }, (_, i) => f(-s + (2 * s * i) / 40)); if (ys.every(y => Number.isFinite(y) && Math.abs(y) < 500)) return s; }
    return 0.5;
  }, [f]);
  const [x0, setX0] = useState(Math.round(span * 0.4 * 10) / 10);
  const [h, setH] = useState(Math.round(span * 25) / 100);
  if (!f || !df) return null;
  const y0 = f(x0), slope = df(x0), secant = (f(x0 + h) - y0) / h;
  const fr = frame(f, -span, span);
  const line = (m, len = span * 0.6) => `M${fr.sx(x0 - len)},${fr.sy(y0 - m * len)} L${fr.sx(x0 + len)},${fr.sy(y0 + m * len)}`;
  return (
    <div className="mn-lab">
      <div className="mn-section-label">{t("lab.tangent.title")}</div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("lab.tangent.alt", { x: fmt(x0), m: fmt(slope) })}>
        <Axes fr={fr} x0={-span} x1={span} />
        <path d={pathOf(f, -span, span, fr)} className="curve" />
        <path d={line(secant)} className="secant" />
        <path d={line(slope)} className="tangent" />
        <circle cx={fr.sx(x0)} cy={fr.sy(y0)} r="5" className="dot" />
        <circle cx={fr.sx(x0 + h)} cy={fr.sy(f(x0 + h))} r="4" className="dot2" />
      </svg>
      <div className="mn-lab-controls">
        <Slider label={t("lab.tangent.point")} value={x0} min={-span} max={span} step={span / 50} onChange={setX0} />
        <Slider label={t("lab.tangent.gap")} value={h} min={span / 200} max={span} step={span / 200} onChange={setH} />
      </div>
      <ul className="mn-lab-rules">
        <Rule>{t("lab.tangent.secant")}: (f(x₀ + h) − f(x₀)) / h = {fmt(secant, 4)}</Rule>
        <Rule ok={Math.abs(secant - slope) < 0.01 * Math.max(1, Math.abs(slope))}>{t("lab.tangent.derivative")}: f′({fmt(x0)}) = {fmt(slope, 4)}</Rule>
      </ul>
      <p className="mn-fine left">{t("lab.tangent.note")} f′(x) = {prettyMath(params.df)}</p>
    </div>
  );
}

// ---------------- Integral: rectangles fill the area ----------------
function AreaLab({ params }) {
  const { t } = useT();
  const f = useFunction(params.f);
  const [b, setB] = useState(params.b), [n, setN] = useState(4);
  if (!f) return null;
  const a = params.a, top = Math.max(params.b * 1.6, params.b + 1);
  const width = (b - a) / n;
  const rects = Array.from({ length: n }, (_, i) => { const x = a + i * width; return { x, y: f(x + width / 2) }; });
  const sum = rects.reduce((s, r) => s + r.y * width, 0);
  let exact = 0; const N = 400, dx = (b - a) / N;
  for (let i = 0; i < N; i++) exact += ((f(a + i * dx) + 4 * f(a + (i + 0.5) * dx) + f(a + (i + 1) * dx)) / 6) * dx;   // Simpson's rule
  const fr = frame(f, a, top);
  return (
    <div className="mn-lab">
      <div className="mn-section-label">{t("lab.area.title")}</div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("lab.area.alt", { b: fmt(b), area: fmt(exact) })}>
        <Axes fr={fr} x0={a} x1={top} />
        {rects.map((r, i) => <rect key={i} x={fr.sx(r.x)} width={Math.max(0.5, fr.sx(r.x + width) - fr.sx(r.x))} y={Math.min(fr.sy(r.y), fr.sy(0))} height={Math.abs(fr.sy(0) - fr.sy(r.y))} className="bar" />)}
        <path d={pathOf(f, a, top, fr)} className="curve" />
        <line x1={fr.sx(b)} x2={fr.sx(b)} y1={fr.P.t} y2={H - fr.P.b} className="limit" />
      </svg>
      <div className="mn-lab-controls">
        <Slider label={t("lab.area.upper")} value={b} min={a + (top - a) / 40} max={top} step={(top - a) / 80} onChange={setB} />
        <Slider label={t("lab.area.rectangles")} value={n} min={1} max={60} step={1} onChange={setN} />
      </div>
      <ul className="mn-lab-rules">
        <Rule>{t("lab.area.sum", { n })}: {fmt(sum, 5)}</Rule>
        <Rule ok={Math.abs(sum - exact) < 0.005 * Math.max(1, Math.abs(exact))}>{t("lab.area.exact")}: {fmt(exact, 5)}</Rule>
      </ul>
      <p className="mn-fine left">{t("lab.area.note")}</p>
    </div>
  );
}

// ---------------- Newton's second law: the net force sets the acceleration ----------------
function ForcesLab({ params }) {
  const { t } = useT();
  const [m, setM] = useState(params.m), [F, setF] = useState(params.F), [fr, setFr] = useState(params.f);
  const moving = F > fr, net = moving ? F - fr : 0, a = net / m;
  const scale = 150 / Math.max(params.F * 2, 1);
  const cx = W / 2, cy = 130, bw = 40 + Math.min(m, 40) * 2;
  return (
    <div className="mn-lab">
      <div className="mn-section-label">{t("lab.forces.title")}</div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("lab.forces.alt", { a: fmt(a) })}>
        <line x1={30} x2={W - 30} y1={cy + 30} y2={cy + 30} className="axis" />
        <rect x={cx - bw / 2} y={cy - 30} width={bw} height={60} rx="4" className="part" />
        <text x={cx} y={cy + 5} textAnchor="middle" className="lbl">{fmt(m)} kg</text>
        <line x1={cx + bw / 2} x2={cx + bw / 2 + F * scale} y1={cy - 8} y2={cy - 8} className="push" markerEnd="url(#mn-arrow)" />
        <text x={cx + bw / 2 + 4} y={cy - 18} className="val">{t("lab.forces.push")} {fmt(F)} N</text>
        <line x1={cx - bw / 2} x2={cx - bw / 2 - Math.min(fr, F) * scale} y1={cy + 12} y2={cy + 12} className="fric" markerEnd="url(#mn-arrow)" />
        <text x={cx - bw / 2 - 4} y={cy + 32} textAnchor="end" className="val">{t("lab.forces.friction")} {fmt(moving ? fr : F)} N</text>
        <text x={cx} y={40} textAnchor="middle" className="cur">a = {fmt(a)} m/s²</text>
        <defs><marker id="mn-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" className="head" /></marker></defs>
      </svg>
      <div className="mn-lab-controls">
        <Slider label={t("lab.forces.mass")} value={m} min={1} max={Math.max(params.m * 3, 20)} step={0.5} unit="kg" onChange={setM} />
        <Slider label={t("lab.forces.push")} value={F} min={0} max={Math.max(params.F * 2, 20)} step={0.5} unit="N" onChange={setF} />
        <Slider label={t("lab.forces.friction")} value={fr} min={0} max={Math.max(params.F * 2, 20)} step={0.5} unit="N" onChange={setFr} />
      </div>
      <ul className="mn-lab-rules">
        <Rule>{t("lab.forces.net")}: F_net = {fmt(F)} − {fmt(moving ? fr : F)} = {fmt(net)} N</Rule>
        <Rule>{t("lab.forces.law")}: a = F_net / m = {fmt(net)} / {fmt(m)} = {fmt(a)} m/s²</Rule>
        <Rule>{t("lab.forces.after")}: v = a·t = {fmt(a * 2)} m/s</Rule>
      </ul>
      <p className="mn-fine left">{t(moving ? "lab.forces.note" : "lab.forces.still")}</p>
    </div>
  );
}

// ---------------- Waves: v = f·λ ----------------
function WaveLab({ params }) {
  const { t } = useT();
  const [f, setF] = useState(params.f), [lambda, setLambda] = useState(params.lambda);
  const [phase, setPhase] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return undefined;
    let last = performance.now();
    const tick = now => { setPhase(p => (p + ((now - last) / 1000) * 0.6) % 1); last = now; raf.current = requestAnimationFrame(tick); };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, []);
  const span = Math.max(params.lambda * 3, lambda * 2.2), px = x => 30 + (x / span) * (W - 60);
  let d = "";
  for (let i = 0; i <= 200; i++) { const x = (span * i) / 200; d += `${i ? "L" : "M"}${px(x).toFixed(1)},${(120 - 55 * Math.sin(2 * Math.PI * (x / lambda - phase))).toFixed(1)} `; }
  const crest = ((phase + 0.25) % 1) * lambda;
  return (
    <div className="mn-lab">
      <div className="mn-section-label">{t("lab.wave.title")}</div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("lab.wave.alt", { v: fmt(f * lambda) })}>
        <line x1={30} x2={W - 30} y1={120} y2={120} className="axis" />
        <path d={d} className="curve" />
        <line x1={px(crest)} x2={px(crest + lambda)} y1={45} y2={45} className="span" markerStart="url(#mn-arrow2)" markerEnd="url(#mn-arrow2)" />
        <text x={(px(crest) + px(crest + lambda)) / 2} y={36} textAnchor="middle" className="lbl">λ = {fmt(lambda)} m</text>
        <text x={W - 30} y={H - 12} textAnchor="end" className="cur">v = f·λ = {fmt(f)} × {fmt(lambda)} = {fmt(f * lambda)} m/s</text>
        <defs><marker id="mn-arrow2" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" className="head" /></marker></defs>
      </svg>
      <div className="mn-lab-controls">
        <Slider label={t("lab.wave.frequency")} value={f} min={Math.max(0.5, params.f / 5)} max={params.f * 3} step={Math.max(0.5, params.f / 50)} unit="Hz" onChange={setF} />
        <Slider label={t("lab.wave.wavelength")} value={lambda} min={params.lambda / 4} max={params.lambda * 2} step={params.lambda / 40} unit="m" onChange={setLambda} />
      </div>
      <p className="mn-fine left">{t("lab.wave.note")}</p>
    </div>
  );
}

const LABS = { circuit: CircuitLab, tangent: TangentLab, area: AreaLab, forces: ForcesLab, wave: WaveLab };

export default function LabView({ lab }) {
  if (!lab) return null;
  if (lab.kind === "projectile") return <ProjectileLab v0={lab.params.v} angle0={lab.params.angle} />;
  const Lab = LABS[lab.kind];
  return Lab ? <Lab params={lab.params} /> : null;
}
