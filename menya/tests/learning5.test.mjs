import { test } from "node:test";
import assert from "node:assert/strict";
import { prettyMath, projectile, stageIndex, flatTopics } from "../src/lib/learning.js";
import { topicName, translate } from "../src/i18n.js";
import { historyToMessages } from "../src/lib/chat.js";

test("plain-text powers and subscripts become readable; code and LaTeX are left alone", () => {
  assert.equal(prettyMath("g(t)=2t^3+4t, so g'(t)=6t^2+4"), "g(t)=2t³+4t, so g'(t)=6t²+4");
  assert.equal(prettyMath("a·n·x^{n-1} and 10^-3 and x^n"), "a·n·xⁿ⁻¹ and 10⁻³ and xⁿ");
  assert.equal(prettyMath("R_1 + R_2 = R_total"), "R₁ + R₂ = $R_{\\text{total}}$");
  assert.equal(prettyMath("V_{p}=30 V−I_{total}·3 Ω"), "$V_{\\text{p}}$=30 V−$I_{\\text{total}}$·3 Ω", "as the live model writes them");
  assert.equal(prettyMath("use `x^2` or\n```\ny = x^2\n```\nand $x^2$"), "use `x^2` or\n```\ny = x^2\n```\nand $x^2$");
  assert.equal(prettyMath("e^(2x) stays, x^{2y+z} stays"), "e^(2x) stays, x^{2y+z} stays");
  assert.equal(prettyMath("snake_case_name and file_2024"), "snake_case_name and file_2024");
  assert.equal(prettyMath("no maths here"), "no maths here");
  assert.equal(prettyMath(null), null);
});

test("the projectile simulation agrees with a hand calculation", () => {
  // 20 m/s at 30°, g = 9.8: T = 20/9.8 = 2.041 s; H = 100/19.6 = 5.102 m; R = 400·sin 60°/9.8 = 35.35 m.
  const p = projectile(20, 30, 9.8);
  assert.ok(Math.abs(p.time - 2.041) < 0.001 && Math.abs(p.height - 5.102) < 0.001 && Math.abs(p.range - 35.348) < 0.001);
  assert.ok(Math.abs(projectile(20, 60).range - p.range) < 1e-9, "complementary angles, same range");
  assert.ok(Math.abs(projectile(20, 30, 4.9).range - 2 * p.range) < 1e-9, "half the gravity, twice the range");
  assert.equal(p.points.length, 41);
  assert.ok(Math.abs(p.points.at(-1)[1]) < 1e-9, "it lands at ground level");
  assert.ok(Math.abs(Math.max(...p.points.map(q => q[1])) - p.height) < 1e-9);
});

test("stages are ordered, and topic names fall back to the server's title", () => {
  assert.deepEqual(["not_started", "exposure", "application", "mastery"].map(stageIndex), [-1, 0, 2, 4]);
  const t = (k, v) => translate("en", k, v);
  assert.equal(topicName(t, "ee.kirchhoff_laws", "server title"), "Kirchhoff's laws");
  assert.equal(topicName(t, "new.topic", "A topic added later"), "A topic added later");
  assert.equal(topicName((k) => translate("rw", k), "phys.wave_speed", "x"), "Wave speed", "English until a fluent speaker translates it");
  assert.deepEqual(flatTopics([{ subject: "physics", topics: [{ objective: "a" }] }]), [{ objective: "a", subject: "physics" }]);
});

test("a reopened conversation still shows which line was not confirmed", () => {
  const [m] = historyToMessages([{ role: "assistant", id: 1, content: "x", meta: { unverified: ["I_a + I_b ≈ I_total"] } }]);
  assert.deepEqual(m.unverified, ["I_a + I_b ≈ I_total"]);
  assert.equal(historyToMessages([{ role: "assistant", id: 2, content: "x", meta: {} }])[0].unverified, null);
});

test("worked-example equations are typeset; anything uncertain stays plain text", async () => {
  const { plainToTex, isEquationLine, splitStep } = await import("../src/lib/mathTex.js");
  const katex = (await import("katex")).default;
  const lines = ["R_parallel = 10·15/(10 + 15) = 6 Ω", "R_p = R2·R3/(R2 + R3)", "I_total = 8/16 = 0.5 A", "Δ = b² − 4ac = (−8)² − 4(2)(6) = 16", "x = (8 ± 4)/4",
    "x₁ = (8 + 4)/4 = 3", "2(3)² − 8(3) + 6 = 18 − 24 + 6 = 0", "d/dx(5x^4) = 5·4·x^3", "v_y = 20·sin 30° = 10 m/s", "a = F_net/m = 10 N / 5 kg = 2 m/s²", "|z| = √(3² + 4²) = 5"];
  for (const l of lines) {
    assert.ok(isEquationLine(l), l);
    assert.doesNotThrow(() => katex.renderToString(plainToTex(l), { throwOnError: true, strict: "ignore" }), l);
  }
  assert.equal(plainToTex("x = (8 ± 4)/4"), String.raw`x = \frac{8 \pm 4}{4}`);
  assert.equal(plainToTex("R_parallel = 10·15/(10 + 15) = 6 Ω"), String.raw`R_{\text{parallel}} = \frac{10\cdot 15}{10 + 15} = 6\,\Omega`);
  for (const l of ["So the result is 1.2 A.", "Check: if t=1, g(1)=6", "We know 3x + 5 = 14, we need x."]) assert.equal(isEquationLine(l), false, l);
  assert.equal(plainToTex(String.raw`\href{x}{y} = 1`), null, "TeX from a reply is never passed through");
  assert.deepEqual(splitStep("Calculate the discriminant\nIt tells how many roots there are.\nΔ = b² − 4ac = 16"),
    { title: "Calculate the discriminant", parts: [{ type: "text", value: "It tells how many roots there are." }, { type: "math", value: "Δ = b² − 4ac = 16" }] });
  assert.deepEqual(splitStep("Combine the resistors: R_p = 12 Ω. This is one resistor now.").parts.map(p => p.type), ["math", "text"]);
});
