import { test } from "node:test";
import assert from "node:assert/strict";
import { migrateSettings, DEFAULT_SETTINGS } from "../src/settings.js";
import { LOCALES } from "../src/locales.js";
import { historyToMessages } from "../src/lib/chat.js";

test("nobody is assumed to be a university student any more", () => {
  assert.equal(DEFAULT_SETTINGS.level, "auto");
  assert.equal(migrateSettings({ v: 2, level: "undergraduate" }).level, "auto");
  assert.equal(migrateSettings({ v: 2, level: "secondary" }).level, "upper_secondary");
  assert.equal(migrateSettings({ v: 2, level: "postgraduate" }).level, "university_advanced");
  assert.equal(migrateSettings({ v: 3, level: "lower_secondary" }).level, "lower_secondary");
  assert.equal(migrateSettings({ v: 3, level: "university_intro" }).level, "university_intro", "a choice made after the update is kept");
});

test("every lesson heading and new action is written in every interface language", () => {
  const keys = ["lesson.idea", "lesson.see", "lesson.example", "lesson.try", "lesson.feedback", "lesson.check", "next.another", "next.smaller", "next.similar", "next.test", "next.more", "visual.expand", "visual.describe"];
  for (const lang of Object.keys(LOCALES)) for (const k of keys) assert.ok(LOCALES[lang][k], `${lang}: ${k}`);
});

test("a saved lesson comes back with its visual, its table and its stepped frames", () => {
  const diagram = { svg: "<svg/>", alt: "a", kind: "graph", title: "t", table: null, frames: [{ svg: "<svg/>", label: "a = 1" }] };
  const [m] = historyToMessages([{ role: "assistant", content: "@@idea\nHello", meta: { type: "explanation", diagram } }]);
  assert.deepEqual(m.diagram, diagram);
});
