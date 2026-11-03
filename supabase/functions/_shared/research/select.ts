// Does this question need research, how much, and from which services? No model call: rules only, so a
// homework question costs nothing and waits for nothing. Sent to outside services: search words only,
// never the conversation, and anything that looks personal is removed first.
export type ResearchTier = "none" | "auto" | "deep";
export type ResearchSubject = "biomedical" | "computing" | "physical_sciences" | "education" | "social_sciences" | "general";

export interface ResearchDecision { tier: ResearchTier; subject: ResearchSubject; recent: boolean; connectors: string[]; reason: string }

const DEEP = /\b(literature review|systematic review|meta-?analys[ie]s|research gaps?|state of the art|find (me )?(some |recent |relevant |academic )?(papers|articles|studies|sources|references)|compare (the |these |two )?(studies|papers|theories|findings)|revue de (la )?litt[ée]rature|isuzuma ry'ubushakashatsi)\b/i;
const ASKS_RESEARCH = /\b(what (does|do) (the )?(research|studies|evidence|literature) (say|show|suggest)|according to (the )?(research|studies|literature)|research (on|into|about|shows?|says?)|recent (research|studies|findings|developments|advances|work|papers)|latest (research|studies|findings|developments|advances|papers)|peer[- ]reviewed|academic (sources?|papers?|research|evidence)|evidence (for|on|that|about|of)|cite (sources|references|papers)|with (references|citations|sources)|effectiveness of|efficacy of|impact of .{3,60} on|que dit la recherche|articles? scientifiques?|[ée]tudes? r[ée]centes?|utafiti unasema|utafiti (kuhusu|juu ya)|ubushakashatsi)\b/i;
const APPLIED_AI = /\b(machine learning|deep learning|artificial intelligence|neural networks?)\b.{0,60}\b(predict\w*|detect\w*|diagnos\w*|forecast\w*|classif\w*)\b/i;
const RECENT = /\b(recent|latest|new(est)?|current|emerging|today|r[ée]cent(e|es|s)?|derni[èe]res?)\b/i;

const SUBJECTS: [ResearchSubject, RegExp][] = [
  ["biomedical", /\b(malaria|paludisme|maladies?|disease|diseases|outbreaks?|clinical|cancer|tumou?r|hiv|aids|tubercul\w+|vaccin\w+|patients?|medicine|medical|health|epidemi\w+|diabet\w+|infection\w*|drug|drugs|therapy|genom\w+|protein\w*|nutrition|maladie|sant[ée]|ubuzima|afya)\b/i],
  ["computing", /\b(machine learning|deep learning|neural|artificial intelligence|\bai\b|computer vision|quantum computing|nlp|natural language|algorithm\w*|software|cryptograph\w+|robot\w*|data mining|large language|llm|transformers?|cyber\w*|iot|internet of things)\b/i],
  ["physical_sciences", /\b(physics|quantum|semiconductor\w*|materials? science|chemistry|catalys\w+|astronom\w+|climate|renewable|solar|battery|batteries|engineering|mathematic\w+)\b/i],
  ["education", /\b(education\w*|teaching|learning outcomes?|pedagog\w+|spaced (practice|repetition)|retention|students?|tutoring|classroom|curricul\w+|ai in education|uburezi|elimu)\b/i],
  ["social_sciences", /\b(econom\w+|poverty|policy|gender|psycholog\w+|sociolog\w+|agricultur\w+|development studies)\b/i],
];
// Best first for each subject. An administrator's priority order breaks ties within a list.
const SOURCES: Record<ResearchSubject, string[]> = {
  biomedical: ["europe_pmc", "pubmed", "openalex", "semantic_scholar", "crossref", "doaj", "core"],
  computing: ["openalex", "arxiv", "semantic_scholar", "crossref", "doaj", "core"],
  physical_sciences: ["openalex", "arxiv", "semantic_scholar", "crossref", "doaj", "core"],
  education: ["openalex", "semantic_scholar", "doaj", "crossref", "core"],
  social_sciences: ["openalex", "semantic_scholar", "doaj", "crossref", "core"],
  general: ["openalex", "semantic_scholar", "crossref", "doaj", "core"],
};
const NUMBER_OF_SOURCES: Record<Exclude<ResearchTier, "none">, number> = { auto: 3, deep: 5 };

export const subjectOf = (text: string): ResearchSubject => (SUBJECTS.find(([, re]) => re.test(text))?.[0] ?? "general");

export function decideResearch(text: string, opts: { explicit?: boolean; isProblem?: boolean; enabled?: string[] } = {}): ResearchDecision {
  const none = (reason: string): ResearchDecision => ({ tier: "none", subject: "general", recent: false, connectors: [], reason });
  const t = (text ?? "").trim();
  if (!t) return none("no text");
  const deep = DEEP.test(t);
  const asks = deep || ASKS_RESEARCH.test(t) || APPLIED_AI.test(t);
  if (!opts.explicit && !asks) return none("established knowledge or an exercise: taught without searching");
  if (!opts.explicit && opts.isProblem) return none("a problem to work through, not a question about evidence");
  const tier: ResearchTier = deep || opts.explicit ? "deep" : "auto";
  const subject = subjectOf(t);
  const enabled = opts.enabled;
  const connectors = SOURCES[subject].filter(c => !enabled || enabled.includes(c)).slice(0, NUMBER_OF_SOURCES[tier]);
  return { tier, subject, recent: RECENT.test(t), connectors, reason: opts.explicit ? "the student asked for research" : deep ? "asks for a review of the literature" : "the question depends on published evidence" };
}

const STOP = new Set(("a an and are as at be been but by can could did do does explain for from give had has have help how i in into is it its me my of on or our please research say says show shows should so "
  + "some study studies tell than that the their them then there these they this to us was we were what when where which who why will with would you your about according academic article articles between compare "
  + "email name phone number address teacher friend classmate current developments evidence find findings latest literature new paper papers peer recent references review reviewed sources summarise summarize understand write").split(" "));

// Removes what could identify someone before words leave for an outside service.
export function scrubPersonal(text: string): string {
  return text.replace(/\S+@\S+\.\S+/g, " ").replace(/https?:\/\/\S+/g, " ").replace(/\+?\d[\d\s().-]{7,}\d/g, " ")
    .replace(/\b(my name is|i am|i'm|je m'appelle|nitwa|jina langu ni)\s+\p{L}+(\s+\p{L}+)?/giu, " ");
}

// Search words from a message in English. Other languages are put into English by the model (see tutorService).
export function keywordsFrom(text: string, max = 10): string {
  const words = scrubPersonal(text).toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) ?? [];
  const seen = new Set<string>();
  const kept = words.filter(w => w.length > 1 && !STOP.has(w) && !seen.has(w) && Boolean(seen.add(w)));
  return kept.slice(0, max).join(" ");
}
