// Interface language. It follows the reply-language setting, so changing the
// language changes the whole app. With "Match my language" it follows the
// language of the current conversation, or the device's language before the
// first message. Languages without a full translation show the English interface.
import { useCallback, useSyncExternalStore } from "react";
import { LOCALES } from "./locales.js";
import { useSettings } from "./settings.js";

const BY_NAME = { English: "en", Kinyarwanda: "rw", French: "fr", Swahili: "sw" };
export const UI_LANGUAGES = Object.keys(LOCALES);

export function uiLanguage(setting, conversationLanguage, deviceLanguage = "") {
  if (setting && setting !== "auto") return BY_NAME[setting] ?? "en";
  if (conversationLanguage && BY_NAME[conversationLanguage]) return BY_NAME[conversationLanguage];
  const device = String(deviceLanguage).toLowerCase().slice(0, 2);
  return UI_LANGUAGES.includes(device) ? device : "en";
}

export function translate(lang, key, vars) {
  const value = LOCALES[lang]?.[key] ?? LOCALES.en[key] ?? key;
  if (typeof value !== "string" || !vars) return value;
  return value.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));
}

// Greeting for the hour of the day (the learner's own clock).
export function greetingKey(hour) {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

export function greeting(lang, hour, name) {
  const part = greetingKey(hour);
  return name ? translate(lang, `greet.${part}.named`, { name }) : translate(lang, `greet.${part}`);
}

// The language of the conversation on screen, reported by the chat.
let conversationLanguage = null;
const listeners = new Set();
export function setConversationLanguage(language) {
  if (language === conversationLanguage) return;
  conversationLanguage = language;
  listeners.forEach(l => l());
}
const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };
const getConversationLanguage = () => conversationLanguage;

const deviceLanguage = () => (typeof navigator !== "undefined" ? navigator.language : "");

export function useT() {
  const [settings] = useSettings();
  const conversation = useSyncExternalStore(subscribe, getConversationLanguage, getConversationLanguage);
  const lang = uiLanguage(settings.language, conversation, deviceLanguage());
  const t = useCallback((key, vars) => translate(lang, key, vars), [lang]);
  return { t, lang };
}
