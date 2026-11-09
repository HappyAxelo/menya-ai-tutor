// Small drawing helpers shared by every server-drawn picture. Everything a model or learner wrote passes
// through esc(), and the finished picture is checked against an allowlist before it can be stored or sent.
export const W = 640, H = 400;
export const INK = "#1d1b2e", ACCENT = "#251F8C", MARK = "#b42318", SOFT = "#ece9fb", GREEN = "#0f766e", AMBER = "#b54708", GREY = "#8a8898", LIGHT = "#e3e1ef";
export const COLORS = [ACCENT, MARK, GREEN, AMBER];
const FONT = 'font-family="Arial, Helvetica, sans-serif"';

const pretty = (s: string) => s.replace(/\^2\b/g, "²").replace(/\^3\b/g, "³").replace(/\*/g, "·");
export const esc = (s: unknown) => pretty(String(s ?? "").slice(0, 60)).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const n = (v: number) => (Math.round(v * 10) / 10).toString();

export interface TextOpts { size?: number; anchor?: string; fill?: string; weight?: string; base?: string; halo?: boolean }
// Phones show these pictures at about half size, so nothing is drawn smaller than 14.
export const text = (x: number, y: number, s: string, o: TextOpts = {}) =>
  `<text x="${n(x)}" y="${n(y)}" ${FONT} font-size="${Math.max(o.size ?? 16, 14)}" text-anchor="${o.anchor ?? "middle"}" fill="${o.fill ?? INK}"${o.weight ? ` font-weight="${o.weight}"` : ""}${o.base ? ` dominant-baseline="${o.base}"` : ""}${o.halo ? ' stroke="#fff" stroke-width="3" paint-order="stroke"' : ""}>${esc(s)}</text>`;
export const line = (x1: number, y1: number, x2: number, y2: number, o: { color?: string; width?: number; arrow?: boolean; dash?: string } = {}) =>
  `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="${o.color ?? INK}" stroke-width="${o.width ?? 2}"${o.dash ? ` stroke-dasharray="${o.dash}"` : ""}${o.arrow ? ' marker-end="url(#arrow)"' : ""}/>`;
export const rect = (x: number, y: number, w: number, h: number, o: { fill?: string; stroke?: string; rx?: number; width?: number; transform?: string } = {}) =>
  `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${o.fill ?? "#fff"}" stroke="${o.stroke ?? INK}" stroke-width="${o.width ?? 2}"${o.rx ? ` rx="${o.rx}"` : ""}${o.transform ? ` transform="${o.transform}"` : ""}/>`;
export const circle = (x: number, y: number, r: number, o: { fill?: string; stroke?: string; width?: number } = {}) =>
  `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="${o.fill ?? "#fff"}" stroke="${o.stroke ?? INK}" stroke-width="${o.width ?? 2}"/>`;
export const path = (d: string, o: { fill?: string; stroke?: string; width?: number; arrow?: boolean; dash?: string } = {}) =>
  `<path d="${d}" fill="${o.fill ?? "none"}" stroke="${o.stroke ?? INK}" stroke-width="${o.width ?? 2}"${o.dash ? ` stroke-dasharray="${o.dash}"` : ""}${o.arrow ? ' marker-end="url(#arrow)"' : ""}/>`;

// Words into lines that fit a box.
export function wrap(s: string, chars: number, maxLines = 3): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const word of s.trim().split(/\s+/)) {
    if (cur && (cur + " " + word).length > chars) { lines.push(cur); cur = word; } else cur = cur ? `${cur} ${word}` : word;
  }
  if (cur) lines.push(cur);
  return lines.slice(0, maxLines);
}

export const nums = (s: string) => (s.replace(/[−–]/g, "-").match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);

// "3/4", "-1.5" or "1 1/2" as a number; NaN if it isn't one.
export function parseValue(raw: string): number {
  const s = raw.replace(/[−–]/g, "-").trim();
  const mixed = /^(-?)(\d+)\s+(\d+)\s*\/\s*(\d+)$/.exec(s);
  if (mixed) return (mixed[1] ? -1 : 1) * (Number(mixed[2]) + Number(mixed[3]) / Number(mixed[4]));
  const frac = /^(-?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/.exec(s);
  if (frac) return Number(frac[2]) === 0 ? NaN : Number(frac[1]) / Number(frac[2]);
  return /^-?\d+(?:\.\d+)?$/.test(s) ? Number(s) : NaN;
}

// A round spacing for about six ticks.
export function niceStep(span: number): number {
  const raw = span / 6, p = 10 ** Math.floor(Math.log10(raw)), m = raw / p;
  return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p;
}

// Defence in depth. Pictures are built only from the helpers above, so this should never fail; if a future
// change or a stored row ever produced anything else, the picture is refused instead of shown.
const SAFE_ELEMENTS = new Set(["svg", "defs", "marker", "g", "rect", "circle", "ellipse", "line", "polyline", "polygon", "path", "text"]);
const SAFE_ATTRIBUTES = new Set(["xmlns", "viewBox", "role", "id", "refX", "refY", "markerWidth", "markerHeight", "orient", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry",
  "width", "height", "d", "points", "fill", "stroke", "stroke-width", "stroke-dasharray", "marker-end", "transform", "font-family", "font-size", "font-weight", "text-anchor",
  "dominant-baseline", "paint-order", "opacity", "aria-hidden"]);
export function isSafeSvg(svg: string): boolean {
  if (typeof svg !== "string" || !svg.startsWith("<svg") || svg.length > 200_000) return false;
  if (/javascript:|data:|<!|<\?|&#|\bhref\b|url\((?!#arrow\))/i.test(svg)) return false;
  for (const tag of svg.matchAll(/<\/?([a-zA-Z][\w-]*)([^<>]*)>/g)) {
    if (!SAFE_ELEMENTS.has(tag[1])) return false;
    for (const a of tag[2].matchAll(/([a-zA-Z_:][\w:.-]*)\s*=\s*"[^"]*"/g)) if (!SAFE_ATTRIBUTES.has(a[1])) return false;
    if (tag[2].replace(/([a-zA-Z_:][\w:.-]*)\s*=\s*"[^"]*"/g, "").replace(/[\s/]/g, "")) return false;
  }
  return !/<(?![a-zA-Z/])/.test(svg);
}
