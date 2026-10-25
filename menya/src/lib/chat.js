// Pure helpers for the chat screen and the progress page (no React, so they
// can be tested with node --test; see menya/tests).

// What the learner sees for an action they took (in place of the app's
// bracketed instruction to the model).
export const ACTION_LABELS = {
  hint: "Asked for a hint",
  simpler: "Asked for a simpler explanation",
  example: "Asked for a worked example",
  check: "Check my answer",
  practice: "Asked for a similar practice question",
  summary: "Asked for a summary",
};

// Which follow-up actions make sense under the latest reply.
// problem: { solved, practice, attempts } from the server (or null in developer mode).
export function availableActions({ hasConversation, loading, hintsUsed, problem, assistantReplies, lastType }) {
  if (!hasConversation || loading || lastType === "error" || lastType === "limit") return [];
  const solved = Boolean(problem?.solved);
  const actions = [];
  if (!solved && hintsUsed < 3) actions.push({ id: "hint", label: "Give me a hint", detail: `${3 - hintsUsed} left` });
  if (!solved) actions.push({ id: "simpler", label: "Explain more simply" });
  if (!solved) actions.push({ id: "example", label: "Show a worked example" });
  actions.push({ id: "practice", label: solved ? "Try a similar question" : "Give me a similar question", primary: solved });
  if (assistantReplies >= 2) actions.push({ id: "summary", label: "Summarise what I learned" });
  return actions;
}

// Stored conversation rows -> messages for the chat screen.
// rows: [{ role, content, meta }] as saved by the server.
export function historyToMessages(rows) {
  return rows.map(r => {
    if (r.role === "user") {
      const control = r.meta?.control;
      if (!control) return { role: "user", content: r.content };
      return { role: "user", control, content: control === "check" ? String(r.meta.text ?? "") : ACTION_LABELS[control] ?? "Action" };
    }
    return {
      role: "assistant", content: r.content, type: r.meta?.type ?? "question", hintLevel: r.meta?.hintLevel ?? null,
      conceptsDetected: Array.isArray(r.meta?.concepts) ? r.meta.concepts : [],
      misconceptionDetected: r.meta?.misconception ?? null, progressSummary: r.meta?.summary ?? null,
      solved: r.meta?.solved === true,
    };
  });
}

// Learning events -> numbers for the progress page. Only server-verified solves
// exist as events, so nothing here is inferred from message counts.
export function summarizeProgress(events = []) {
  const topics = new Map();
  let independent = 0, withHelp = 0, practice = 0, practiceIndependent = 0;
  for (const e of events) {
    // Hints and worked examples both count as help.
    const helped = e.hints_used > 0 || e.examples_used > 0;
    if (helped) withHelp++; else independent++;
    if (e.kind === "practice_solved") { practice++; if (!helped) practiceIndependent++; }
    for (const raw of e.concepts ?? []) {
      const key = String(raw).trim().toLowerCase();
      if (!key) continue;
      const t = topics.get(key) ?? { name: String(raw).trim(), solved: 0, independent: 0, practiceIndependent: 0, last: null };
      t.solved++;
      if (!helped) t.independent++;
      if (!helped && e.kind === "practice_solved") t.practiceIndependent++;
      if (!t.last || e.created_at > t.last) t.last = e.created_at;
      topics.set(key, t);
    }
  }
  const topicList = [...topics.values()].sort((a, b) => b.practiceIndependent - a.practiceIndependent || b.solved - a.solved || a.name.localeCompare(b.name));
  return { solved: events.length, independent, withHelp, practice, practiceIndependent, topics: topicList };
}

// A topic counts as "shown" only after a practice question on it was solved without hints.
export function topicStatus(t) {
  if (t.practiceIndependent > 0) return "shown";
  if (t.independent > 0) return "solved";
  return "with_help";
}
