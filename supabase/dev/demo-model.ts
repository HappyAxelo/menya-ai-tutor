// A stand-in model for looking at the lesson interface without an AI key. Its replies are canned:
// they exercise the layout and visuals and say nothing about teaching quality.
//   MENYA_DEMO_MODEL=1 node dev/local-server.ts
import type { ModelProvider } from "../functions/_shared/providers.ts";

const it = (role: string, label = "", value = "") => ({ role, label, value });
const base = { conceptsDetected: ["Demo"], misconceptionDetected: null, hintLevel: null, progressSummary: null, solved: false, difficulty: "basic", finalAnswer: "",
  teachingPlan: { goal: "", alreadyKnows: "", prerequisite: "", visual: "", example: "", question: "" },
  assessment: { verdict: "not_an_attempt", reasoning: "none", misconception: null, confidence: 0.9, prerequisiteGap: null, objective: "other", evidence: "unclear" } };

const FRACTIONS = {
  language: "English", type: "explanation",
  message: `@@idea
Imagine cutting a chapati into equal pieces and eating some. A **fraction** tells you how many pieces you have out of how many there are in all.

The bottom number says how many equal parts the whole is cut into. The top number says how many of those parts you have.
@@see
Each bar is the same whole. The top bar is cut into 2 parts and the lower bar into 4. Look at the shaded length: it is the same in both bars. That is why 1/2 and 2/4 are the same amount, even though the numbers differ.
@@example
Show that 2/3 and 4/6 are equal.
1. We know both fractions describe the same whole, and we want to compare how much is shaded.
2. Cut each of the 3 parts in two. Now there are 6 parts. We do this so both fractions count the same size of piece.
3. Each shaded part also became two, so 2 shaded parts became 4.
4. Check: 2/3 and 4/6 fill the same length of the bar.
@@try
Look at the bars above. How many of the small parts in the lower bar are shaded?`,
  diagram: { kind: "fraction", title: "Same amount, different pieces", alt: "Two bars of equal length. One is cut in 2 parts with 1 shaded. The other is cut in 4 parts with 2 shaded. The shaded lengths match.", items: [it("fraction", "", "1/2"), it("fraction", "", "2/4")] },
};
const LOGIC = {
  language: "English", type: "explanation",
  message: `@@idea
Think of an AND gate as a door with two locks. It opens only if both keys turn.
@@see
The gate has two inputs on the left and one output on the right. The table lists every possible input. Notice that the output is 1 only in the last row.
@@try
Which row of the table has an output of 1?`,
  diagram: { kind: "logic", title: "An AND gate", alt: "An AND gate with inputs A and B and output Q.", items: [it("expression", "Q", "A AND B")] },
};
const FEEDBACK = { language: "English", type: "redirect", message: "@@feedback\nYou found the shaded parts, which is the right place to look. The lower bar has 4 small parts, and 2 of them are shaded.\n@@try\nSo what fraction of the lower bar is shaded?", diagram: null };

// The worked example recorded from the live site on 13 November 2026, with its false check. The server's
// arithmetic check should flag it; if the rewrite request arrives, the corrected working is returned
// (ask about "kirchhoff stubborn" to see what a student is shown when the model repeats the error).
const KIRCHHOFF_WRONG = `@@idea
A circuit is like water in pipes: the battery pushes, the resistors hold the flow back. Kirchhoff's current law says the current flowing into a junction equals the current flowing out. Kirchhoff's voltage law says the voltage rises and drops round any closed loop add up to zero.
@@example
1. Take a 10 V battery, a 1 Ω series resistor and parallel branches of 2 Ω and 4 Ω.
2. R_total = 1 Ω + 1.33 Ω = 2.33 Ω.
3. I_total = 10 V / 2.33 Ω ≈ 4.29 A.
4. V_parallel = I_total × 1 Ω = 4.29 V.
5. I_a = V_parallel / 2 Ω ≈ 2.14 A, I_b = V_parallel / 4 Ω ≈ 1.07 A.
6. Check: I_a + I_b ≈ I_total.
@@try
What is the combined resistance of the two parallel branches in your circuit?`;
const KIRCHHOFF_RIGHT = KIRCHHOFF_WRONG.replace("V_parallel = I_total × 1 Ω = 4.29 V", "V_parallel = 10 V − I_total × 1 Ω = 5.71 V (Kirchhoff's voltage law round the loop)")
  .replace("≈ 2.14 A", "≈ 2.86 A").replace("≈ 1.07 A", "≈ 1.43 A");
const POWER = { language: "English", type: "explanation", diagram: null, finalAnswer: "6x + 5",
  message: "@@idea\nThe derivative measures how fast a function changes. For a power of x, bring the power down as a multiplier and lower the power by one: d/dx(a·x^n) = a·n·x^{n-1}.\n@@example\n1. Take g(t) = 2t^3 + 4t.\n2. Power rule on 2t^3: 2·3·t^2 = 6t^2.\n3. The derivative of 4t is 4.\n4. So g'(t) = 6t^2 + 4.\n@@try\nWhat is the derivative of the first term, 3x^2?" };

export const demoProvider: ModelProvider = {
  name: "groq",
  async chat(_config, req) {
    const last = String(req.messages.at(-1)!.content), first = req.messages.filter(m => m.role === "assistant").length === 0;
    const asked = req.messages.map(m => String(m.content)).join("\n");
    if (/kirchhoff/i.test(asked)) {
      const fixed = /\[CHECK YOUR WORKING\]/.test(last) && !/stubborn/i.test(asked);
      return { text: JSON.stringify({ ...base, language: "English", type: "explanation", diagram: null, message: fixed ? KIRCHHOFF_RIGHT : KIRCHHOFF_WRONG }), inputTokens: 1, outputTokens: 1, latencyMs: 400, ttftMs: null };
    }
    if (/derivative/i.test(asked) && first) return { text: JSON.stringify({ ...base, ...POWER }), inputTokens: 1, outputTokens: 1, latencyMs: 400, ttftMs: null };
    const reply = /logic|gate/i.test(last) ? LOGIC : first || /\[SHOW IT AS A PICTURE|fraction/i.test(last) ? FRACTIONS : FEEDBACK;
    return { text: JSON.stringify({ ...base, ...reply }), inputTokens: 1, outputTokens: 1, latencyMs: 400, ttftMs: null };
  },
  async health() { return { ok: true }; },
};
