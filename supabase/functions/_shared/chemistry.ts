// Exact check of a chemical equation in a student's message: are the atoms
// balanced? Models sometimes call an unbalanced equation correct, so the server
// counts the atoms itself. Returns null when the text has no equation it can read.

const ELEMENTS = new Set(("H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se " +
  "Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re " +
  "Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu").split(" "));

const SUBSCRIPTS: Record<string, string> = { "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4", "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9" };
const TERM = String.raw`\d*\s*(?:\(?[A-Z][a-z]?\d*\)?\d*)+`;
const SIDE = String.raw`${TERM}(?:\s*\+\s*${TERM})*`;
// Only real arrows: "=" would turn formulas like I = V/R into "equations".
const EQUATION = new RegExp(String.raw`(${SIDE})\s*(?:→|->|⟶|⇌|<=>)\s*(${SIDE})`);

type Counts = Map<string, number>;

function add(into: Counts, from: Counts, times: number) {
  for (const [el, n] of from) into.set(el, (into.get(el) ?? 0) + n * times);
}

// Atoms in one formula such as Ca(OH)2; null if it holds something that is not an element.
function formulaCounts(formula: string): Counts | null {
  const stack: Counts[] = [new Map()];
  const re = /([A-Z][a-z]?)(\d*)|(\()|(\))(\d*)/g;
  let pos = 0, m: RegExpExecArray | null;
  while ((m = re.exec(formula))) {
    if (m.index !== pos) return null;
    pos = re.lastIndex;
    if (m[1]) {
      if (!ELEMENTS.has(m[1])) return null;
      add(stack.at(-1)!, new Map([[m[1], 1]]), Number(m[2] || 1));
    } else if (m[3]) stack.push(new Map());
    else {
      if (stack.length < 2) return null;
      const group = stack.pop()!;
      add(stack.at(-1)!, group, Number(m[5] || 1));
    }
  }
  return pos === formula.length && stack.length === 1 && stack[0].size ? stack[0] : null;
}

function sideCounts(side: string): Counts | null {
  const total: Counts = new Map();
  for (const term of side.split("+")) {
    const m = /^\s*(\d*)\s*(.+?)\s*$/.exec(term);
    const counts = m && formulaCounts(m[2]);
    if (!counts) return null;
    add(total, counts, Number(m![1] || 1));
  }
  return total;
}

export type EquationCheck = { equation: string; balanced: boolean; counts: Record<string, [number, number]> };

export function checkEquation(text: string): EquationCheck | null {
  const clean = text.replace(/[₀-₉]/g, ch => SUBSCRIPTS[ch]).replace(/\((?:aq|s|l|g)\)/g, "");
  const m = EQUATION.exec(clean);
  if (!m) return null;
  const left = sideCounts(m[1]), right = sideCounts(m[2]);
  if (!left || !right) return null;
  const counts: Record<string, [number, number]> = {};
  for (const el of new Set([...left.keys(), ...right.keys()])) counts[el] = [left.get(el) ?? 0, right.get(el) ?? 0];
  return { equation: m[0].trim(), balanced: Object.values(counts).every(([a, b]) => a === b), counts };
}
