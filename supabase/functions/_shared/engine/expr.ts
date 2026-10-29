// Deterministic checking of students' mathematical and Boolean answers.
// A small recursive-descent parser (no eval): numbers, x (or another single
// variable), + - * / ^, implicit multiplication ("2x", "x(2+x)", "2sin x"),
// and sin cos tan exp ln log sqrt abs. Two expressions are judged equivalent
// when they agree at many random points, which is how a symbolic answer
// (for example a derivative in factored form) is checked without a CAS.

type Node =
  | { k: "num"; v: number }
  | { k: "var"; name: string }
  | { k: "neg"; a: Node }
  | { k: "bin"; op: "+" | "-" | "*" | "/" | "^"; a: Node; b: Node }
  | { k: "fn"; name: string; a: Node };

const FUNCS: Record<string, (x: number) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, exp: Math.exp, ln: Math.log, log: Math.log10,
  sqrt: Math.sqrt, abs: Math.abs,
};

function normalize(src: string): string {
  return src.toLowerCase()
    .replace(/[·×∙⋅]/g, "*").replace(/[−–]/g, "-").replace(/÷/g, "/")
    .replace(/²/g, "^2").replace(/³/g, "^3").replace(/√/g, "sqrt")
    .replace(/\*\*/g, "^").replace(/π|\bpi\b/g, "(3.141592653589793)")
    .replace(/(\d),(\d)/g, "$1.$2")
    .replace(/\s+/g, " ").trim();
}

type Tok = { t: "num"; v: number } | { t: "id"; v: string } | { t: "op"; v: string };

function tokenize(src: string): Tok[] | null {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === " ") { i++; continue; }
    const num = /^\d+(\.\d+)?|^\.\d+/.exec(src.slice(i));
    if (num) { out.push({ t: "num", v: Number(num[0]) }); i += num[0].length; continue; }
    const id = /^[a-z]+/.exec(src.slice(i));
    if (id) {
      // Split runs like "xsinx" into known function names and single-letter variables.
      let word = id[0];
      while (word.length) {
        const fn = Object.keys(FUNCS).find(f => word.startsWith(f));
        const piece = fn ?? word[0];
        out.push({ t: "id", v: piece });
        word = word.slice(piece.length);
      }
      i += id[0].length; continue;
    }
    if ("+-*/^()".includes(c)) { out.push({ t: "op", v: c }); i++; continue; }
    return null;
  }
  return out;
}

class Parser {
  private i = 0;
  private toks: Tok[];
  constructor(toks: Tok[]) { this.toks = toks; }
  private peek() { return this.toks[this.i]; }
  private eat(v?: string) {
    const t = this.toks[this.i];
    if (!t || (v !== undefined && !(t.t === "op" && t.v === v))) throw new Error("syntax");
    this.i++; return t;
  }
  parse(): Node { const n = this.sum(); if (this.i !== this.toks.length) throw new Error("syntax"); return n; }
  private sum(): Node {
    let n = this.product();
    for (let t = this.peek(); t?.t === "op" && (t.v === "+" || t.v === "-"); t = this.peek()) {
      this.i++; n = { k: "bin", op: t.v as "+" | "-", a: n, b: this.product() };
    }
    return n;
  }
  private startsFactor(t: Tok | undefined) { return t && (t.t === "num" || t.t === "id" || (t.t === "op" && t.v === "(")); }
  private product(): Node {
    let n = this.unary();
    for (;;) {
      const t = this.peek();
      if (t?.t === "op" && (t.v === "*" || t.v === "/")) { this.i++; n = { k: "bin", op: t.v as "*" | "/", a: n, b: this.unary() }; }
      else if (this.startsFactor(t)) n = { k: "bin", op: "*", a: n, b: this.power() };   // implicit multiplication
      else return n;
    }
  }
  private unary(): Node {
    const t = this.peek();
    if (t?.t === "op" && t.v === "-") { this.i++; return { k: "neg", a: this.unary() }; }
    if (t?.t === "op" && t.v === "+") { this.i++; return this.unary(); }
    return this.power();
  }
  private power(): Node {
    const base = this.atom();
    const t = this.peek();
    if (t?.t === "op" && t.v === "^") { this.i++; return { k: "bin", op: "^", a: base, b: this.unary() }; }
    return base;
  }
  private atom(): Node {
    const t = this.eat();
    if (t.t === "num") return { k: "num", v: t.v };
    if (t.t === "op" && t.v === "(") { const n = this.sum(); this.eat(")"); return n; }
    if (t.t === "id") {
      if (FUNCS[t.v]) {
        // sin x, sin(x), sin 2x: the argument is the next power-level term.
        const next = this.peek();
        if (next?.t === "op" && next.v === "^") { this.i++; const p = this.unary(); const arg = this.power(); return { k: "bin", op: "^", a: { k: "fn", name: t.v, a: arg }, b: p }; }
        return { k: "fn", name: t.v, a: this.power() };
      }
      if (t.v.length === 1) return { k: "var", name: t.v };
    }
    throw new Error("syntax");
  }
}

export function parseExpression(src: string): Node | null {
  const toks = tokenize(normalize(src));
  if (!toks || !toks.length) return null;
  try { return new Parser(toks).parse(); } catch { return null; }
}

export function evaluate(n: Node, vars: Record<string, number>): number {
  switch (n.k) {
    case "num": return n.v;
    case "var": return n.name in vars ? vars[n.name] : NaN;
    case "neg": return -evaluate(n.a, vars);
    case "fn": return FUNCS[n.name](evaluate(n.a, vars));
    case "bin": {
      const a = evaluate(n.a, vars), b = evaluate(n.b, vars);
      return n.op === "+" ? a + b : n.op === "-" ? a - b : n.op === "*" ? a * b : n.op === "/" ? a / b : Math.pow(a, b);
    }
  }
}

function variables(n: Node, out = new Set<string>()): Set<string> {
  if (n.k === "var") out.add(n.name);
  else if (n.k === "neg" || n.k === "fn") variables(n.a, out);
  else if (n.k === "bin") { variables(n.a, out); variables(n.b, out); }
  return out;
}

// Seeded random numbers so checks are reproducible.
export function rng(seed: number) {
  // Mix the seed first: nearby seeds (1, 2, 3...) must give unrelated sequences.
  let s = Math.imul((seed >>> 0) ^ 0x9e3779b9, 0x85ebca6b) >>> 0 || 1;
  const next = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  for (let i = 0; i < 4; i++) next();
  return next;
}

// True when both expressions agree (relative tolerance) at random points. Null if either can't be read.
export function equivalent(a: string, b: string, points = 24): boolean | null {
  const na = parseExpression(a), nb = parseExpression(b);
  if (!na || !nb) return null;
  const names = [...new Set([...variables(na), ...variables(nb)])];
  const r = rng(12345);
  let compared = 0;
  for (let i = 0; i < points * 3 && compared < points; i++) {
    const vars = Object.fromEntries(names.map(v => [v, 0.3 + r() * 2.7]));
    const x = evaluate(na, vars), y = evaluate(nb, vars);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    compared++;
    if (Math.abs(x - y) > 1e-6 * Math.max(1, Math.abs(x), Math.abs(y))) return false;
  }
  return compared >= Math.min(points, 6) ? true : null;
}

// The right-hand side of a student's final line: "f'(x) = 2x sin x + ..." -> "2x sin x + ...".
export function finalExpression(text: string): string {
  const line = text.trim().split(/\n/).filter(Boolean).pop() ?? "";
  const rhs = line.split(/[=:]/).pop()!; // "My answer: ...", "f'(x) = ..."
  return rhs.replace(/[.;,]\s*$/, "").replace(/^(so|then|therefore|answer:?)\s+/i, "").trim();
}

// ---------------- Boolean algebra (digital logic) ----------------
// Accepts A·B / AB / A&B / A AND B, A+B / A|B / A OR B, A' / ~A / !A / NOT A, A^B / A XOR B.
type BNode = { k: "v"; n: string } | { k: "c"; v: boolean } | { k: "not"; a: BNode } | { k: "and" | "or" | "xor"; a: BNode; b: BNode };

export function parseBoolean(src: string): BNode | null {
  const s = src.toUpperCase().replace(/\bAND\b/g, "&").replace(/\bOR\b/g, "|").replace(/\bXOR\b/g, "^").replace(/\bNOT\b/g, "~")
    .replace(/[·∙⋅*.]/g, "&").replace(/\+/g, "|").replace(/[¬!]/g, "~").replace(/⊕/g, "^").replace(/’/g, "'").replace(/\s+/g, "");
  let i = 0;
  const peek = () => s[i];
  const or = (): BNode => { let n = xor(); while (peek() === "|") { i++; n = { k: "or", a: n, b: xor() }; } return n; };
  const xor = (): BNode => { let n = and(); while (peek() === "^") { i++; n = { k: "xor", a: n, b: and() }; } return n; };
  const and = (): BNode => {
    let n = not();
    for (;;) {
      if (peek() === "&") { i++; n = { k: "and", a: n, b: not() }; }
      else if (peek() && /[A-Z01(~]/.test(peek())) n = { k: "and", a: n, b: not() };   // AB means A·B
      else return n;
    }
  };
  const not = (): BNode => {
    if (peek() === "~") { i++; return { k: "not", a: not() }; }
    let n = atom();
    while (peek() === "'") { i++; n = { k: "not", a: n }; }
    return n;
  };
  const atom = (): BNode => {
    const c = s[i++];
    if (c === "(") { const n = or(); if (s[i++] !== ")") throw new Error("syntax"); return n; }
    if (c === "0" || c === "1") return { k: "c", v: c === "1" };
    if (c && /[A-Z]/.test(c)) return { k: "v", n: c };
    throw new Error("syntax");
  };
  try { const n = or(); return i === s.length ? n : null; } catch { return null; }
}

function bEval(n: BNode, env: Record<string, boolean>): boolean {
  switch (n.k) {
    case "v": return env[n.n] ?? false;
    case "c": return n.v;
    case "not": return !bEval(n.a, env);
    case "and": return bEval(n.a, env) && bEval(n.b, env);
    case "or": return bEval(n.a, env) || bEval(n.b, env);
    case "xor": return bEval(n.a, env) !== bEval(n.b, env);
  }
}

function bVars(n: BNode, out = new Set<string>()): Set<string> {
  if (n.k === "v") out.add(n.n);
  else if (n.k === "not") bVars(n.a, out);
  else if (n.k !== "c") { bVars(n.a, out); bVars(n.b, out); }
  return out;
}

// Truth-table equivalence over every input combination. Null if either can't be read.
export function booleanEquivalent(a: string, b: string): boolean | null {
  const na = parseBoolean(a), nb = parseBoolean(b);
  if (!na || !nb) return null;
  const names = [...new Set([...bVars(na), ...bVars(nb)])].sort();
  if (names.length > 8) return null;
  for (let m = 0; m < 1 << names.length; m++) {
    const env = Object.fromEntries(names.map((v, i) => [v, Boolean((m >> i) & 1)]));
    if (bEval(na, env) !== bEval(nb, env)) return false;
  }
  return true;
}
