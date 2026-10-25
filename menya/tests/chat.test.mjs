import { test } from "node:test";
import assert from "node:assert/strict";
import { availableActions, historyToMessages, summarizeProgress, topicStatus } from "../src/lib/chat.js";

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
