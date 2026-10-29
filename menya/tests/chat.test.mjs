import { test } from "node:test";
import assert from "node:assert/strict";
import { availableActions, groupByDay, historyToMessages, summarizeProgress, topicStatus } from "../src/lib/chat.js";
import { migrateSettings } from "../src/settings.js";

const ids = (a) => a.map(x => x.id);

test("no actions before a conversation, while loading, or after an error or plan limit", () => {
  const base = { hasConversation: true, loading: false, hintsUsed: 0, problem: null, assistantReplies: 1, lastType: "question" };
  assert.deepEqual(availableActions({ ...base, hasConversation: false }), []);
  assert.deepEqual(availableActions({ ...base, loading: true }), []);
  assert.deepEqual(availableActions({ ...base, lastType: "error" }), []);
  assert.deepEqual(availableActions({ ...base, lastType: "limit" }), []);
});

test("an open problem offers hints, simpler, example and practice; summary after two replies", () => {
  const a = availableActions({ hasConversation: true, loading: false, hintsUsed: 1, problem: { solved: false }, assistantReplies: 2, lastType: "hint" });
  assert.deepEqual(ids(a), ["hint", "simpler", "example", "practice", "summary"]);
  assert.equal(a[0].detail, "2 left");
});

test("no hint button once all three are used", () => {
  const a = availableActions({ hasConversation: true, loading: false, hintsUsed: 3, problem: { solved: false }, assistantReplies: 1, lastType: "hint" });
  assert.equal(ids(a).includes("hint"), false);
});

test("a solved problem leads with a similar practice question", () => {
  const a = availableActions({ hasConversation: true, loading: false, hintsUsed: 0, problem: { solved: true }, assistantReplies: 3, lastType: "affirmation" });
  assert.deepEqual(ids(a), ["practice", "summary"]);
  assert.equal(a[0].primary, true);
});

test("stored history hides the app's instructions and keeps a checked answer", () => {
  const msgs = historyToMessages([
    { role: "user", content: "What is 12/4 A?", meta: {} },
    { role: "assistant", content: "What do you know?", meta: { type: "question", concepts: ["Ohm's law"] } },
    { role: "user", content: "[HINT REQUEST — Level 1 of 3] …", meta: { control: "hint", level: 1 } },
    { role: "user", content: "[CHECK MY ANSWER] … «3 A» …", meta: { control: "check", text: "3 A" } },
    { role: "assistant", content: "Yes.", meta: { type: "affirmation", solved: true, summary: "I = V/R" } },
  ]);
  assert.equal(msgs[2].content, "Asked for a hint");
  assert.equal(msgs[3].content, "3 A");
  assert.equal(msgs.some(m => m.content.includes("[")), false);
  assert.equal(msgs[4].solved, true);
  assert.equal(msgs[4].progressSummary, "I = V/R");
});

test("progress comes only from verified solves and separates help from independent work", () => {
  const p = summarizeProgress([
    { kind: "problem_solved", concepts: ["Ohm's law"], hints_used: 2, created_at: "2026-10-20" },
    { kind: "practice_solved", concepts: ["ohm's law "], hints_used: 0, created_at: "2026-10-21" },
    { kind: "problem_solved", concepts: ["Derivatives"], hints_used: 0, created_at: "2026-10-22" },
  ]);
  assert.equal(p.solved, 3);
  assert.equal(p.withHelp, 1);
  assert.equal(p.independent, 2);
  assert.equal(p.practiceIndependent, 1);
  assert.equal(p.topics.length, 2, "concept names are merged case-insensitively");
  assert.equal(topicStatus(p.topics[0]), "shown");
  assert.equal(p.topics[0].name, "Ohm's law");
  assert.equal(topicStatus(p.topics[1]), "solved");
  const ex = summarizeProgress([{ kind: "practice_solved", concepts: ["x"], hints_used: 0, examples_used: 1, created_at: "2026-10-23" }]);
  assert.equal(ex.practiceIndependent, 0, "a worked example counts as help");
  assert.equal(topicStatus(ex.topics[0]), "with_help");
  assert.deepEqual(summarizeProgress([]), { solved: 0, independent: 0, withHelp: 0, practice: 0, practiceIndependent: 0, topics: [] });
});

test("history groups conversations by day, newest first", () => {
  const now = new Date(2026, 9, 25, 15, 0);
  const at = (d, h = 10) => new Date(2026, 9, d, h).toISOString();
  const g = groupByDay([{ id: 1, updated_at: at(25) }, { id: 2, updated_at: at(25, 8) }, { id: 3, updated_at: at(24) },
    { id: 4, updated_at: at(20) }, { id: 5, updated_at: at(2) }], now);
  assert.deepEqual(g.map(([l, items]) => [l, items.map(s => s.id)]),
    [["Today", [1, 2]], ["Yesterday", [3]], ["Previous 7 days", [4]], ["Older", [5]]]);
  assert.deepEqual(groupByDay([], now), []);
});

test("settings: the old English default becomes 'match my language'; a later choice is kept", () => {
  assert.equal(migrateSettings(null).language, "auto", "new users match their language");
  assert.equal(migrateSettings({ language: "English", theme: "dark" }).language, "auto", "old default moves to auto");
  assert.equal(migrateSettings({ language: "English", theme: "dark" }).theme, "dark", "other settings kept");
  assert.equal(migrateSettings({ language: "French" }).language, "French", "a real choice is kept");
  assert.equal(migrateSettings({ language: "English", v: 2 }).language, "English", "English picked after the update is kept");
});

test("the browser tab shows the first question, shortened; nothing before a conversation", async () => {
  const { tabTitle } = await import("../src/lib/chat.js");
  assert.equal(tabTitle([]), null);
  assert.equal(tabTitle([{ role: "user", control: "hint", content: "Hint" }]), null);
  assert.equal(tabTitle([{ role: "user", content: "What is **entropy**?\n" }, { role: "assistant", content: "…" }]), "What is entropy?");
  const long = tabTitle([{ role: "user", content: "A ball is thrown straight up at 20 m/s. Taking g = 10 m/s², how high does it go before falling?" }]);
  assert.ok(long.length <= 61 && long.endsWith("…") && !long.includes("  "), long);
});

test("with the tutoring engine: 'I'm stuck' menu, 'Check yourself' after solving, no hints on an independent check", () => {
  const ids = (a) => a.map(x => x.id);
  const base = { hasConversation: true, loading: false, hintsUsed: 0, assistantReplies: 1, lastType: "question" };
  const open = availableActions({ ...base, problem: { solved: false }, engine: { objective: { id: "ee.ohms_law" }, item: null } });
  assert.deepEqual(ids(open), ["hint", "stuck", "simpler", "example", "practice"]);
  assert.deepEqual(open.find(a => a.id === "stuck").menu, ["start", "step", "mistake", "concept"]);
  const solved = availableActions({ ...base, problem: { solved: true }, engine: { objective: { id: "ee.ohms_law" } } });
  assert.equal(solved[0].id, "verify");
  assert.equal(solved[0].primary, true);
  const independent = availableActions({ ...base, problem: { solved: false }, engine: { objective: { id: "ee.ohms_law" }, item: { kind: "verify" } } });
  assert.deepEqual(ids(independent), ["stuck", "practice"]);
});
