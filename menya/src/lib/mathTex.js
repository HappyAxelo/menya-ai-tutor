// Worked examples arrive as plain text ("R_total = 3 + 12 = 15 Ω"). These helpers lay a step out like a
// textbook: a short title, the sentence that explains it, and each equation typeset on a line of its own.
// Anything that can't be converted with confidence stays plain text: a wrong formula is worse than a plain one.

const FUNCS = "sin|cos|tan|exp|ln|log|lim|sqrt";
const UNITS = ["m/s²", "m/s^2", "m/s", "km/h", "kHz", "MHz", "Hz", "kΩ", "MΩ", "mA", "µA", "mV", "kV", "mWb", "Wb", "ms", "kg", "kJ", "kW", "Ω", "V", "A", "W", "N", "J", "m", "s", "g", "K", "C", "F", "H", "T"];

// Words that can sit in an equation without making it prose: subscripted names, functions, units, "d/dx".
function proseWords(s) {
  const rest = s
    .replace(/[A-Za-z]+_\{?[A-Za-z0-9]+\}?/g, " ")
    .replace(new RegExp(`\\b(?:${FUNCS})\\b`, "g"), " ")
    .replace(/d\/d[a-z]/g, " ")
    .replace(/\b(?:emf|det|max|min|mod)\b/g, " ")
    .replace(/\b(?:kHz|MHz|Hz|kΩ|MΩ|mA|µA|mV|kV|mWb|Wb|ms|kg|kJ|kW|km)\b/g, " ");
  return (rest.match(/[A-Za-zÀ-ɏ]{3,}/g) ?? []);
}

// A line that is an equation (or a chain of them) with nothing else on it.
export function isEquationLine(line) {
  const s = line.trim().replace(/[.,;]+$/, "");
  if (!s || s.length > 140 || !/[=≈]/.test(s) || /[?:]/.test(s.replace(/d\/d[a-z]/g, ""))) return false;
  if (/^(?:if|so|then|thus|check|we|the|this|let)\b/i.test(s)) return false;
  return proseWords(s).length === 0;
}

const SUPS = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁻": "-", "⁺": "+", "ⁿ": "n" };
const SUBS = { "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4", "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9" };
const SYMBOLS = [["·", "\\cdot "], ["×", "\\times "], ["÷", "\\div "], ["±", "\\pm "], ["≈", "\\approx "], ["≤", "\\le "], ["≥", "\\ge "], ["≠", "\\ne "], ["→", "\\to "], ["∞", "\\infty "],
  ["Δ", "\\Delta "], ["θ", "\\theta "], ["λ", "\\lambda "], ["π", "\\pi "], ["μ", "\\mu "], ["ω", "\\omega "], ["α", "\\alpha "], ["β", "\\beta "], ["Φ", "\\Phi "], ["φ", "\\phi "], ["∫", "\\int "], ["Σ", "\\sum "], ["∥", "\\parallel "]];

// The group that ends at position `end` (inclusive) when it is a bracket, otherwise the atom before it.
function atomBefore(s, end) {
  if (s[end] === ")") {
    let depth = 0;
    for (let i = end; i >= 0; i--) { if (s[i] === ")") depth++; else if (s[i] === "(" && --depth === 0) return { start: i, inner: s.slice(i + 1, end) }; }
    return null;
  }
  const m = /(?:\\text\{[^{}]*\}|[A-Za-z]_\{[^{}]*\}|[A-Za-z](?:\^\{[^{}]*\})?|\d+(?:\.\d+)?(?:\^\{[^{}]*\})?)$/.exec(s.slice(0, end + 1));
  return m ? { start: end + 1 - m[0].length, inner: m[0] } : null;
}
function atomAfter(s, start) {
  if (s[start] === "(") {
    let depth = 0;
    for (let i = start; i < s.length; i++) { if (s[i] === "(") depth++; else if (s[i] === ")" && --depth === 0) return { end: i, inner: s.slice(start + 1, i) }; }
    return null;
  }
  const m = /^(?:[A-Za-z]_\{[^{}]*\}|\d+(?:\.\d+)?(?:\^\{[^{}]*\})?|[A-Za-z](?:\^\{[^{}]*\})?)/.exec(s.slice(start));
  return m ? { end: start + m[0].length - 1, inner: m[0] } : null;
}

// a/b with no spaces round the slash, (a + b)/(c), 8/16 → \frac. A slash with spaces round it stays a slash.
function fractions(input) {
  // Units in \text{...} ("m/s") and d/dx are not fractions to build: set them aside first.
  const kept = [];
  let s = input.replace(/\\text\{[^{}]*\}/g, m => `\u0000${kept.push(m) - 1}\u0001`)
    .replace(/\bd\/d([a-z])\b/g, (_, v) => `\u0000${kept.push(`\\frac{d}{d${v}}`) - 1}\u0001`);
  s = buildFractions(s);
  return s.replace(/\u0000(\d+)\u0001/g, (_, i) => kept[Number(i)]);
}
function buildFractions(s) {
  for (let guard = 0; guard < 12; guard++) {
    const i = s.search(/(?<=[\w)}])\/(?=[\w(])/);
    if (i < 0) break;
    const left = atomBefore(s, i - 1), right = atomAfter(s, i + 1);
    if (!left || !right) { s = `${s.slice(0, i)}\u2215${s.slice(i + 1)}`; continue; }        // leave this one as a slash
    // "R2\u00b7R3/(R2 + R3)" reads as one fraction with the whole product on top.
    let start = left.start, top = left.inner;
    for (let m; (m = /(\d+(?:\.\d+)?|[A-Za-z](?:_\{[^{}]*\})?|\([^()]*\))\s*\\(?:cdot|times)\s*$/.exec(s.slice(0, start))); ) {
      start -= m[0].length; top = s.slice(start, left.start) + (left.inner === s.slice(left.start, i) ? left.inner : top);
    }
    if (start !== left.start) top = s.slice(start, i).replace(/^\(([^()]*)\)$/, "$1");
    s = `${s.slice(0, start)}\\frac{${top}}{${right.inner}}${s.slice(right.end + 1)}`;
  }
  return s.replace(/\u2215/g, "/");
}

export function plainToTex(input) {
  let s = String(input).trim().replace(/[.;,]+$/, "").replace(/[−–]/g, "-").replace(/\u202F|\u00A0/g, " ");
  if (/[\\{}$#&%]/.test(s.replace(/\^\{[^{}]*\}|_\{[^{}]*\}/g, ""))) return null;      // already TeX, or characters we don't handle
  s = s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺ⁿ]+/g, m => `^{${[...m].map(c => SUPS[c]).join("")}}`);
  s = s.replace(/[₀₁₂₃₄₅₆₇₈₉]+/g, m => `_{${[...m].map(c => SUBS[c]).join("")}}`);
  // Units after a number, before anything else touches the letters.
  s = s.replace(new RegExp(`(\\d)\\s*(${UNITS.map(u => u.replace(/[/^]/g, "\\$&")).join("|")})(?![A-Za-z0-9])`, "g"), (_, d, u) => {
    const unit = u.replace("^2", "²");
    const tex = unit === "Ω" ? "\\Omega" : unit === "kΩ" ? "\\text{k}\\Omega" : unit === "MΩ" ? "\\text{M}\\Omega" : unit === "µA" ? "\\mu\\text{A}"
      : unit === "m/s²" ? "\\text{m/s}^{2}" : `\\text{${unit}}`;
    return `${d}\\,${tex}`;
  });
  s = s.replace(/°/g, "^{\\circ}").replace(/\bemf\b/g, "\\text{emf}");
  s = s.replace(/([A-Za-z])_\{?([A-Za-z]{2,12}|[A-Za-z0-9]{1,3})\}?(?![A-Za-z0-9])/g, (_, b, sub) => (/^[A-Za-z]{2,}$/.test(sub) ? `${b}_{\\text{${sub}}}` : `${b}_{${sub}}`));
  s = s.replace(/(?<![A-Za-z\\])([A-Z])(\d{1,2})(?![\w.])/g, "$1_{$2}");     // R2, I1, V12: a capital and its index
  s = s.replace(/\^\(([^()]{1,24})\)/g, "^{$1}").replace(/\^(-?\d+(?:\.\d+)?|[a-z])(?![\w{])/g, "^{$1}");
  s = s.replace(/√\(([^()]{1,40})\)/g, "\\sqrt{$1}").replace(/√(\d+(?:\.\d+)?|[A-Za-z])/g, "\\sqrt{$1}");
  s = s.replace(new RegExp(`(?<![\\\\A-Za-z])(${FUNCS})(?![A-Za-z])`, "g"), (_, f) => (f === "sqrt" ? "\\sqrt" : `\\${f} `));
  s = s.replace(/Ω/g, "\\Omega ");
  for (const [from, to] of SYMBOLS) s = s.split(from).join(to);
  s = fractions(s);
  return s.replace(/\s+/g, " ").trim();
}

// One step of a worked example: its title and its lines, each either text or an equation.
export function splitStep(text) {
  const lines = String(text).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  let title = null;
  if (lines.length > 1 && !/[=≈]/.test(lines[0]) && lines[0].length <= 70) title = lines.shift();
  else if (lines.length === 1) {
    const m = /^([^:=]{3,45}):\s+(.+)$/.exec(lines[0]);
    if (m && !isEquationLine(m[1])) { title = m[1]; lines[0] = m[2]; }
  }
  const parts = [];
  for (const [n, line] of lines.entries()) {
    // A sentence followed by its equation on the same line ("Add the series resistor: R = 3 + 12 = 15 Ω. This gives…").
    for (const sentence of line.split(/(?<=[.;])\s+(?=[A-Z])/)) {
      const s = sentence.trim();
      const labelled = /^(.{2,60}?):\s+(.+)$/.exec(s);
      if (isEquationLine(s)) parts.push({ type: "math", value: s, line: n });
      else if (labelled && !/[=≈]/.test(labelled[1]) && isEquationLine(labelled[2])) parts.push({ type: "text", value: `${labelled[1]}:`, line: n }, { type: "math", value: labelled[2], line: n });
      else parts.push({ type: "text", value: s, line: n });
    }
  }
  // Sentences of one line read as one paragraph; a new line is a new paragraph.
  const merged = [];
  for (const p of parts) {
    const last = merged.at(-1);
    if (p.type === "text" && last?.type === "text" && last.line === p.line) last.value = `${last.value} ${p.value}`; else merged.push({ ...p });
  }
  return { title, parts: merged.map(({ type, value }) => ({ type, value })) };
}
