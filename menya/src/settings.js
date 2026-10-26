// Per-viewer preferences, kept in this browser (localStorage). They're
// conveniences, so the app works the same if storage is unavailable.
import { useCallback, useEffect, useState } from "react";

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

export function useSettings() {
  const [settings, setSettings] = useState(load);

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* storage unavailable */ }
    const root = document.documentElement;
    if (settings.theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", settings.theme);
    root.setAttribute("data-text-size", settings.textSize);
  }, [settings]);

  const update = useCallback((patch) => setSettings(s => ({ ...s, ...patch })), []);
  const reset = useCallback(() => setSettings({ ...DEFAULT_SETTINGS, v: VERSION }), []);
  return [settings, update, reset];
}

export function effectiveTheme(theme) {
  if (theme !== "system") return theme;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
