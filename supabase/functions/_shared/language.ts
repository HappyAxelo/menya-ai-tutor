// How Menya pitches its language: the learner's level, and how to write in each language at that level.
// Only the rules that apply to this learner are sent, so the prompt doesn't grow with every language.
export type TeachingLevel = "lower_secondary" | "upper_secondary" | "university_intro" | "university_advanced";
export const TEACHING_LEVELS: TeachingLevel[] = ["lower_secondary", "upper_secondary", "university_intro", "university_advanced"];

// Earlier versions of the app sent three levels; saved settings and old clients still can.
export function normalizeLevel(level: string | null | undefined): TeachingLevel | null {
  if (!level || level === "auto") return null;
  if (TEACHING_LEVELS.includes(level as TeachingLevel)) return level as TeachingLevel;
  return ({ secondary: "upper_secondary", undergraduate: "university_intro", postgraduate: "university_advanced" } as Record<string, TeachingLevel>)[level] ?? null;
}

export function levelFromProfile(education: string | null | undefined, year: number | null | undefined): TeachingLevel | null {
  if (education === "secondary") return year != null && year <= 3 ? "lower_secondary" : "upper_secondary";
  if (education === "university") return year != null && year >= 3 ? "university_advanced" : "university_intro";
  return null;
}

// What students say about themselves ("I'm in S2", "for my A-level exam", "je suis en 3e année de licence").
export function inferLevelFromText(text: string): TeachingLevel | null {
  const t = text.toLowerCase();
  if (/\b(s\s?[1-3]|senior\s?[1-3]|o[- ]?level|ordinary level|tronc commun|coll[eè]ge|lower secondary|primary school)\b/.test(t)) return "lower_secondary";
  if (/\b(s\s?[4-6]|senior\s?[4-6]|a[- ]?level|advanced level|lyc[ée]e|terminale|upper secondary|high school)\b/.test(t)) return "upper_secondary";
  if (/\b(master'?s|phd|doctora[lt]|postgraduate|final[- ]year|third[- ]year|fourth[- ]year|year [34] (of|at)|licence 3|\bl3\b)\b/.test(t)) return "university_advanced";
  if (/\b(university|undergraduate|first[- ]year|second[- ]year|licence|universit[ée]|kaminuza)\b/.test(t)) return "university_intro";
  return null;
}

const LEVEL_RULES: Record<TeachingLevel, string> = {
  lower_secondary: "Lower secondary. Everyday words, sentences under about 15 words, small whole numbers, 2-3 steps at a time, familiar examples (shopping, sharing food, a phone, a bicycle). Define every technical word. Pictures have few labelled parts. Questions: recognise, then apply once.",
  upper_secondary: "Upper secondary. Clear plain sentences under about 20 words, standard school notation, 3-4 steps. Name the correct term after the idea is clear. Examples from daily life and the syllabus. Questions: apply, then explain why.",
  university_intro: "First years of university. Standard terminology and notation, introduced with a sentence of meaning. Show where a formula comes from when that helps. Questions: apply to a new case and justify it.",
  university_advanced: "Advanced university. Formal notation, derivations and precise definitions are welcome; connect to theory and limits of validity. Stay clear and concrete. Questions: non-routine cases, reasoning and proof.",
};
export const UNKNOWN_LEVEL_RULE = "Level not known yet. Start accessible, like a clear upper-secondary explanation, and adjust from how the student writes and answers. Don't ask what level they are.";
export const levelRule = (level: TeachingLevel | null) => level ? LEVEL_RULES[level] : UNKNOWN_LEVEL_RULE;

const ENGLISH_RULES = `Accessible English: short sentences, familiar words, one main idea per paragraph, a concrete example before the abstract statement. Define an unfamiliar word when it first appears. Plain never means wrong or vague.`;
const FRENCH_RULES = `Français facile: des mots courants et des phrases courtes. Évite les tournures compliquées (subordonnées longues, passif, nominalisations). Donne d'abord un exemple, puis la définition. Introduis les mots scientifiques un par un, et explique chacun quand il arrive. Utilise la terminologie scolaire francophone correcte (dérivée, tension, intensité, réactifs). Écris un français naturel, jamais calqué sur l'anglais. Tutoie l'élève.
Trop difficile : "La photosynthèse constitue un processus biochimique par lequel les organismes chlorophylliens convertissent l'énergie lumineuse en énergie chimique."
Bien : "La photosynthèse permet aux plantes de fabriquer leur nourriture grâce à la lumière du soleil."`;
const FRENCH_ADVANCED_RULES = `Français clair : phrases nettes, terminologie universitaire francophone exacte, écrit naturellement et jamais calqué sur l'anglais.`;
const KINYARWANDA_RULES = `Kinyarwanda: explain the way a good Rwandan teacher speaks; never translate English sentence by sentence. Use examples from everyday life in Rwanda (isoko, amafaranga, urugendo, ubuhinzi). Keep the scientific and mathematical meaning exact.
Technical terms: use a Kinyarwanda term only if it is really in common use. Otherwise keep the usual term, written the way teachers do, and show the English or French term in brackets the first time. Never invent a Kinyarwanda word. If you are unsure of a translation, say what the thing is and does in plain Kinyarwanda and give the English or French name.`;
const SWAHILI_RULES = `Kiswahili: natural, simple sentences. Use the standard term where one exists; give the English term in brackets the first time. Never invent a term.`;

export function languageRule(language: string | null | undefined, level: TeachingLevel | null): string | null {
  if (language === "English") return ENGLISH_RULES;
  if (language === "French") return level === "university_advanced" ? FRENCH_ADVANCED_RULES : FRENCH_RULES;
  if (language === "Kinyarwanda") return KINYARWANDA_RULES;
  if (language === "Swahili") return SWAHILI_RULES;
  return null;
}

// How much simpler than usual to write in this conversation: raised when the student says they are lost.
export function plainnessRule(plainness: number): string | null {
  if (plainness <= 0) return null;
  return plainness === 1
    ? "This student found the language hard. Use shorter sentences and more common words than usual."
    : "This student is finding the language very hard. Very short sentences. Only common words. One idea at a time. Show one small example before any rule.";
}

// "explique en français facile", "in simple words", "mu magambo yoroshye".
export const wantsSimpleLanguage = (text: string) =>
  /fran[çc]ais facile|plus simple|simplement|mots simples|simple (words|english|terms|language)|easy (english|words)|easier words|like i'?m (five|\d+)|mu magambo yoroshye|mu buryo bworoshye|byoroshye|kwa urahisi/i.test(text);

// ---------- A rough measure of how hard a text is to read ----------
// A screening tool for tests and logs, not a judgement of quality: only fluent readers can judge that.
export interface Readability { words: number; sentences: number; averageSentence: number; longestSentence: number; longWordShare: number; longestParagraph: number }

function plainText(message: string): string {
  return message.replace(/```[\s\S]*?```/g, " ").replace(/`[^`]*`/g, " ").replace(/\$[^$\n]*\$/g, " ").replace(/^\s*@@\w+.*$/gm, " ")
    .replace(/^\s*\d+[.)]\s+/gm, "").replace(/[*_#>|]/g, " ");
}

export function readability(message: string): Readability {
  const text = plainText(message);
  const sentences = text.split(/(?<=[.!?…:])\s+|\n+/).map(s => s.trim()).filter(s => /\p{L}{2}/u.test(s));
  const countWords = (s: string) => (s.match(/[\p{L}'’-]+/gu) ?? []).length;
  const allWords = text.match(/[\p{L}'’-]+/gu) ?? [];
  const lengths = sentences.map(countWords);
  const paragraphs = text.split(/\n\s*\n/).map(countWords);
  return {
    words: allWords.length, sentences: sentences.length,
    averageSentence: lengths.length ? lengths.reduce((a, b) => a + b, 0) / lengths.length : 0,
    longestSentence: Math.max(0, ...lengths),
    longWordShare: allWords.length ? allWords.filter(w => [...w].length >= 12).length / allWords.length : 0,
    longestParagraph: Math.max(0, ...paragraphs),
  };
}

const LIMITS: Record<TeachingLevel | "unknown", { average: number; longest: number; longWords: number; paragraph: number }> = {
  lower_secondary: { average: 15, longest: 24, longWords: 0.1, paragraph: 55 },
  upper_secondary: { average: 19, longest: 30, longWords: 0.14, paragraph: 70 },
  unknown: { average: 19, longest: 30, longWords: 0.14, paragraph: 70 },
  university_intro: { average: 24, longest: 40, longWords: 0.22, paragraph: 110 },
  university_advanced: { average: 30, longest: 50, longWords: 0.3, paragraph: 150 },
};

// What looks too dense for this level. Kinyarwanda joins grammar onto words, so long words say nothing there.
export function densityProblems(message: string, level: TeachingLevel | null, language: string | null | undefined): string[] {
  const r = readability(message), limit = LIMITS[level ?? "unknown"], problems: string[] = [];
  if (r.averageSentence > limit.average) problems.push("sentences_long");
  if (r.longestSentence > limit.longest) problems.push("sentence_very_long");
  if (r.longestParagraph > limit.paragraph) problems.push("paragraph_dense");
  if ((language === "English" || language === "French") && r.longWordShare > limit.longWords) problems.push("words_hard");
  return problems;
}
