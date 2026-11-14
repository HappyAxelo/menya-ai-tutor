// The learning companion: knowledge map, weekly progress, study plan and mock exams.
// Pure functions over the learner's verified data (mastery records and attempts);
// nothing here calls a model, so every number shown to a learner can be traced
// back to answers the server marked itself.
import { OBJECTIVES, TEMPLATES, generateItem, markItem, misconceptionText, objective, questionKey, workingFound, type Item } from "./engine/bank.ts";
import { estimate, isMastered, nextEvidence, stageOf, supportLevel, type ObjectiveRecord, type Stage } from "./engine/mastery.ts";
import { formulaCard, type FormulaCard } from "./engine/formulas.ts";

const DAY = 864e5;

export interface Attempt { objective: string; kind: "guided" | "practice" | "verify" | "review"; verdict: "correct" | "incorrect"; hints: number; at: string }
export interface Exam { id: number; title: string; exam_date: string; objectives: string[] }
export interface Profile {
  education_level: string | null; year_of_study: number | null; institution: string | null; programme: string | null;
  curriculum: string | null; subjects: string[]; goals: string | null; study_minutes: number[];
}
export interface LearningState { profile: Profile | null; exams: Exam[]; objectives: ObjectiveRecord[]; attempts: Attempt[]; retries?: number }

// ---------------- Knowledge map ----------------
// Levels are deliberately cautious: one answer never makes a topic "strong" or "needs work".
export type Level = "not_assessed" | "started" | "needs_work" | "developing" | "strong";

export function levelOf(r: ObjectiveRecord | undefined): Level {
  if (!r) return "not_assessed";
  if (isMastered(r)) return "strong";
  const evidence = r.independent_correct + r.guided_correct + r.incorrect;
  if (evidence < 2) return "started";
  return estimate(r).mean < 0.5 ? "needs_work" : "developing";
}

export interface MapEntry {
  objective: string; title: string; level: Level; estimate: number | null; independent: number;
  misconceptions: string[]; nextReview: string | null; due: boolean;
  stage: Stage;                 // exposure → understanding → application → retention → mastery
  next: string;                 // the evidence the next stage needs
  support: 1 | 2 | 3;           // strong guidance · guided independence · independent mastery, for this topic only
  prerequisites: string[];
}

export function knowledgeMap(records: ObjectiveRecord[], now: number): { subject: string; topics: MapEntry[] }[] {
  const byId = new Map(records.map(r => [r.objective_id, r]));
  const subjects: { subject: string; topics: MapEntry[] }[] = [];
  for (const o of OBJECTIVES) {
    const r = byId.get(o.id);
    let group = subjects.find(s => s.subject === o.subject);
    if (!group) subjects.push(group = { subject: o.subject, topics: [] });
    group.topics.push({
      objective: o.id, title: o.title, level: levelOf(r), estimate: r ? Math.round(estimate(r).mean * 100) / 100 : null,
      independent: r?.independent_correct ?? 0, misconceptions: Object.keys(r?.misconceptions ?? {}),
      nextReview: r?.next_review_at ?? null, due: Boolean(r?.next_review_at && Date.parse(r.next_review_at) <= now),
      stage: stageOf(r), next: nextEvidence(r), support: supportLevel(r), prerequisites: o.prerequisites,
    });
  }
  return subjects;
}

// ---------------- Progress: independent, verified work only ----------------
export function weeklyProgress(attempts: Attempt[], now: number) {
  const independent = (a: Attempt) => (a.kind === "verify" || a.kind === "review") && a.hints === 0;
  const window = (from: number, to: number) => attempts.filter(a => { const t = Date.parse(a.at); return t >= from && t < to; });
  const summary = (xs: Attempt[]) => {
    const ind = xs.filter(independent);
    return { verified: xs.length, independentCorrect: ind.filter(a => a.verdict === "correct").length, independentTotal: ind.length,
             topics: new Set(xs.map(a => a.objective)).size };
  };
  const thisWeek = summary(window(now - 7 * DAY, now + 1));
  const lastWeek = summary(window(now - 14 * DAY, now - 7 * DAY));
  const rate = (s: ReturnType<typeof summary>) => (s.independentTotal ? s.independentCorrect / s.independentTotal : null);
  const a = rate(thisWeek), b = rate(lastWeek);
  // "Improving" needs enough independent answers in both weeks to mean anything.
  const trend = thisWeek.independentTotal >= 3 && lastWeek.independentTotal >= 3 && a != null && b != null
    ? (a - b >= 0.15 ? "up" : b - a >= 0.15 ? "down" : "steady") : "not_enough_data";
  return { thisWeek, lastWeek, trend };
}

// ---------------- Study plan ----------------
export type Activity = "review" | "learn" | "practise" | "check" | "mock";
export interface PlanItem { date: string; activity: Activity; objective: string | null; examId: number | null; minutes: number; reason: string; done: boolean }

const MINUTES: Record<Activity, number> = { review: 10, learn: 25, practise: 20, check: 10, mock: 30 };
const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);
// Monday = 0 … Sunday = 6
const weekday = (t: number) => (new Date(t).getUTCDay() + 6) % 7;

// The plan is recomputed from the current state every time it is shown, so missed days and
// poor results reshape it automatically (nothing to "catch up" on, no streaks).
export function studyPlan(state: LearningState, now: number, days = 7): PlanItem[] {
  const minutes = state.profile?.study_minutes?.length === 7 ? state.profile.study_minutes : [30, 30, 30, 30, 30, 0, 0];
  const records = new Map(state.objectives.map(r => [r.objective_id, r]));
  const doneToday = new Set(state.attempts.filter(a => isoDay(Date.parse(a.at)) === isoDay(now)).map(a => a.objective));
  const today = Date.parse(isoDay(now));
  const exams = state.exams.filter(e => Date.parse(e.exam_date) >= today);
  // Topics that matter: anything started, plus every topic of an upcoming exam.
  const relevant = new Set<string>([...records.keys(), ...exams.flatMap(e => e.objectives)].filter(id => objective(id)));
  // Simulated next-review dates, so one topic isn't planned every day.
  const nextDue = new Map<string, number>([...relevant].map(id => [id, records.get(id)?.next_review_at ? Date.parse(records.get(id)!.next_review_at!) : Infinity]));
  const lastPlanned = new Map<string, number>();
  // What the plan already scheduled for a topic: the next session builds on it (learn → practise → check).
  const plannedStage = new Map<string, Activity>();
  const NEXT_STAGE: Partial<Record<Activity, Activity>> = { learn: "practise", practise: "check" };
  // Mock exams on the last study day before an exam, and on a study day at least two days before that.
  const studyDay = (t: number) => minutes[weekday(t)] > 0;
  const mockDays = new Map<number, Set<string>>();
  for (const e of exams) {
    if (e.objectives.filter(id => objective(id)).length < 2) continue;
    const examDay = Date.parse(e.exam_date);
    let last: number | null = null;
    for (let t = examDay - DAY; t >= today; t -= DAY) if (studyDay(t)) { last = t; break; }
    if (last == null) continue;
    const days = new Set([isoDay(last)]);
    for (let t = last - 2 * DAY; t >= today; t -= DAY) if (studyDay(t)) { days.add(isoDay(t)); break; }
    mockDays.set(e.id, days);
  }
  const plan: PlanItem[] = [];

  for (let d = 0; d < days; d++) {
    const day = today + d * DAY, date = isoDay(day);
    let budget = minutes[weekday(day)];
    if (budget <= 0) continue;
    const dayItems: PlanItem[] = [];
    const add = (activity: Activity, objectiveId: string | null, reason: string, examId: number | null = null, minutesFor = MINUTES[activity]) => {
      const m = minutesFor;
      if (m > budget && dayItems.length > 0) return false;
      budget -= m;
      dayItems.push({ date, activity, objective: objectiveId, examId, minutes: m, reason,
                      done: d === 0 && objectiveId != null && doneToday.has(objectiveId) });
      if (objectiveId) {
        lastPlanned.set(objectiveId, day); plannedStage.set(objectiveId, activity);
        nextDue.set(objectiveId, day + (activity === "review" ? 3 : 2) * DAY);
      }
      return true;
    };

    // 2. Scored candidates: due reviews first, then exam topics by urgency, then weak topics.
    const scored = [...relevant].map(id => {
      const r = records.get(id), level = levelOf(r);
      const exam = exams.filter(e => e.objectives.includes(id)).sort((a, b) => a.exam_date.localeCompare(b.exam_date))[0];
      const daysToExam = exam ? Math.max(0, (Date.parse(exam.exam_date) - day) / DAY) : null;
      let score = 0, activity: Activity, reason: string;
      if (nextDue.get(id)! <= day && r) { score += 100; activity = "review"; reason = "due_review"; }
      else if (level === "not_assessed" || level === "started") { activity = "learn"; reason = level === "not_assessed" ? "not_started" : "just_started"; }
      else if (level === "needs_work") { score += 40; activity = "practise"; reason = "needs_work"; }
      else if (level === "developing") { score += 20; activity = (r?.independent_correct ?? 0) < 2 ? "check" : "practise"; reason = "developing"; }
      else { activity = "review"; reason = "keep_strong"; score -= 50; }
      const stage = plannedStage.get(id);
      if (stage && activity !== "review" && NEXT_STAGE[stage]) activity = NEXT_STAGE[stage]!;
      if (daysToExam != null && level !== "strong") score += 60 - Math.min(daysToExam, 30) * 2;
      if (lastPlanned.get(id) === day - DAY) score -= 30;           // spacing: not the same topic two days running
      return { id, score, activity, reason, examId: exam?.id ?? null };
    }).filter(c => c.score > -40).sort((a, b) => b.score - a.score);
    // 3. Due reviews first (short, and forgetting is the risk), then a mock exam sized to the time
    //    left (3 minutes a question, at least 15 minutes), then the rest, alternating subjects.
    let lastSubject: string | null = null;
    for (const c of scored.filter(c => c.reason === "due_review")) {
      if (budget < MINUTES.review) break;
      if (add(c.activity, c.id, c.reason, c.examId)) { lastSubject = objective(c.id)!.subject; scored.splice(scored.indexOf(c), 1); }
    }
    for (const e of exams) {
      if (mockDays.get(e.id)?.has(date) && budget >= 15) add("mock", null, `exam:${e.title}`, e.id, Math.min(MINUTES.mock, budget));
    }
    while (scored.length && budget >= 10) {
      let i = scored.findIndex(c => objective(c.id)!.subject !== lastSubject);
      if (i < 0) i = 0;
      const c = scored.splice(i, 1)[0];
      if (add(c.activity, c.id, c.reason, c.examId)) lastSubject = objective(c.id)!.subject;
    }
    plan.push(...dayItems);
  }
  return plan;
}

// ---------------- Today ----------------
export function todaySummary(state: LearningState, now: number) {
  const map = knowledgeMap(state.objectives, now);
  const topics = map.flatMap(s => s.topics.map(t => ({ ...t, subject: s.subject })));
  const today = Date.parse(isoDay(now));
  const nextExam = state.exams.filter(e => Date.parse(e.exam_date) >= today)[0] ?? null;
  return {
    plan: studyPlan(state, now, 1),
    due: topics.filter(t => t.due).map(t => t.objective),
    struggling: topics.filter(t => t.level === "needs_work" || t.misconceptions.length > 0).map(t => ({ objective: t.objective, misconceptions: t.misconceptions })),
    strong: topics.filter(t => t.level === "strong").map(t => t.objective),
    nextExam: nextExam ? { ...nextExam, daysLeft: Math.round((Date.parse(nextExam.exam_date) - today) / DAY) } : null,
    progress: weeklyProgress(state.attempts, now),
    hasProfile: Boolean(state.profile?.education_level),
    retries: state.retries ?? 0,                    // questions answered wrong earlier, waiting to be tried again
  };
}

// ---------------- Mock exams (verified bank only) ----------------
// retry: a question the learner got wrong before, brought back (practice evidence, not independent).
export interface ExamItem { n: number; objective: string; templateId: string; question: string; answer: string; seed: number; retry?: boolean }

// Topics are interleaved (round robin) so the learner must recognise which method each question needs.
export function buildMockExam(objectiveIds: string[], count: number, random: () => number, isFresh: (item: Item) => boolean = () => true): ExamItem[] {
  const ids = [...new Set(objectiveIds)].filter(id => generateItem(id, 1));
  if (!ids.length) return [];
  const items: ExamItem[] = [], seen = new Set<number>();
  // Round robin over topics; a topic that has run out of distinct questions is skipped.
  for (let n = 0, idle = 0; items.length < count && idle < ids.length; n++) {
    const id = ids[n % ids.length];
    let added = false;
    for (let tryNo = 0; tryNo < 30 && !added; tryNo++) {
      const item = generateItem(id, Math.floor(random() * 2 ** 31))!;
      const key = questionKey(item.question);
      // Prefer questions the learner hasn't seen; then accept any not already in this exam.
      if (seen.has(key) || (tryNo < 15 && !isFresh(item))) continue;
      seen.add(key);
      items.push({ n: items.length + 1, objective: id, templateId: item.templateId, question: item.question, answer: item.answer, seed: item.seed });
      added = true;
    }
    idle = added ? 0 : idle + 1;
  }
  return items;
}

export type ExamVerdict = "correct" | "incorrect" | "unanswered";
export interface ExamResultItem {
  n: number; objective: string; question: string; given: string; verdict: ExamVerdict;
  correctAnswer: string; misconception: string | null; misconceptionId: string | null; seconds: number | null;
  marks: number;                // marks available: harder questions carry more
  awarded: number;              // full marks for a correct answer; method marks for correct working with a wrong answer
  method: { found: number; total: number } | null;   // intermediate results found in the working (null: this question has none to look for)
}

// Marks per question follow its difficulty (2, 3 or 4). A wrong final answer can still earn up to
// marks − 1 for working: each intermediate result of the reference solution that appears in what the
// student wrote counts. Only numbers are recognised, so written reasoning without them earns nothing.
export function awardMarks(item: Item, given: string, correct: boolean): { marks: number; awarded: number; method: { found: number; total: number } | null } {
  const marks = item.difficulty + 1;
  const w = workingFound(item, given);
  const method = w.total ? w : null;
  if (correct) return { marks, awarded: marks, method };
  if (!given || !method) return { marks, awarded: 0, method };
  return { marks, awarded: Math.min(marks - 1, Math.floor(((marks - 1) * w.found) / w.total)), method };
}

export function markMockExam(items: ExamItem[], answers: Record<string, string>, seconds: Record<string, number> = {}) {
  const results: ExamResultItem[] = items.map(it => {
    const given = String(answers[it.n] ?? "").slice(0, 2000).trim();
    const stored: Item = { ...generateItem(it.objective, it.seed)!, question: it.question, answer: it.answer, templateId: it.templateId };
    let verdict: ExamVerdict = "unanswered", mis: string | null = null, misId: string | null = null;
    if (given) {
      const m = markItem(stored, given);
      verdict = m.verdict === "correct" ? "correct" : "incorrect";     // unreadable counts as incorrect
      misId = m.misconception;
      mis = misconceptionText(stored, m.misconception);
    }
    const s = Number(seconds[it.n]);
    const credit = awardMarks(stored, given, verdict === "correct");
    return { ...credit, n: it.n, objective: it.objective, question: it.question, given, verdict, correctAnswer: it.answer,
             misconception: mis, misconceptionId: misId, seconds: Number.isFinite(s) && s >= 0 ? Math.round(Math.min(s, 14400)) : null };
  });
  const byObjective = [...new Set(items.map(i => i.objective))].map(id => {
    const rs = results.filter(r => r.objective === id);
    const correct = rs.filter(r => r.verdict === "correct").length;
    return { objective: id, correct, total: rs.length, revise: correct < rs.length,
             marks: rs.reduce((n, r) => n + r.marks, 0), awarded: rs.reduce((n, r) => n + r.awarded, 0),
             misconceptions: [...new Set(rs.map(r => r.misconception).filter(Boolean))] as string[] };
  });
  const correct = results.filter(r => r.verdict === "correct").length;
  return { results, byObjective, score: { correct, total: items.length,
    unanswered: results.filter(r => r.verdict === "unanswered").length,
    marks: results.reduce((n, r) => n + r.marks, 0), awarded: results.reduce((n, r) => n + r.awarded, 0) } };
}

// ---------------- Review Today ----------------
// Questions answered wrong earlier (the same question again) followed by new questions on every
// topic due for review, interleaved by topic. Retried questions come first so the learner sees
// they can now do what they couldn't.
export function buildReviewSet(retries: { objective_id: string; template_id: string; seed: number }[], dueObjectives: string[],
                               random: () => number, isFresh: (item: Item) => boolean, maxNew = 5): ExamItem[] {
  const items: ExamItem[] = [];
  const seen = new Set<number>();
  for (const r of retries.slice(0, 3)) {
    const item = generateItem(r.objective_id, r.seed);
    if (!item || item.templateId !== r.template_id) continue;     // the template changed since: skip
    const key = questionKey(item.question);
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ n: items.length + 1, objective: r.objective_id, templateId: item.templateId, question: item.question,
                 answer: item.answer, seed: item.seed, retry: true });
  }
  const fresh = buildMockExam(dueObjectives.slice(0, maxNew), Math.min(maxNew, dueObjectives.length), random,
                              item => isFresh(item) && !seen.has(questionKey(item.question)));
  for (const f of fresh) items.push({ ...f, n: items.length + 1 });
  return items;
}

// ---------------- Prerequisite diagnostic ----------------
// Before a topic is taught: one unseen question on each thing it depends on (earliest first), then
// the topic itself. Two to five questions, untimed. The first one missed is where teaching starts.
export function prerequisiteChain(objectiveId: string): string[] {
  const out: string[] = [];
  const visit = (id: string) => {
    for (const p of objective(id)?.prerequisites ?? []) if (!out.includes(p)) { visit(p); if (!out.includes(p)) out.push(p); }
  };
  visit(objectiveId);
  return out;
}

export function buildDiagnostic(objectiveId: string, random: () => number, isFresh: (item: Item) => boolean = () => true): ExamItem[] {
  if (!objective(objectiveId)) return [];
  const chain = prerequisiteChain(objectiveId).slice(-4);
  // With nothing to depend on, two questions on the topic itself still show where the learner stands.
  const ids = chain.length ? [...chain, objectiveId] : [objectiveId, objectiveId];
  const items: ExamItem[] = [], seen = new Set<number>();
  for (const id of ids) {
    for (let tryNo = 0; tryNo < 30; tryNo++) {
      const item = generateItem(id, Math.floor(random() * 2 ** 31));
      if (!item) break;
      const key = questionKey(item.question);
      if (seen.has(key) || (tryNo < 15 && !isFresh(item))) continue;
      seen.add(key);
      items.push({ n: items.length + 1, objective: id, templateId: item.templateId, question: item.question, answer: item.answer, seed: item.seed });
      break;
    }
  }
  return items;
}

// Where to start after a diagnostic: the earliest topic in the chain with a question missed.
export function diagnosticAdvice(target: string, results: ExamResultItem[]): { target: string; startAt: string | null; secure: string[] } {
  const order = [...prerequisiteChain(target), target];
  const missed = new Set(results.filter(r => r.verdict !== "correct").map(r => r.objective));
  const tested = new Set(results.map(r => r.objective));
  return { target, startAt: order.find(id => missed.has(id)) ?? null, secure: order.filter(id => tested.has(id) && !missed.has(id)) };
}

// ---------------- Exam readiness ----------------
// A statement of evidence per topic, never a percentage and never a prediction of the mark.
export type ReadinessState = "secure" | "forgetting" | "not_yet_retained" | "guided_only" | "weak" | "not_tested";
export interface TopicReadiness {
  objective: string; title: string; stage: Stage; state: ReadinessState;
  independent: number; incorrect: number; misconceptions: string[];
}
const misconceptionTexts = (objectiveId: string, ids: string[]) =>
  ids.map(id => TEMPLATES.filter(t => t.objective === objectiveId).map(t => t.misconceptions[id]).find(Boolean) ?? id.replace(/_/g, " "));

export function topicReadiness(objectiveId: string, r: ObjectiveRecord | undefined, now: number): TopicReadiness {
  const stage = stageOf(r), mean = r ? estimate(r).mean : 0;
  const overdue = Boolean(r?.next_review_at && now - Date.parse(r.next_review_at) > 7 * DAY);
  let state: ReadinessState;
  if (!r || stage === "not_started") state = "not_tested";
  else if (mean < 0.5 && r.incorrect >= 2) state = "weak";
  else if (stage === "exposure") state = r.incorrect ? "weak" : "not_tested";
  else if (stage === "understanding") state = "guided_only";
  else if (stage === "application") state = "not_yet_retained";
  else state = overdue ? "forgetting" : "secure";
  return { objective: objectiveId, title: objective(objectiveId)?.title ?? objectiveId, stage, state,
           independent: r?.independent_correct ?? 0, incorrect: r?.incorrect ?? 0,
           misconceptions: misconceptionTexts(objectiveId, Object.keys(r?.misconceptions ?? {})) };
}

export function examReadiness(objectiveIds: string[], records: ObjectiveRecord[], now: number) {
  const byId = new Map(records.map(r => [r.objective_id, r]));
  const topics = objectiveIds.filter(id => objective(id)).map(id => topicReadiness(id, byId.get(id), now));
  const order: ReadinessState[] = ["weak", "guided_only", "not_tested", "forgetting", "not_yet_retained", "secure"];
  // What to work on first: the weakest evidence, not the newest topic.
  const priorities = [...topics].filter(t => t.state !== "secure").sort((a, b) => order.indexOf(a.state) - order.indexOf(b.state)).slice(0, 3).map(t => t.objective);
  return { topics, secure: topics.filter(t => t.state === "secure").length, total: topics.length, priorities };
}

// ---------------- Revision notebook ----------------
// One page per topic the learner has met: the formula card, the stage reached, the mistakes the
// server has seen them make, and when the topic is next due. Built from marked answers only.
export interface NotebookEntry {
  objective: string; title: string; subject: string; stage: Stage; next: string; card: FormulaCard | null;
  mistakes: { text: string; times: number }[]; due: boolean; nextReview: string | null; lastSeen: string | null;
  forgotten: boolean;           // answered right before, then wrong again: worth revisiting sooner
}

export function notebook(state: LearningState, now: number): NotebookEntry[] {
  const records = new Map(state.objectives.map(r => [r.objective_id, r]));
  const wanted = new Set<string>([...records.keys(), ...state.exams.flatMap(e => e.objectives)]);
  return OBJECTIVES.filter(o => wanted.has(o.id)).map(o => {
    const r = records.get(o.id);
    const ids = Object.keys(r?.misconceptions ?? {});
    const texts = misconceptionTexts(o.id, ids);
    return {
      objective: o.id, title: o.title, subject: o.subject, stage: stageOf(r), next: nextEvidence(r), card: formulaCard(o.id),
      mistakes: ids.map((id, i) => ({ text: texts[i], times: Number(r!.misconceptions[id]) })).sort((a, b) => b.times - a.times),
      due: Boolean(r?.next_review_at && Date.parse(r.next_review_at) <= now), nextReview: r?.next_review_at ?? null, lastSeen: r?.last_seen_at ?? null,
      forgotten: Boolean(r && r.review_streak === 0 && r.incorrect > 0 && r.independent_correct + r.guided_correct > 0),
    };
  });
}
