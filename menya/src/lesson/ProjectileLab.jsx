import { useState } from "react";
import { useT } from "../i18n.js";
import { projectile } from "../lib/learning.js";

// An interactive projectile: the student changes launch speed, angle and gravity and sees the
// path and the three quantities the formulas give. Everything is computed in the browser from
// the same equations as the formula card, so it works offline and costs nothing.
const W = 520, H = 230, PAD = { l: 44, r: 14, t: 14, b: 32 };
const fmt = (v) => (v >= 100 ? v.toFixed(0) : v.toFixed(v >= 10 ? 1 : 2));

export default function ProjectileLab() {
  const { t } = useT();
  const [v, setV] = useState(20);
  const [angle, setAngle] = useState(45);
  const [g, setG] = useState(9.8);
  const p = projectile(v, angle, g);
  // The axes stay fixed for a given gravity, so a change in speed or angle visibly changes the path.
  const maxX = (40 * 40) / g, maxY = (40 * 40) / (2 * g);
  const x = (m) => PAD.l + (m / maxX) * (W - PAD.l - PAD.r);
  const y = (m) => H - PAD.b - (m / maxY) * (H - PAD.t - PAD.b);
  const path = p.points.map(([px, py], i) => `${i ? "L" : "M"}${x(px).toFixed(1)},${y(Math.max(py, 0)).toFixed(1)}`).join(" ");
  // Evenly spaced round numbers: at most five steps of 5, 10, 20, 25, 50, 100...
  const ticks = (max) => {
    const step = [5, 10, 20, 25, 50, 100, 200, 250, 500].find(s => max / s <= 5) ?? 1000;
    return Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => i * step);
  };
  const sliders = [
    ["speed", v, setV, 5, 40, 1, "m/s"],
    ["angle", angle, setAngle, 5, 85, 1, "°"],
    ["gravity", g, setG, 1.6, 24.8, 0.1, "m/s²"],
  ];
  return (
    <div className="mn-lab">
      <div className="mn-section-label">{t("lab.projectile.title")}</div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("lab.projectile.alt", { v, a: angle, r: fmt(p.range), h: fmt(p.height) })}>
        {ticks(maxX).map(m => <g key={`x${m}`}><line x1={x(m)} x2={x(m)} y1={PAD.t} y2={H - PAD.b} className="grid" /><text x={x(m)} y={H - PAD.b + 16} textAnchor="middle">{m}</text></g>)}
        {ticks(maxY).map(m => <g key={`y${m}`}><line x1={PAD.l} x2={W - PAD.r} y1={y(m)} y2={y(m)} className="grid" /><text x={PAD.l - 6} y={y(m) + 4} textAnchor="end">{m}</text></g>)}
        <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} className="axis" />
        <line x1={PAD.l} x2={PAD.l} y1={PAD.t} y2={H - PAD.b} className="axis" />
        <path d={path} className="path" />
        <line x1={x(p.range / 2)} x2={x(p.range / 2)} y1={y(p.height)} y2={H - PAD.b} className="mark" />
        <circle cx={x(p.range)} cy={y(0)} r="4" className="land" />
        <text x={W - PAD.r} y={H - 4} textAnchor="end">m</text>
      </svg>
      <div className="mn-lab-controls">
        {sliders.map(([id, value, set, min, max, step, unit]) => (
          <label key={id}>
            <span>{t(`lab.projectile.${id}`)}: <b>{value}{unit === "°" ? "°" : ` ${unit}`}</b></span>
            <input type="range" min={min} max={max} step={step} value={value} onChange={e => set(Number(e.target.value))} />
          </label>
        ))}
      </div>
      <div className="mn-stat-row">
        <div className="mn-stat"><div className="v">{fmt(p.range)} m</div><div className="l">{t("lab.projectile.range")} · v²·sin 2θ / g</div></div>
        <div className="mn-stat"><div className="v">{fmt(p.height)} m</div><div className="l">{t("lab.projectile.height")} · (v·sin θ)² / 2g</div></div>
        <div className="mn-stat"><div className="v">{fmt(p.time)} s</div><div className="l">{t("lab.projectile.time")} · 2v·sin θ / g</div></div>
      </div>
      <p className="mn-fine left">{t("lab.projectile.note")}</p>
    </div>
  );
}
