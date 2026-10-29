// Uncertainty-aware mastery per learning objective.
// A Beta(alpha, beta) estimate of "solves this kind of problem correctly",
// updated with evidence weighted by how independent it was. Chat volume,
// conversation length and self-reported confidence never count.
// Provisional mastery needs: estimate >= 0.8, lower 90% bound >= 0.6, at
// least 2 independent successes on unseen problems, and at least one of them
// after a delay (retention). Later failures lower the estimate, so mastery
// can be lost again.

export interface ObjectiveRecord {
  objective_id: string;
  alpha: number;
  beta: number;
  independent_correct: number;   // VERIFY / REVIEW items solved without help
  guided_correct: number;        // solved with hints or examples
  incorrect: number;
  delayed_correct: number;       // independent successes >= 2 days after the previous success
  last_success_at: string | null;
  last_seen_at: string | null;
  next_review_at: string | null;
  review_streak: number;
  misconceptions: Record<string, number>;
  status: "learning" | "practising" | "mastered";
}

export interface Evidence {
  kind: "guided" | "practice" | "verify" | "review";
  verdict: "correct" | "incorrect";
  hintsUsed: number;
  unexplained: boolean;
  misconception: string | null;
  at: number;                    // ms timestamp
}

export const emptyRecord = (objectiveId: string): ObjectiveRecord => ({
  objective_id: objectiveId, alpha: 1, beta: 1, independent_correct: 0, guided_correct: 0, incorrect: 0, delayed_correct: 0,
  last_success_at: null, last_seen_at: null, next_review_at: null, review_streak: 0, misconceptions: {}, status: "learning",
});

const DAY = 864e5;
const REVIEW_DAYS = [1, 3, 7, 21, 60];

export function estimate(r: Pick<ObjectiveRecord, "alpha" | "beta">) {
  const n = r.alpha + r.beta, mean = r.alpha / n;
  const sd = Math.sqrt((r.alpha * r.beta) / (n * n * (n + 1)));
  return { mean, lower: Math.max(0, mean - 1.645 * sd) };
}

export function isMastered(r: ObjectiveRecord): boolean {
  const { mean, lower } = estimate(r);
  return mean >= 0.8 && lower >= 0.6 && r.independent_correct >= 2 && r.delayed_correct >= 1;
}

export function update(prev: ObjectiveRecord, e: Evidence): ObjectiveRecord {
  const r: ObjectiveRecord = { ...prev, misconceptions: { ...prev.misconceptions } };
  const independent = (e.kind === "verify" || e.kind === "review") && e.hintsUsed === 0;
  const delayed = independent && prev.last_success_at != null && e.at - Date.parse(prev.last_success_at) >= 2 * DAY;
  if (e.verdict === "correct") {
    // Weight: delayed independent 1.5, independent 1, practice 0.5, guided 0.3 (less per hint); a bare answer counts little.
    let w = independent ? (delayed ? 1.5 : 1) : e.kind === "practice" ? 0.5 : 0.3;
    w = Math.max(0.1, w - 0.1 * e.hintsUsed);
    if (e.unexplained) w = Math.min(w, 0.2);
    r.alpha += w;
    if (independent) r.independent_correct++; else r.guided_correct++;
    if (delayed) r.delayed_correct++;
    r.last_success_at = new Date(e.at).toISOString();
    r.review_streak = independent ? prev.review_streak + 1 : prev.review_streak;
    r.next_review_at = new Date(e.at + REVIEW_DAYS[Math.min(r.review_streak, REVIEW_DAYS.length - 1)] * DAY).toISOString();
  } else {
    r.beta += independent || e.kind === "verify" || e.kind === "review" ? 1 : 0.5;
    r.incorrect++;
    r.review_streak = 0;
    r.next_review_at = new Date(e.at + DAY).toISOString();
    if (e.misconception) r.misconceptions[e.misconception] = (r.misconceptions[e.misconception] ?? 0) + 1;
  }
  r.last_seen_at = new Date(e.at).toISOString();
  r.status = isMastered(r) ? "mastered" : r.independent_correct + r.guided_correct > 0 ? "practising" : "learning";
  return r;
}

// Which kind of evidence an attempt is.
export function evidenceKind(itemKind: "practice" | "verify" | "review" | null): Evidence["kind"] {
  return itemKind ?? "guided";
}
