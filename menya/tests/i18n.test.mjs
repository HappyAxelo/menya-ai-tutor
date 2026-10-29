import { test } from "node:test";
import assert from "node:assert/strict";
import { LOCALES } from "../src/locales.js";
import { uiLanguage, translate, greetingKey, greeting } from "../src/i18n.js";
import { availableActions } from "../src/lib/chat.js";

test("a chosen language sets the interface language", () => {
  assert.equal(uiLanguage("Kinyarwanda", "French", "en-US"), "rw");
  assert.equal(uiLanguage("French", null, "en"), "fr");
  assert.equal(uiLanguage("Swahili", null, ""), "sw");
  // A reply language without a full translation keeps the English interface.
  assert.equal(uiLanguage("Arabic", null, "fr"), "en");
});

test("'Match my language' follows the conversation, then the device", () => {
  assert.equal(uiLanguage("auto", "Kinyarwanda", "en-GB"), "rw");
  assert.equal(uiLanguage("auto", null, "fr-FR"), "fr");
  assert.equal(uiLanguage("auto", null, "rw"), "rw");
  assert.equal(uiLanguage("auto", null, "de-DE"), "en");
  assert.equal(uiLanguage("auto", "Arabic", "sw-KE"), "sw");
});

test("the greeting changes with the time of day", () => {
  assert.deepEqual([5, 11, 12, 16, 17, 21, 22, 0, 4].map(greetingKey),
    ["morning", "morning", "afternoon", "afternoon", "evening", "evening", "night", "night", "night"]);
  assert.notEqual(greeting("en", 8), greeting("en", 19));
  assert.match(greeting("en", 8, "Aline"), /Aline/);
  assert.match(greeting("rw", 8, "Aline"), /Aline/);
  assert.notEqual(greeting("rw", 8), greeting("en", 8));
});

test("translate fills in values and falls back to English, then the key", () => {
  assert.equal(translate("en", "auth.sent", { email: "a@b.c" }).includes("a@b.c"), true);
  assert.equal(translate("zz", "auth.title"), LOCALES.en["auth.title"]);
  assert.equal(translate("rw", "no.such.key"), "no.such.key");
});

for (const lang of Object.keys(LOCALES).filter(l => l !== "en")) {
  test(`${lang} translates every interface string`, () => {
    const missing = Object.keys(LOCALES.en).filter(k => !(k in LOCALES[lang]));
    assert.deepEqual(missing, []);
    for (const [k, v] of Object.entries(LOCALES.en)) {
      assert.equal(Array.isArray(LOCALES[lang][k]), Array.isArray(v), `${k} keeps its shape`);
      if (typeof v === "string") {
        const vars = s => (s.match(/\{\w+\}/g) || []).sort().join();
        assert.equal(vars(LOCALES[lang][k]), vars(v), `${k} keeps its {placeholders}`);
      }
    }
  });
}

test("the hint button reports how many hints are left", () => {
  const a = availableActions({ hasConversation: true, loading: false, hintsUsed: 1, problem: { solved: false }, assistantReplies: 2, lastType: "hint" });
  assert.equal(a.find(x => x.id === "hint").left, 2);
});

test("every button action shown in the chat has a label in every language", async () => {
  const { ACTION_LABELS } = await import("../src/lib/chat.js");
  for (const lang of Object.keys(LOCALES)) for (const action of Object.keys(ACTION_LABELS)) {
    assert.ok(LOCALES[lang][`action.${action}`] ?? LOCALES.en[`action.${action}`], `${lang}: action.${action}`);
  }
});
