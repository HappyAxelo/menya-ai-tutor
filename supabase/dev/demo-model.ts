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

export const demoProvider: ModelProvider = {
  name: "groq",
  async chat(_config, req) {
    const last = String(req.messages.at(-1)!.content), first = req.messages.filter(m => m.role === "assistant").length === 0;
    const reply = /logic|gate/i.test(last) ? LOGIC : first || /\[SHOW IT AS A PICTURE|fraction/i.test(last) ? FRACTIONS : FEEDBACK;
    return { text: JSON.stringify({ ...base, ...reply }), inputTokens: 1, outputTokens: 1, latencyMs: 400, ttftMs: null };
  },
  async health() { return { ok: true }; },
};
