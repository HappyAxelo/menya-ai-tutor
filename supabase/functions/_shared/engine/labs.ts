// Interactive visuals ("labs") for the "See how it works" part of a lesson. A lab is drawn and
// computed in the browser from a few numbers, so it costs nothing and doesn't use the picture
// allowance. It starts at the numbers of the lesson's worked example (the server's checked item),
// so the student sees the same circuit, curve or launch the example works through, then changes it.
// Only numbers from the bank's own question text go into a lab: never anything a model wrote.
import type { Item } from "./bankKit.ts";

export type LabKind = "circuit" | "tangent" | "area" | "projectile" | "forces" | "wave";
export interface Lab { kind: LabKind; params: Record<string, number | string> }

const num = (s: string | undefined) => (s == null ? NaN : Number(s));
const ok = (p: Record<string, number | string>) => Object.values(p).every(v => typeof v === "string" ? v.length > 0 : Number.isFinite(v));

export function labFor(item: Item): Lab | null {
  const q = item.question;
  let m: RegExpExecArray | null;
  let lab: Lab | null = null;
  switch (item.templateId) {
    case "ee.series_parallel":
      if ((m = /A ([\d.]+) V battery is connected to a ([\d.]+) Ω resistor in series with a parallel pair, R2 = ([\d.]+) Ω and R3 = ([\d.]+) Ω/.exec(q)))
        lab = { kind: "circuit", params: { V: num(m[1]), R1: num(m[2]), R2: num(m[3]), R3: num(m[4]) } };
      break;
    case "ee.ohm":
      if ((m = /A ([\d.]+) V source is connected across a single ([\d.]+) Ω resistor/.exec(q)))
        lab = { kind: "circuit", params: { V: num(m[1]), R1: num(m[2]), R2: 0, R3: 0 } };
      break;
    case "ee.series":
      if ((m = /Resistors of ([\d.]+) Ω and ([\d.]+) Ω are connected in series across a ([\d.]+) V supply/.exec(q)))
        lab = { kind: "circuit", params: { V: num(m[3]), R1: num(m[1]), R2: num(m[2]), R3: 0 } };
      break;
    case "ee.divider":
      if ((m = /A ([\d.]+) V supply feeds R1 = ([\d.]+) kΩ in series with R2 = ([\d.]+) kΩ/.exec(q)))
        lab = { kind: "circuit", params: { V: num(m[1]), R1: num(m[2]) * 1000, R2: num(m[3]) * 1000, R3: 0 } };
      break;
    case "calc.power": case "calc.product": case "calc.chain":
      if ((m = /Differentiate [fg]\(x\) = (.+)$/.exec(q)))
        lab = { kind: "tangent", params: { f: m[1].trim(), df: item.answer } };
      break;
    case "int.power":
      if ((m = /definite integral of f\(x\) = (.+) from x = ([\d.]+) to x = ([\d.]+)/.exec(q)))
        lab = { kind: "area", params: { f: m[1].trim(), a: num(m[2]), b: num(m[3]) } };
      break;
    case "phys.projectile":
      if ((m = /at ([\d.]+) m\/s at ([\d.]+)° above/.exec(q)))
        lab = { kind: "projectile", params: { v: num(m[1]), angle: num(m[2]) } };
      break;
    case "phys.newton2":
      if ((m = /A ([\d.]+) kg crate .* force of ([\d.]+) N\. A friction force of ([\d.]+) N/.exec(q)))
        lab = { kind: "forces", params: { m: num(m[1]), F: num(m[2]), f: num(m[3]) } };
      break;
    case "phys.wave":
      if ((m = /frequency ([\d.]+) Hz and wavelength ([\d.]+) m/.exec(q)))
        lab = { kind: "wave", params: { f: num(m[1]), lambda: num(m[2]) } };
      else if ((m = /travels at ([\d.]+) m\/s with frequency ([\d.]+) Hz/.exec(q)))
        lab = { kind: "wave", params: { f: num(m[2]), lambda: Math.round((num(m[1]) / num(m[2])) * 1000) / 1000 } };
      break;
  }
  return lab && ok(lab.params) ? lab : null;
}

// What the model is told the student can see and do, so its "See how it works" text matches the lab.
export const LAB_DESCRIPTION: Record<LabKind, string> = {
  circuit: "circuit diagram with sliders for the battery voltage and each resistance; it shows the current in every branch and the voltage across every resistor, and lists Kirchhoff's voltage law round the loop and the current law at the junction with the live numbers",
  tangent: "graph of the function with a movable point; it draws the tangent line there and shows its slope next to the value of the derivative at that point",
  area: "graph of the function with the area under it shaded between the limits; sliders move the upper limit and change the number of rectangles, so the sum of the rectangles can be seen approaching the integral",
  projectile: "launch simulation with sliders for launch speed, angle and gravity; it draws the path and shows the range, maximum height and time in the air",
  forces: "force diagram of the block with sliders for mass, push and friction; the arrows scale with the forces and it shows the net force and the acceleration",
  wave: "moving wave with sliders for frequency and wavelength; it marks one wavelength and shows the speed v = f·λ",
};
