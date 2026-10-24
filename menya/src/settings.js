// Per-viewer preferences, kept in this browser (localStorage). They're
// conveniences, so the app works the same if storage is unavailable.
import { useCallback, useEffect, useState } from "react";

export const DEFAULT_SETTINGS = {
  language: "English",      // default reply language; "auto" follows the learner's language
  level: "undergraduate",   // secondary | undergraduate | postgraduate
  style: "balanced",        // concise | balanced | detailed
  theme: "system",          // system | light | dark
  textSize: "md",           // sm | md | lg
  animate: true,            // word-by-word reveal of replies
  showTags: true,           // concept tags under replies
  enterToSend: true,        // Enter sends (Shift+Enter = new line); off: Ctrl/Cmd+Enter sends
};

const KEY = "menya-settings";

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return saved && typeof saved === "object" ? { ...DEFAULT_SETTINGS, ...saved } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
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
  const reset = useCallback(() => setSettings(DEFAULT_SETTINGS), []);
  return [settings, update, reset];
}

export function effectiveTheme(theme) {
  if (theme !== "system") return theme;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
