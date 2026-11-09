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
  idea: "@@idea — A familiar comparison from daily life first, then a one-sentence definition. Two to four short sentences. At most one new technical word, explained where it appears.",
  see: "@@see — Explain the picture: what the student is looking at, how the parts connect, the one thing to notice, and how that answers their question. Two to four short sentences that still make sense if the picture can't be shown. Name the parts in words.",
  example: "@@example — A worked example with DIFFERENT numbers or a different case from the student's own problem. Write it as a numbered list: 1. what we know and what we need; then each step with the reason for it; last step: how to check the result.",
  try: "@@try — Exactly ONE question, the only question in the reply. It tests the one thing just taught, can be answered from what was just shown, and needs nothing new. Ask for recognition first; application once they have shown recognition. For a problem of their own, ask them to do its first step, not the whole thing.",
  feedback: "@@feedback — About the student's last answer, respectfully: what was right, then the missing or wrong idea. Short.",
  check: "@@check — One short independent exercise on a different case, to do without help.",
};

export function shapeNote(s: LessonShape, picture: { offered: boolean; tablesOnly: boolean }): string {
  if (s.format === "plain" || (!s.sections.length && s.format !== "brief")) return "";
  if (s.format === "brief") return "Format: a short direct answer. No sections, no lesson, no follow-up question unless one is really useful.";
  const sections = s.sections.filter(id => id !== "see" || picture.offered);
  const lines = [`Format: write the message in these sections, in this order, each starting on its own line with its marker exactly as shown, nothing before the first marker. Keep it short: students read this on a phone.`];
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
