// Formulas arrive inside JSON strings, where a single backslash is fragile:
// "\frac" can decode to a form-feed + "rac", "\times" to a tab + "imes", and
// some models drop backslashes entirely ("x^2 sin x", "f cdot g"). This repairs
// the damage inside $…$ / $$…$$ only, so ordinary prose is never touched.

const CONTROL = { "\f": "\\f", "\t": "\\t", "\b": "\\b", "\v": "\\v", "\r": "\\r" };
const COMMANDS = [
  "frac", "dfrac", "sqrt", "cdot", "times", "div", "pm", "mp", "leq", "geq", "neq", "approx", "infty", "partial",
  "sum", "prod", "int", "oint", "lim", "log", "ln", "exp", "sin", "cos", "tan", "sec", "csc", "cot", "arcsin", "arccos", "arctan",
  "alpha", "beta", "gamma", "delta", "Delta", "epsilon", "theta", "lambda", "mu", "pi", "rho", "sigma", "Sigma", "tau", "phi", "omega", "Omega",
  "rightarrow", "Rightarrow", "to", "left", "right", "text", "mathrm", "vec", "hat", "bar", "dot", "quad",
];
// Longest first, so "arcsin" wins over "sin".
const COMMAND_RE = new RegExp(`(?<![\\\\A-Za-z])(${[...COMMANDS].sort((a, b) => b.length - a.length).join("|")})(?![A-Za-z])`, "g");

function repairMath(math) {
  let m = math.replace(/[\f\t\b\v\r](?=[A-Za-z])/g, ch => CONTROL[ch]);
  // Commands glued to neighbours ("fcdotg", "2sin") still need a backslash. Inside
  // a formula "cdot"/"times" never mean anything else, so restore them anywhere.
  m = m.replace(/(?<!\\)(cdot|times)/g, "\\$1 ");
  m = m.replace(/(\d|\^\{?\d\}?)(sin|cos|tan|log|ln|exp)(?![A-Za-z])/g, "$1\\$2");
  return m.replace(COMMAND_RE, "\\$1");
}

export function repairLatex(text) {
  if (!text) return text;
  // \( … \) and \[ … \] delimiters (used by some models) → $ … $ and $$ … $$;
  // otherwise Markdown would treat "\(" as an escaped bracket.
  text = text.replace(/\\\[([\s\S]+?)\\\]/g, (_, m) => `$$${m}$$`).replace(/\\\(([\s\S]+?)\\\)/g, (_, m) => `$${m}$`);
  if (!text.includes("$")) return text;
  return text.replace(/\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g, (whole, display, inline) =>
    display !== undefined ? `$$${repairMath(display)}$$` : `$${repairMath(inline)}$`);
}
