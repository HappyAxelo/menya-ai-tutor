// Pure helpers for the Menya 5 learning pages (no React, so they can be tested with node --test).

// The five stages in order, without "not started".
export const STAGES = ["exposure", "understanding", "application", "retention", "mastery"];
export const stageIndex = (stage) => STAGES.indexOf(stage);   // -1 for "not_started"
export const STAGE_CLASS = { not_started: "", exposure: "hint", understanding: "hint", application: "info", retention: "info", mastery: "ok" };

// Topics of the knowledge map as a flat list, each with its subject.
export const flatTopics = (map = []) => map.flatMap(s => s.topics.map(t => ({ ...t, subject: s.subject })));

// Projectile from level ground, no air resistance. Angles in degrees; SI units.
export function projectile(v, degrees, g = 9.8) {
  const th = (degrees * Math.PI) / 180, vx = v * Math.cos(th), vy = v * Math.sin(th);
  const time = (2 * vy) / g, range = vx * time, height = (vy * vy) / (2 * g);
  const points = Array.from({ length: 41 }, (_, i) => { const t = (time * i) / 40; return [vx * t, vy * t - 0.5 * g * t * t]; });
  return { time, range, height, points };
}

// Plain-text maths made readable without LaTeX: x^2 -> x², x^{n-1} -> xⁿ⁻¹, R_total -> R with a subscript word left alone,
// R_1 -> R₁. Only characters that have a real superscript or subscript form are converted; anything else is left as written.
const SUP = { 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹", "+": "⁺", "-": "⁻", "−": "⁻", n: "ⁿ", x: "ˣ", t: "ᵗ", k: "ᵏ", i: "ⁱ", a: "ᵃ", b: "ᵇ", "(": "⁽", ")": "⁾" };
const SUB = { 0: "₀", 1: "₁", 2: "₂", 3: "₃", 4: "₄", 5: "₅", 6: "₆", 7: "₇", 8: "₈", 9: "₉" };
const all = (s, table) => [...s].every(c => c in table);
const map = (s, table) => [...s].map(c => table[c]).join("");

function pretty(text) {
  return text
    .replace(/\^\{([^{}]{1,8})\}/g, (whole, inner) => { const s = inner.replace(/\s/g, ""); return all(s, SUP) ? map(s, SUP) : whole; })
    .replace(/\^\(([^()]{1,8})\)/g, (whole, inner) => { const s = inner.replace(/\s/g, ""); return /^[-−+]?\d+$|^[a-z][-−+]\d$/.test(s) && all(s, SUP) ? map(s, SUP) : whole; })
    .replace(/\^(-?\d+|[nxtk])(?![\w(])/g, (whole, p) => (all(p, SUP) ? map(p, SUP) : whole))
    .replace(/(?<=[A-Za-zΩ])_\{?(\d{1,2})\}?(?!\w)/g, (_, d) => map(d, SUB))
    // A word as a subscript (R_{p}, I_total, V_parallel) has no Unicode form: it is typeset as maths.
    .replace(/(?<![\w$])([A-Za-z])_\{([A-Za-z0-9 ]{1,12})\}/g, (_, base, sub) => wordSubscript(base, sub))
    .replace(/(?<![\w$])([A-Z])_([a-z]{1,12})(?![\w(])/g, (_, base, sub) => wordSubscript(base, sub));
}
const wordSubscript = (base, sub) => `$${base}_{\\text{${sub}}}$`;

// Code and LaTeX are left exactly as written.
export function prettyMath(text) {
  if (!text || !/[\^_]/.test(text)) return text;
  return text.split(/(```[\s\S]*?```|`[^`\n]*`|\$\$[\s\S]*?\$\$|\$[^$\n]*\$)/).map((part, i) => (i % 2 ? part : pretty(part))).join("");
}
