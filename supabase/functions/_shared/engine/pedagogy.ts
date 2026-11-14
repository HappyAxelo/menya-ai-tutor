// The teaching layer between the state machine and the model. state.ts decides WHICH move to make;
// this file decides what SHAPE the reply takes, which visual would help, what the student's answer is
// evidence of, and checks the finished reply really taught before it asked.
//
//   SHOW → EXPLAIN → DEMONSTRATE → GUIDE → ASK → EVALUATE → ADAPT
//
// Pure functions: every rule is unit-tested without a model.
import { parseLesson, type SectionId } from "../lessonFormat.ts";
import type { DiagramKind, LabelledTemplate } from "../diagramSpec.ts";
import type { Assessment, EngineAction, RequestKind, TurnPlan } from "./state.ts";

export type LessonFormat = "brief" | "lesson" | "picture" | "demonstrate" | "reteach" | "prerequisite" | "guide" | "feedback" | "plain";
export interface LessonShape {
  format: LessonFormat;
  sections: SectionId[];    // in order; empty = no sections needed
  foundation: boolean;      // the reply must teach before it asks
  visual: "must" | "should" | "none";
}

const SHAPES: Record<Exclude<LessonFormat, "plain">, Omit<LessonShape, "format">> = {
  brief: { sections: [], foundation: false, visual: "none" },
  lesson: { sections: ["idea", "see", "example", "try"], foundation: true, visual: "should" },
  picture: { sections: ["see", "try"], foundation: false, visual: "must" },
  demonstrate: { sections: ["example", "try"], foundation: true, visual: "none" },
  reteach: { sections: ["feedback", "idea", "see", "try"], foundation: true, visual: "should" },
  prerequisite: { sections: ["feedback", "idea", "see", "example", "try"], foundation: true, visual: "should" },
  guide: { sections: ["feedback", "try"], foundation: false, visual: "none" },
  feedback: { sections: ["feedback"], foundation: false, visual: "none" },
};
const PLAIN: LessonShape = { format: "plain", sections: [], foundation: false, visual: "none" };
const shape = (format: Exclude<LessonFormat, "plain">): LessonShape => ({ format, ...SHAPES[format] });

export interface ShapeContext {
  plan: TurnPlan;
  action: EngineAction;
  requestKind: RequestKind;
  brief: boolean;       // a quick fact: a short answer is the right answer
  researching: boolean; // an evidence question: the reply follows the citation rules instead
  presenting: boolean;  // a bank problem: its wording is fixed
  attempted?: boolean;  // the student just tried to answer (a button press has nothing to give feedback on)
}

export function lessonShape(c: ShapeContext): LessonShape {
  const s = chooseShape(c);
  return c.attempted ? s : { ...s, sections: s.sections.filter(id => id !== "feedback") };
}

function chooseShape(c: ShapeContext): LessonShape {
  if (c.presenting || c.researching || c.action === "summary") return PLAIN;
  if (c.brief) return shape("brief");
  if (c.action === "diagram") return shape("picture");
  switch (c.plan.state) {
    case "TEACH": return shape("lesson");
    case "PREREQ": return shape("prerequisite");
    case "MODEL": return shape("demonstrate");
    case "EXPLAIN":
      if (c.plan.revealAllowed) return c.requestKind === "concept" ? shape("lesson") : shape("demonstrate");
      return c.action === "message" && c.requestKind === "concept" ? shape("lesson") : shape("reteach");
    case "HINT": case "GUIDE": case "DIAGNOSE": return shape("guide");
    case "PRACTISE": case "VERIFY": case "MASTERED": return shape("feedback");
    default: return PLAIN;
  }
}

// ---------- What is being asked for ----------
export type Intent = "concept" | "worked_example" | "homework" | "exam" | "problem" | "other";
export function detectIntent(text: string, kind: RequestKind): Intent {
  if (/\b(worked example|show me an example|example of how|exemple (résolu|corrigé)|urugero|mfano)\b/i.test(text)) return "worked_example";
  if (/\b(exam|test|revision|revise|examen|contr[ôo]le|ikizamini|mtihani)\b/i.test(text)) return "exam";
  if (/\b(homework|assignment|devoir|umukoro|kazi ya nyumbani)\b/i.test(text)) return "homework";
  return kind === "concept" ? "concept" : kind === "problem" ? "problem" : "other";
}

// A short fact deserves a short answer. Not every message needs a lesson.
export function isBriefFact(text: string): boolean {
  const t = text.trim();
  if (/^(hi|hello|hey|thanks|thank you|ok|okay|muraho|bite|murakoze|bonjour|salut|merci|habari|asante)\W*$/i.test(t)) return true;
  if (/^(what(?:'s| is)\s+)?-?\d+(\.\d+)?\s*[-+*/x×÷]\s*-?\d+(\.\d+)?(\s+and why)?\s*[?=]*\s*$/i.test(t)) return true;
  return /^(who (is|was)|when (did|was|is)|where is|what(?:'s| is) the (capital|chemical symbol|symbol|boiling point|freezing point|speed of light|value of pi|si unit)|how many \w+ (are|is) (there )?in|quelle est la capitale)\b/i.test(t) && t.length <= 80;
}

// ---------- Which visual fits this topic ----------
export interface VisualSuggestion { subject: string; kinds: DiagramKind[]; template?: LabelledTemplate }
const TOPICS: [RegExp, VisualSuggestion][] = [
  [/photosynth|fotosente|fotosinte|usanisinuru/i, { subject: "biology", kinds: ["labelled", "flow"], template: "photosynthesis" }],
  [/water cycle|cycle de l'eau|ukuzenguruka kw'amazi|mzunguko wa maji/i, { subject: "geography", kinds: ["labelled", "flow"], template: "water_cycle" }],
  [/plant cell|cellule v[ée]g[ée]tale|selile y'ibimera/i, { subject: "biology", kinds: ["labelled", "compare"], template: "plant_cell" }],
  [/animal cell|cellule animale/i, { subject: "biology", kinds: ["labelled", "compare"], template: "animal_cell" }],
  [/states? of matter|solid.*liquid.*gas|[ée]tats? de la mati[èe]re/i, { subject: "chemistry", kinds: ["labelled", "compare"], template: "states_of_matter" }],
  [/volcano|volcan|ikirunga/i, { subject: "geography", kinds: ["labelled"], template: "volcano" }],
  [/fraction|ibice|sehemu|numerator|denominator|d[ée]nominateur|num[ée]rateur/i, { subject: "maths", kinds: ["fraction", "numberline"] }],
  [/number line|droite (num[ée]rique|gradu[ée]e)|inequalit|in[ée]quation|negative number|nombres? n[ée]gatifs?/i, { subject: "maths", kinds: ["numberline"] }],
  [/slope|gradient|coordinate|straight line|y\s*=\s*\d*x|pente|droite d'[ée]quation|rep[èe]re/i, { subject: "maths", kinds: ["coordinate", "graph"] }],
  [/\b(logic gates?|and gate|or gate|nand|nor gate|xor|boolean|truth table|portes? logiques?|table de v[ée]rit[ée])\b/i, { subject: "electronics", kinds: ["logic", "truth_table"] }],
  [/circuit|resistor|r[ée]sistance|ohm|voltage|tension [ée]lectrique|\bcurrent\b|courant [ée]lectrique|amashanyarazi|umuzunguruko/i, { subject: "electronics", kinds: ["circuit", "compare"] }],
  [/waveform|square wave|sine wave|clock signal|signal num[ée]rique/i, { subject: "electronics", kinds: ["waveform"] }],
  [/newton|\bforces?\b|friction|inclined plane|plan inclin[ée]|gravity|gravit[ée]|imbaraga/i, { subject: "physics", kinds: ["forces", "graph"] }],
  [/\b(for|while)[- ]?loops?\b|boucles?\b|iteration|algorithm|algorithme|flowchart|organigramme|programming|python|javascript/i, { subject: "computer science", kinds: ["flowchart", "array"] }],
  [/array|binary search|recherche dichotomique|sorting|\btri\b/i, { subject: "computer science", kinds: ["array", "flowchart"] }],
  [/balance.*equation|chemical reaction|r[ée]action chimique|[ée]quilibrer|combustion|->|→/i, { subject: "chemistry", kinds: ["reaction", "energy"] }],
  [/exothermic|endothermic|activation energy|exothermique|endothermique/i, { subject: "chemistry", kinds: ["energy"] }],
  [/molecule|mol[ée]cule|covalent/i, { subject: "chemistry", kinds: ["molecule"] }],
  [/\batom\b|electron shell|atome|couches? [ée]lectroniques?/i, { subject: "chemistry", kinds: ["atom"] }],
  [/histogram|distribution|frequency table|statistics|statistiques/i, { subject: "statistics", kinds: ["histogram", "bars"] }],
  [/scatter|correlation|corr[ée]lation|regression/i, { subject: "statistics", kinds: ["scatter"] }],
  [/climate graph|climat|climagramme|rainfall/i, { subject: "geography", kinds: ["climate", "bars"] }],
  [/timeline|chronolog|history of|histoire de/i, { subject: "history", kinds: ["timeline"] }],
  [/difference between|compare|versus|\bvs\b|diff[ée]rence entre|itandukaniro/i, { subject: "comparison", kinds: ["compare"] }],
  [/algebra|alg[èe]bre|equation|[ée]quation|solve for|\bx\s*[-+=]|\d\s*x\b/i, { subject: "maths", kinds: ["numberline", "flow"] }],
  [/graph|courbe|parabol|function|fonction|derivative|d[ée]riv[ée]e|integral|int[ée]grale/i, { subject: "maths", kinds: ["graph"] }],
  [/triangle|pythag|trigonom|sin\b|cos\b|tan\b/i, { subject: "maths", kinds: ["triangle", "coordinate"] }],
  [/process|cycle|life cycle|cycle de vie|steps of|digestion|mitosis|mitose/i, { subject: "biology", kinds: ["flow", "compare"] }],
];
export function suggestVisual(text: string): VisualSuggestion | null {
  return TOPICS.find(([re]) => re.test(text))?.[1] ?? null;
}

// ---------- What each section of a reply must do (sent only for the sections this reply uses) ----------
const SECTION_TEXT: Record<SectionId, string> = {
  idea: "@@idea: A familiar comparison from daily life first, then a one-sentence definition. Two to four short sentences. At most one new technical word, explained where it appears.",
  see: "@@see: Explain the picture: what the student is looking at, how the parts connect, the one thing to notice, and how that answers their question. Two to four short sentences that still make sense if the picture can't be shown. Name the parts in words.",
  example: "@@example: A worked example with DIFFERENT numbers or a different case from the student's own problem. Write it as a numbered list: 1. what we know and what we need; then each step with the reason for it; last step: how to check the result.",
  try: "@@try: Exactly ONE question, the only question in the reply. It tests the one thing just taught, can be answered from what was just shown, and needs nothing new. Ask for recognition first; application once they have shown recognition. For a problem of their own, ask them to do its first step, not the whole thing.",
  feedback: "@@feedback: About the student's last answer, respectfully: what was right, then the missing or wrong idea. Short.",
  check: "@@check: One short independent exercise on a different case, to do without help.",
};

export function shapeNote(s: LessonShape, picture: { offered: boolean; tablesOnly: boolean }): string {
  if (s.format === "plain" || (!s.sections.length && s.format !== "brief")) return "";
  if (s.format === "brief") return "Format: a short direct answer. No sections, no lesson, no follow-up question unless one is really useful.";
  const sections = s.sections.filter(id => id !== "see" || picture.offered);
  const lines = [`Format: write the message in these sections, in this order, each starting on its own line with its marker (for example @@idea) followed by a line break, nothing before the first marker and no dash after a marker. In a worked example put every numbered step on its own line. Keep it short: students read this on a phone.`];
  for (const id of sections) lines.push(SECTION_TEXT[id]);
  if (s.foundation) lines.push("Teach before you ask: nothing in the reply may be a question until the @@try section.");
  return lines.join("\n");
}

// How to respond to what the student just wrote, when the server can't mark it itself.
export const ADAPT_NOTE = `Read the student's latest message as evidence and respond to what it shows:
- correct: say briefly why it is right, connect it to the idea, then go one step harder.
- partly right: name the part that is right, explain the missing part, show a smaller example, then ask one targeted question.
- wrong: never shame. Name the likely misunderstanding, explain it a NEW way (a different comparison, picture or example), then ask an easier, smaller question.
- "I don't know": don't repeat your question. Explain another way, split the problem, offer a hint or a part-finished example, then ask something simpler.`;

// ---------- Did the reply teach before it asked? ----------
const QUESTION = /[?？؟]/g;
const wordsIn = (s: string) => (s.match(/[\p{L}\p{N}'’-]+/gu) ?? []).length;
const withoutCode = (s: string) => s.replace(/```[\s\S]*?```/g, " ").replace(/`[^`]*`/g, " ");
export interface TeachingCheck { ok: boolean; problems: string[] }

export function checkTeachingOrder(message: string, s: LessonShape): TeachingCheck {
  const problems: string[] = [];
  if (!s.foundation) return { ok: true, problems };
  const text = withoutCode(message);
  const lesson = parseLesson(text);
  const asking = lesson.sections.filter(x => x.id === "try" || x.id === "check").map(x => x.body).join("\n");
  const teaching = lesson.sections.length
    ? [lesson.intro, ...lesson.sections.filter(x => x.id !== "try" && x.id !== "check").map(x => x.body)].join("\n")
    : text;
  const firstQuestion = lesson.sections.length ? teaching.search(QUESTION) : text.search(QUESTION);
  if (lesson.sections.length) {
    if (firstQuestion >= 0) problems.push("asks_while_teaching");
    if (wordsIn(teaching) < 25) problems.push("too_little_teaching");
  } else {
    // A reply without sections still has to explain first.
    const before = firstQuestion >= 0 ? text.slice(0, firstQuestion) : text;
    if (firstQuestion >= 0 && wordsIn(before) < 25) problems.push("asks_before_teaching");
  }
  if (((asking || text).match(QUESTION) ?? []).length > 2) problems.push("too_many_questions");
  return { ok: problems.length === 0, problems };
}

// A short note for the one rewrite a reply gets if it broke that rule.
export const teachFirstRequest = (problems: string[]) =>
  `[TEACH FIRST] Your last reply ${problems.includes("too_little_teaching") || problems.includes("asks_before_teaching") ? "asked the student something before teaching enough for them to answer it" : "asked questions while it was still teaching"}. Rewrite it: explain the idea and show how it works first, using the sections you were given, and ask only ONE question, at the very end in @@try. Don't reveal the final answer. Same language, same JSON format.`;

// ---------- What the student's answer is evidence of ----------
export type Evidence = "understands" | "possible_guess" | "memorised" | "misconception" | "missing_prerequisite" | "cannot_apply" | "unclear";
export interface EvidenceFacts {
  verified: "correct" | "incorrect" | "unreadable" | "unknown";
  unexplained: boolean;
  misconception: string | null;
  itemKind: "practice" | "verify" | "review" | null;
  guidedSuccessBefore: boolean;   // solved this kind of problem with help earlier
  assessment: Assessment | null;
}

// The server's facts come first; the model's reading only fills in what the server can't know.
export function classifyEvidence(f: EvidenceFacts): Evidence {
  const a = f.assessment && f.assessment.confidence >= 0.6 ? f.assessment : null;
  if (f.verified === "incorrect" && (f.itemKind === "verify" || f.itemKind === "review") && f.guidedSuccessBefore) return "cannot_apply";
  if (f.verified === "incorrect" && f.misconception) return "misconception";
  if (f.verified === "correct" && f.unexplained) return "possible_guess";
  if (a?.prerequisiteGap) return "missing_prerequisite";
  if (f.verified === "correct") return a?.evidence === "memorised" ? "memorised" : "understands";
  if (a?.evidence && a.evidence !== "unclear") return a.evidence;
  if (a?.misconception) return "misconception";
  return "unclear";
}

export const EVIDENCE_NOTE: Partial<Record<Evidence, string>> = {
  possible_guess: "The right answer came with no reasoning: it may be a guess. Check understanding before moving on.",
  memorised: "The answer looks memorised. Ask them to use the idea in a new situation.",
  cannot_apply: "They managed this with help but not alone: they follow the method but can't start it independently. Name the step where independent work broke down, show that step on a new example, then give a slightly easier problem to do alone.",
  missing_prerequisite: "The evidence points to something earlier that is missing. Teach that first.",
};

// ---------- What gets recorded ----------
export type TeachingEventKind = "concept_introduced" | "visual_shown" | "example_shown" | "hint_requested" | "response_submitted" | "misconception_detected" | "explained_again" | "independent_answered" | "mastery_assessed";
export interface TeachingEventFacts {
  format: LessonFormat; action: EngineAction; state: string; isAttempt: boolean; visualKind: string | null; misconception: string | null;
  verified: string; itemKind: "practice" | "verify" | "review" | null; masteryChanged: boolean; hadTeaching: boolean;
}
export function teachingEvents(f: TeachingEventFacts): { kind: TeachingEventKind; visual_kind?: string | null }[] {
  const out: { kind: TeachingEventKind; visual_kind?: string | null }[] = [];
  if (f.isAttempt) out.push({ kind: "response_submitted" });
  if (f.action === "hint") out.push({ kind: "hint_requested" });
  if (f.format === "lesson" && !f.hadTeaching) out.push({ kind: "concept_introduced" });
  if (f.format === "reteach" || f.format === "prerequisite" || (f.format === "lesson" && f.hadTeaching)) out.push({ kind: "explained_again" });
  if (f.format === "demonstrate" || f.format === "lesson") out.push({ kind: "example_shown" });
  if (f.visualKind) out.push({ kind: "visual_shown", visual_kind: f.visualKind });
  if (f.misconception) out.push({ kind: "misconception_detected" });
  if (f.isAttempt && (f.itemKind === "verify" || f.itemKind === "review") && (f.verified === "correct" || f.verified === "incorrect")) out.push({ kind: "independent_answered" });
  if (f.masteryChanged) out.push({ kind: "mastery_assessed" });
  return out;
}

// Recent help against recent independent success: a learner who has needed a lot of help starts with more support.
export function signalsNote(counts: Record<string, number>): string | null {
  const help = (counts.hint_requested ?? 0) + (counts.explained_again ?? 0), alone = counts.independent_answered ?? 0;
  if (help >= 4 && help >= alone * 3) return "[APP NOTE] This learner has needed a lot of help recently. Use smaller steps and a fuller worked example from the start.";
  if (alone >= 3 && help === 0) return "[APP NOTE] This learner has been working independently. You can move a little faster and ask a more demanding question.";
  return null;
}

// ---------- Subject teaching structure ----------
// A lesson in mathematics is not built like one in physics. These notes go with a lesson, a worked
// example or a re-teach; a hint or a short answer doesn't get them.
export type TeachingSubject = "maths" | "physics" | "computing";
const SUBJECT_TEXT: Record<TeachingSubject, string> = {
  maths: `Mathematics lesson. In this order: (1) say what is given and what is wanted; (2) name the method and say why it fits this problem; (3) state the rule in its general form and say what each symbol means BEFORE using it; (4) show every algebra step on its own line with the reason for it, and never write "simplifying gives" over a step the student needs to see; (5) when a term disappears or changes sign, say why (the derivative of a constant is zero because a constant does not change); (6) verify the result with numbers you actually compute: substitute back, differentiate an integral, or test a simple value.`,
  physics: `Physics lesson. In this order: (1) describe what physically happens before any equation; (2) name the law by its name and state it in words and in symbols, and if the student named a law (Kirchhoff's laws, Newton's second law, Faraday's law), state THAT law explicitly and use it, not a shortcut that hides it; (3) define every symbol with its SI unit; (4) say how the quantities depend on each other (what happens to one when another grows); (5) carry units through every line of the worked example; (6) end with a check you actually compute: units, a conservation law (currents at a junction add up, energy is conserved) or a limiting case.`,
  computing: `Computing lesson. Trace one small concrete input step by step first (a table of the variables after each step), then state the general rule, then its cost or its limits. Show code or pseudocode only after the trace.`,
};
const LESSON_FORMATS: LessonFormat[] = ["lesson", "demonstrate", "reteach", "prerequisite"];

export function teachingSubject(text: string, objectiveSubject: string | null = null): TeachingSubject | null {
  const fromObjective: Record<string, TeachingSubject> = { mathematics: "maths", calculus: "maths", physics: "physics", electronics: "physics",
    engineering: "physics", digital_logic: "computing", programming: "computing" };
  if (objectiveSubject && fromObjective[objectiveSubject]) return fromObjective[objectiveSubject];
  const s = suggestVisual(text)?.subject;
  if (s === "maths" || s === "statistics") return "maths";
  if (s === "physics" || s === "electronics") return "physics";
  if (s === "computer science") return "computing";
  if (/\b(integra\w*|deriv\w*|differentiat\w*|matrix|matrices|determinant|probabilit\w*|complex numbers?|logarithm\w*|limit of|differential equations?|vectors?|eigen\w*)\b/i.test(text)) return "maths";
  if (/\b(kirchhoff|momentum|kinematics|projectile|velocity|acceleration|energy|thermodynamic\w*|induction|magnetic|electric field|capacitor|inductor|wavelength|frequency|pressure|optics|quantum)\b/i.test(text)) return "physics";
  return null;
}

export function subjectNote(subject: TeachingSubject | null, format: LessonFormat): string | null {
  return subject && LESSON_FORMATS.includes(format) ? SUBJECT_TEXT[subject] : null;
}

// ---------- Support for this topic ----------
// 1 strong guidance · 2 guided independence · 3 independent mastery. Decided per topic from marked
// answers (mastery.ts), so a learner can be at 3 in calculus and at 1 in mechanics.
export const SUPPORT_NOTE: Record<1 | 2 | 3, string> = {
  1: "Support for this topic: strong guidance. Go slowly, state each rule before using it, give a full worked example and offer help readily.",
  2: "Support for this topic: guided independence. Keep explanations short, let the student carry out most steps, give fewer hints than before and make each problem a little harder than the last.",
  3: "Support for this topic: independent mastery. Don't re-teach what they have shown. Pose an unfamiliar or exam-style application and let them work alone; step in only when asked.",
};

// ---------- Which bank topic is this conversation about? ----------
// Words in the student's own request, so verified practice, "Check yourself" and spaced review are
// available from the first reply. A guess here only chooses which checked problems are offered.
const OBJECTIVE_WORDS: [RegExp, string][] = [
  [/kirchhoff|\bkcl\b|\bkvl\b|loi des (mailles|n[œo]euds)/i, "ee.kirchhoff_laws"],
  [/voltage divider|diviseur de tension/i, "ee.voltage_divider"],
  [/resistors? in series|series circuit|r[ée]sistances? en s[ée]rie/i, "ee.series_circuits"],
  [/ohm'?s law|loi d'ohm/i, "ee.ohms_law"],
  [/integrat\w* by substitution|u[- ]substitution|changement de variable/i, "calc.integration_substitution"],
  [/chain rule|d[ée]riv[ée]e d'une compos[ée]e/i, "calc.chain_rule"],
  [/product rule|d[ée]riv[ée]e d'un produit/i, "calc.product_rule"],
  [/differential equations?|[ée]quations? diff[ée]rentielles?/i, "calc.first_order_ode"],
  [/\bintegra(l|ls|tion|te)\b|int[ée]grale?s?\b|primitive/i, "calc.integration_power"],
  [/differentiat\w*|derivatives?|d[ée]riv[ée]es?\b|power rule/i, "calc.basic_derivatives"],
  [/determinant/i, "linalg.determinants"],
  [/matri(x|ces) (multiplication|product)|multiply(ing)? matrices|produit (matriciel|de matrices)/i, "linalg.matrix_multiplication"],
  [/binomial (distribution|probability)|loi binomiale/i, "prob.binomial_distribution"],
  [/independent events|probabilit/i, "prob.independent_events"],
  [/complex numbers?|nombres? complexes?/i, "math.complex_numbers"],
  [/projectile/i, "phys.projectile_motion"],
  [/newton'?s? (second|2nd|laws?)|deuxi[èe]me loi de newton|f\s*=\s*ma\b/i, "phys.newtons_second_law"],
  [/faraday|electromagnetic induction|induction [ée]lectromagn[ée]tique/i, "phys.electromagnetic_induction"],
  [/wave (speed|equation|mechanics)|wavelength|longueur d'onde/i, "phys.wave_speed"],
  [/nyquist|sampling (rate|theorem|frequency)|[ée]chantillonnage/i, "sig.sampling"],
  [/steady[- ]state|closed[- ]loop|feedback loop|control systems?/i, "ctrl.feedback_steady_state"],
  [/\bdiodes?\b/i, "semi.diode_circuits"],
  [/\bstacks?\b|\bqueues?\b|\bpile\b|\bfile d'attente/i, "ds.stacks_queues"],
  [/binary search|recherche dichotomique/i, "algo.binary_search"],
  [/big[- ]?o\b|time complexity|complexit[ée]/i, "prog.complexity"],
  [/boolean|de morgan/i, "logic.boolean_algebra"],
  [/linear equations?|[ée]quations? du premier degr[ée]/i, "math.linear_equations"],
];
export function objectiveFromText(text: string): string | null {
  return OBJECTIVE_WORDS.find(([re]) => re.test(text))?.[1] ?? null;
}

// ---------- A worked example the server has computed ----------
// For a topic in the question bank the worked example is not left to the model: the server generates
// a problem of the same kind (other numbers), with every intermediate value computed by the template
// that will later mark the student. The model explains it; it does not do the arithmetic.
export function referenceExampleNote(example: { question: string; steps: string[]; answer: string; rubric: string }): string {
  return `[CHECKED EXAMPLE] Use this as the worked example in @@example. The server computed it, so every value below is correct: keep each number exactly as given, don't add steps with numbers of your own, and don't swap it for another example. Your part is to explain, in the student's language, WHY each step is taken.
Problem: ${example.question}
Method: ${example.rubric}
Steps: ${example.steps.map((s, i) => `${i + 1}. ${s}`).join("  ")}
Result: ${example.answer}`;
}
export const USE_REFERENCE_REQUEST = `[USE THE CHECKED EXAMPLE] Your worked example did not use the checked example you were given, or changed its numbers. Send the reply again with that example in @@example, every number exactly as given, ending in its stated result. Everything else stays. Same language, same sections, same JSON format.`;

// "Give me a harder problem", "another one", "test me": a request for a problem, not a step of the current one.
export function asksForProblem(text: string): "practice" | "test" | null {
  const t = text.trim();
  if (!t || t.length > 90) return null;
  if (/\b(?:test|quiz) me\b|\binterroge[- ]moi\b|\bteste[- ]moi\b/i.test(t)) return "test";
  if (/\b(?:give|show|set|ask|send) me\b.{0,25}\b(?:problem|question|exercise|one)\b|\b(?:another|a harder|a new|one more|a similar|a different|more) (?:practice |difficult )?(?:problem|question|exercise|one|practice)\b|\bmore practice\b|\bun autre (?:probl[èe]me|exercice)\b|\b(?:probl[èe]me|exercice) plus difficile\b/i.test(t)) return "practice";
  return null;
}
