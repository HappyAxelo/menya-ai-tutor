// Per-viewer preferences, kept in this browser (localStorage). They're
// conveniences, so the app works the same if storage is unavailable.
// One shared store: every screen (chat, header, account, sign-in) sees the
// same settings, so changing the language changes the whole interface at once.
import { useSyncExternalStore } from "react";

export const DEFAULT_SETTINGS = {
  language: "auto",         // "auto": reply in the language the learner writes in (English when unclear)
  level: "undergraduate",   // secondary | undergraduate | postgraduate
  style: "balanced",        // concise | balanced | detailed
  theme: "system",          // system | light | dark
  textSize: "md",           // sm | md | lg
  animate: true,            // word-by-word reveal of replies
  showTags: true,           // concept tags under replies
  enterToSend: true,        // Enter sends (Shift+Enter = new line); off: Ctrl/Cmd+Enter sends
};

const KEY = "menya-settings";
const VERSION = 2;

// Version 1 defaulted the reply language to English, which made Menya answer
// Kinyarwanda questions in English. Settings saved before version 2 with that
// default move to "auto"; a language picked after this update is kept.
export function migrateSettings(saved) {
  if (!saved || typeof saved !== "object") return { ...DEFAULT_SETTINGS, v: VERSION };
  const next = { ...DEFAULT_SETTINGS, ...saved, v: VERSION };
  if ((saved.v ?? 1) < 2 && saved.language === "English") next.language = "auto";
  return next;
}

function load() {
  try {
    return migrateSettings(JSON.parse(localStorage.getItem(KEY) ?? "null"));
  } catch {
    return { ...DEFAULT_SETTINGS, v: VERSION };
  }
}

let current = null;
const listeners = new Set();

function apply(settings) {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* storage unavailable */ }
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (settings.theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", settings.theme);
  root.setAttribute("data-text-size", settings.textSize);
}

function snapshot() {
  if (!current) { current = load(); apply(current); }
  return current;
}

export function updateSettings(patch) {
  current = { ...snapshot(), ...patch };
  apply(current);
  listeners.forEach(l => l());
}

export function resetSettings() {
  updateSettings({ ...DEFAULT_SETTINGS, v: VERSION });
}

const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };

export function useSettings() {
  const settings = useSyncExternalStore(subscribe, snapshot, snapshot);
  return [settings, updateSettings, resetSettings];
}

export function effectiveTheme(theme) {
  if (theme !== "system") return theme;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
