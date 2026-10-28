import { useState, useRef, useEffect, useCallback, useLayoutEffect, lazy, Suspense } from "react";
import {
  ArrowUp, BookOpen, Check, CheckCircle2, ChevronDown, ClipboardCheck, Copy, Flag, Globe, GraduationCap,
  HelpCircle, Lightbulb, Moon, RotateCcw, Sparkles, SquarePen, Sun, TriangleAlert, WifiOff,
  Settings as SettingsIcon, Crown,
} from "lucide-react";
import { useSettings, effectiveTheme } from "./settings.js";
import SettingsPanel from "./SettingsPanel.jsx";
import PlansView from "./PlansView.jsx";
import { callTutor, actionRequest, hintRequest, verifyKey, LANGUAGES } from "./tutor.js";
import { ACTION_LABELS, availableActions } from "./lib/chat.js";
import { useT, greeting, setConversationLanguage } from "./i18n.js";
// The Markdown + maths renderer is a separate download, fetched while the
// first reply is being prepared, so the first screen stays light.
const loadMarkdown = () => import("./Markdown.jsx");
const Markdown = lazy(loadMarkdown);
import { BrandMark, BrandAvatar, BrandLockup, Wordmark } from "./Brand.jsx";
import "./menya.css";

// Subjects with example questions (text in locales.js). Clicking one sends it.
const SUBJECTS = ["maths", "physics", "chemistry", "biology", "cs", "ee"];

// Shortcuts that start the student's message; they finish it in their own words.
const INTENTS = [
  { id: "explain", icon: BookOpen },
  { id: "solve", icon: GraduationCap },
  { id: "quiz", icon: HelpCircle },
];

const REPLY_STYLE = {
  question:        { icon: HelpCircle, cls: "" },
  affirmation:     { icon: CheckCircle2, cls: "ok" },
  hint:            { icon: Lightbulb, cls: "hint" },
  redirect:        { icon: RotateCcw, cls: "redirect" },
  summary:         { icon: Flag, cls: "info" },
  explanation:     { icon: BookOpen, cls: "info" },
  worked_solution: { icon: GraduationCap, cls: "ok" },
  limit:           { icon: TriangleAlert, cls: "hint" },
  error:           { icon: TriangleAlert, cls: "redirect" },
};

const INTRO_KEY = "menya-intro-dismissed";
const readFlag = (k) => { try { return localStorage.getItem(k) === "1"; } catch { return false; } };
const writeFlag = (k) => { try { localStorage.setItem(k, "1"); } catch { /* storage unavailable */ } };

function useOnline() {
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine !== false);
  useEffect(() => {
    const up = () => setOnline(true), down = () => setOnline(false);
    window.addEventListener("online", up); window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, []);
  return online;
}

// The current hour, refreshed every minute, so the greeting follows the clock.
function useHour() {
  const [hour, setHour] = useState(() => new Date().getHours());
  useEffect(() => {
    const id = setInterval(() => setHour(new Date().getHours()), 60_000);
    return () => clearInterval(id);
  }, []);
  return hour;
}

// A server error code -> the learner's language; the server's English text otherwise.
function errorText(t, code, fallback, vars) {
  const key = `err.${code}`;
  const text = code ? t(key, vars) : key;
  return text === key ? (fallback || t("err.generic")) : text;
}

// ============================================================
// API KEY SCREEN — local developer mode only (own Groq key)
// ============================================================
function ApiKeyModal({ onSave }) {
  const [key, setKey] = useState("");
  const [showPlans, setShowPlans] = useState(false);
  const [error, setError] = useState("");
  const [testing, setTesting] = useState(false);

  const handleSave = async () => {
    const trimmed = key.trim();
    if (!trimmed) { setError("Please enter your API key."); return; }
    if (!trimmed.startsWith("gsk_")) { setError("Groq keys start with gsk_. Please check and try again."); return; }
    setTesting(true);
    setError("");
    const result = await verifyKey(trimmed);
    setTesting(false);
    if (result.ok) onSave(trimmed);
    else setError(result.error);
  };

  return (
    <div className="mn-gate">
      <div className="mn-card">
        <BrandLockup />
        <p className="sub">Developer mode. Students never see this screen: the public site signs them in and uses Menya's own key on the server.</p>
        <form onSubmit={e => { e.preventDefault(); handleSave(); }}>
          <label className="mn-field">
            <span>Groq API key</span>
            <input className={`mn-input${error ? " invalid" : ""}`} type="password" value={key} autoComplete="off"
              onChange={e => setKey(e.target.value)} placeholder="gsk_…" aria-invalid={Boolean(error)} aria-describedby={error ? "mn-key-error" : undefined} />
            {error && <div className="mn-error" id="mn-key-error" role="alert">{error}</div>}
          </label>
          <button type="submit" className="mn-btn primary block" disabled={!key.trim() || testing}>
            {testing ? "Checking your key…" : "Start"}
          </button>
        </form>
        <p className="mn-fine">The key stays in this tab's memory and goes straight to Groq. Refreshing clears it. Get one at <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer">console.groq.com/keys</a>.</p>
        <div style={{ textAlign: "center", marginTop: 10 }}>
          <button className="mn-btn" onClick={() => setShowPlans(true)}><Crown size={15} />Plans</button>
        </div>
      </div>
      {showPlans && <PlansView onClose={() => setShowPlans(false)} />}
    </div>
  );
}

// ============================================================
// MESSAGES
// ============================================================
// Reveals a reply word by word; LaTeX segments appear whole so formulas never flash half-written.
function useReveal(text, animate) {
  const tokens = useRef([]);
  const [count, setCount] = useState(animate ? 0 : Infinity);
  useEffect(() => {
    tokens.current = text.match(/\$\$[\s\S]*?\$\$|\$[^$\n]*\$|\s+|[^\s$]+|\$/g) ?? [text];
    if (!animate || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setCount(Infinity); return; }
    setCount(0);
    const step = Math.max(1, Math.ceil(tokens.current.length / 70));
    const id = setInterval(() => setCount(c => {
      if (c >= tokens.current.length) { clearInterval(id); return Infinity; }
      return c + step;
    }), 22);
    return () => clearInterval(id);
  }, [text, animate]);
  return count === Infinity ? text : tokens.current.slice(0, count).join("");
}

function UserMessage({ msg }) {
  const { t } = useT();
  if (msg.control && msg.control !== "check") {
    return <div className="mn-msg user"><div className="mn-user-action">{t(`action.${msg.control}`)}</div></div>;
  }
  return (
    <div className="mn-msg user">
      <div className="mn-user-bubble" dir="auto">
        {msg.control === "check" && <span className="mn-user-label"><ClipboardCheck size={13} />{t("action.check")}</span>}
        {msg.content}
      </div>
    </div>
  );
}

function AssistantMessage({ msg, animate, showTags, onRetry, onPlans, retryDisabled }) {
  const { t } = useT();
  const shown = useReveal(msg.content, animate);
  const done = shown === msg.content;
  const [copied, setCopied] = useState(false);
  const style = msg.solved ? { icon: CheckCircle2, cls: "ok" } : REPLY_STYLE[msg.type] ?? REPLY_STYLE.question;
  const label = msg.solved ? t("chip.solved") : msg.type === "hint" ? t("chip.hint", { n: msg.hintLevel || 1 })
    : t(`chip.${REPLY_STYLE[msg.type] ? msg.type : "question"}`);
  const Icon = style.icon;
  const plain = msg.type === "error" || msg.type === "limit";

  const copy = async () => {
    try { await navigator.clipboard.writeText(msg.content); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  };

  return (
    <div className="mn-msg">
      <BrandAvatar size={28} />
      <div className="mn-assistant">
        <div className={`mn-chip ${style.cls}`}>
          <Icon size={13} strokeWidth={2.4} aria-hidden="true" />
          {label}
        </div>
        <div className="mn-content" dir="auto">
          {plain ? <p>{shown}</p> : <Suspense fallback={<p style={{ whiteSpace: "pre-wrap" }}>{shown}</p>}><Markdown>{shown}</Markdown></Suspense>}
        </div>
        {done && (
          <>
            {msg.misconceptionDetected && (
              <div className="mn-callout warn"><TriangleAlert size={16} aria-hidden="true" /><div><b>{t("callout.misconception")}</b>{msg.misconceptionDetected}</div></div>
            )}
            {msg.progressSummary && (
              <div className="mn-callout ok"><Flag size={16} aria-hidden="true" /><div><b>{t("callout.keyIdea")}</b>{msg.progressSummary}</div></div>
            )}
            {msg.type === "limit" && (
              <button className="mn-btn outline" style={{ marginTop: 12 }} onClick={onPlans}>{msg.upgradeTo ? t("msg.comparePlans") : t("msg.viewPlan")}</button>
            )}
            {msg.type === "error" && msg.retry && (
              <button className="mn-btn outline" style={{ marginTop: 12 }} onClick={() => onRetry(msg.retry)} disabled={retryDisabled}><RotateCcw size={14} />{t("msg.tryAgain")}</button>
            )}
            {showTags && msg.conceptsDetected?.length > 0 && (
              <div className="mn-tags" aria-label={t("msg.topics")}>{msg.conceptsDetected.map((c, i) => <span key={i} className="mn-tag-chip">{c}</span>)}</div>
            )}
            {msg.advanced && <div className="mn-advanced"><Sparkles size={12} aria-hidden="true" /> {t("msg.advanced")}</div>}
            {!plain && (
              <div className="mn-msg-actions">
                <button className="mn-btn" onClick={copy} aria-label={t("msg.copyAria")}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? t("msg.copied") : t("msg.copy")}</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ActionBar({ actions, onAction }) {
  const { t } = useT();
  if (!actions.length) return null;
  return (
    <div className="mn-action-bar" role="group" aria-label={t("msg.nextSteps")}>
      {actions.map(a => (
        <button key={a.id} className={`mn-action${a.primary ? " primary" : ""}`} onClick={() => onAction(a.id)}>
          {a.id === "hint" && <Lightbulb size={14} aria-hidden="true" />}
          {t(a.id === "practice" && a.primary ? "next.practiceSolved" : `next.${a.id}`)}
          {a.left != null && <span className="mn-action-detail">{t("next.hintsLeft", { n: a.left })}</span>}
        </button>
      ))}
    </div>
  );
}

// The new-conversation screen: greeting for the time of day, the input in the
// middle, then shortcuts and examples underneath (the way Claude welcomes you).
function Welcome({ client, userName, composer, onExample, onIntent, introOpen, onDismissIntro }) {
  const { t, lang } = useT();
  const hour = useHour();
  const [subject, setSubject] = useState(null);
  return (
    <section className="mn-welcome">
      <h1 className="mn-greeting"><BrandMark size={40} /><span>{greeting(lang, hour, userName)}</span></h1>
      <p className="mn-hero-sub">{t("welcome.sub")}</p>
      {composer}

      <div className="mn-intents">
        {INTENTS.map(({ id, icon: Icon }) => (
          <button key={id} className="mn-intent" onClick={() => onIntent(t(`intent.${id}.prefix`))}><Icon size={16} aria-hidden="true" />{t(`intent.${id}`)}</button>
        ))}
      </div>

      <div className="mn-subjects">
        <div className="mn-section-label" id="mn-subjects-label">{t("subjects.label")}</div>
        <div className="mn-subject-row" role="group" aria-labelledby="mn-subjects-label">
          {SUBJECTS.map(s => (
            <button key={s} className="mn-subject" aria-pressed={subject === s} onClick={() => setSubject(subject === s ? null : s)}>{t(`subject.${s}`)}</button>
          ))}
        </div>
        {subject && (
          <div className="mn-examples">
            {t(`examples.${subject}`).map(q => <button key={q} className="mn-example" onClick={() => onExample(q)}>{q}</button>)}
          </div>
        )}
      </div>

      {introOpen && (
        <div className="mn-intro" role="note" aria-label={t("intro.title")}>
          <ul>
            <li><b>{t("intro.1b")}</b> {t("intro.1")}</li>
            <li><b>{t("intro.2b")}</b> {t("intro.2")}</li>
            <li><b>{t("intro.3b")}</b> {t("intro.3")}</li>
          </ul>
          <button className="mn-btn" onClick={onDismissIntro}>{t("intro.gotIt")}</button>
        </div>
      )}

      <p className="mn-data-note">
        {client
          ? <>{t("data.note")} <a href={`${import.meta.env.BASE_URL}privacy.html`} target="_blank" rel="noopener noreferrer">{t("privacy")}</a></>
          : t("data.dev")}
      </p>
    </section>
  );
}

// ============================================================
// MAIN APP
// ============================================================
// client: backend tutor client (signed-in app). Without it the app runs in
// local developer mode and asks for the developer's own Groq key.
// resume: { key, session, messages } to reopen a saved conversation.
// sidebar: conversation list shown beside the chat on wide screens.
// onSessionChange(id): the saved conversation now on screen (null for a new one).
// newChatKey: changing it starts a new conversation (the sidebar's "New conversation").
// userName: first name for the greeting (from the Google profile), if known.
export default function AITutor({ client = null, headerExtras = null, onUsage = null, account = null, onNavigate = null, resume = null,
                                  sidebar = null, onSessionChange = null, newChatKey = 0, userName = null }) {
  const [apiKey, setApiKey] = useState(null);
  const [messages, setMessages] = useState([]);
  const [apiMessages, setApiMessages] = useState([]); // developer mode only: what the model sees
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingKind, setLoadingKind] = useState("message");
  const [hintsUsed, setHintsUsed] = useState(0);
  const [problem, setProblem] = useState(null); // { solved, practice, attempts } from the server
  const [lastLanguage, setLastLanguage] = useState(null);
  const [waitSeconds, setWaitSeconds] = useState(null);
  const [animateIndex, setAnimateIndex] = useState(-1);
  const [settings, updateSettings, resetSettings] = useSettings();
  const [showSettings, setShowSettings] = useState(false);
  const [showPlans, setShowPlans] = useState(false);
  const [introOpen, setIntroOpen] = useState(() => !readFlag(INTRO_KEY));
  const online = useOnline();
  const { t, lang } = useT();
  const language = settings.language;
  const setLanguage = (l) => updateSettings({ language: l });
  const theme = effectiveTheme(settings.theme);
  const toggleTheme = () => updateSettings({ theme: theme === "dark" ? "light" : "dark" });
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  // Follow the conversation; an empty chat stays at the top so the greeting shows.
  useEffect(() => { if (messages.length) bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, loading]);

  // The interface follows the conversation's language in "match my language" mode.
  useEffect(() => { setConversationLanguage(lastLanguage); }, [lastLanguage]);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);

  // Auto-grow the composer
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input, messages.length]);

  // Reopen a saved conversation.
  useEffect(() => {
    if (!resume || !client) return;
    client.resume(resume.session.id);
    setMessages(resume.messages); setApiMessages([]); setAnimateIndex(-1);
    setHintsUsed(resume.session.hints_used ?? 0);
    setProblem({ solved: resume.session.solved, practice: resume.session.practice, attempts: resume.session.attempts });
    setLastLanguage(resume.session.language ?? null);
    setInput("");
    onSessionChange?.(resume.session.id);
  }, [resume?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const pushAssistant = useCallback((msg) => {
    setMessages(prev => { setAnimateIndex(prev.length); return [...prev, { role: "assistant", ...msg }]; });
  }, []);

  const openPlans = useCallback(() => { setShowSettings(false); onNavigate ? onNavigate("pricing") : setShowPlans(true); }, [onNavigate]);

  // One path for every learner action: a typed message, an answer to check, or a button.
  const runAction = useCallback(async (action, text = "", { retry = false } = {}) => {
    if (loading || !online) return;
    if ((action === "message" || action === "check") && !text.trim()) return;
    loadMarkdown();
    setLoading(true); setLoadingKind(action);
    const userMsg = action === "message" ? { role: "user", content: text }
      : { role: "user", control: action, content: action === "check" ? text : ACTION_LABELS[action] };
    setMessages(prev => {
      const base = retry && prev.at(-1)?.type === "error" ? prev.slice(0, -1) : prev;
      return retry ? base : [...base, userMsg];
    });
    if (action === "message" || action === "check") setInput("");
    const prefs = { learnerLevel: settings.level, style: settings.style };
    const lang = language !== "auto" ? language : lastLanguage;
    try {
      let parsed, advanced = false;
      if (client) {
        const r = await client.act(action, { text, language, ...prefs });
        if (!r.ok) {
          const message = errorText(t, r.error, r.message, { seconds: r.retryAfter ?? 30 });
          throw Object.assign(new Error(message), { limit: r.isLimit ? r : null, retryable: r.retryable });
        }
        parsed = r.reply; advanced = r.advanced;
        setHintsUsed(r.hintsUsed ?? 0);
        setProblem(r.problem);
        onUsage?.(r.quota);
        onSessionChange?.(client.currentSession());
      } else {
        const content = action === "message" ? text
          : action === "hint" ? hintRequest(hintsUsed + 1, lang)
          : actionRequest(action, lang, text);
        const request = [...apiMessages, { role: "user", content }];
        parsed = await callTutor(request, apiKey, { language, onWait: setWaitSeconds, ...prefs });
        setApiMessages([...request, { role: "assistant", content: parsed.message }]);
        if (action === "hint") setHintsUsed(h => Math.min(3, h + 1));
        if (action === "practice") setHintsUsed(0);
        parsed = { ...parsed, solved: false }; // nothing is verified in developer mode
      }
      if (parsed.language) setLastLanguage(parsed.language);
      pushAssistant({
        content: parsed.message, type: action === "hint" ? "hint" : parsed.type, hintLevel: parsed.hintLevel,
        conceptsDetected: parsed.conceptsDetected, misconceptionDetected: parsed.misconceptionDetected,
        progressSummary: parsed.progressSummary, solved: parsed.solved === true, advanced,
      });
    } catch (err) {
      if (err.limit) pushAssistant({ content: err.message, type: "limit", upgradeTo: err.limit.upgradeTo });
      else pushAssistant({ content: err.message || t("err.generic"), type: "error",
                           retry: client ? (err.retryable ? { action, text } : null) : { action, text } });
    }
    setLoading(false);
    if (action === "message" || action === "check") inputRef.current?.focus();
  }, [loading, online, client, apiKey, apiMessages, language, lastLanguage, hintsUsed, settings.level, settings.style, onUsage, onSessionChange, pushAssistant, t]);

  const retry = useCallback(({ action, text }) => runAction(action, text, { retry: true }), [runAction]);

  const newProblem = () => {
    client?.newProblem();
    setMessages([]); setApiMessages([]); setHintsUsed(0); setProblem(null); setLastLanguage(null);
    setInput(""); setAnimateIndex(-1);
    onSessionChange?.(null);
    inputRef.current?.focus();
  };

  useEffect(() => { if (newChatKey) newProblem(); }, [newChatKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const resetKey = () => {
    if (confirm("Clear your API key and this conversation?")) { setApiKey(null); newProblem(); }
  };

  const exportConversation = () => {
    const label = m => m.role === "user" ? (m.control && m.control !== "check" ? "You (action)" : "You") : `Menya${m.type === "hint" ? ` (hint ${m.hintLevel || 1} of 3)` : ""}`;
    const md = `# Menya conversation\n\n_${new Date().toLocaleString()}_\n\n` +
      messages.map(m => `**${label(m)}:**\n\n${m.content}\n`).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([md], { type: "text/markdown" }));
    a.download = `menya-conversation-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const clearConversation = () => {
    if (confirm(client ? t("confirm.clear") : t("confirm.clearDev"))) newProblem();
  };

  const useIntent = (prefix) => { setInput(prefix); requestAnimationFrame(() => { const el = inputRef.current; el?.focus(); el?.setSelectionRange(prefix.length, prefix.length); }); };
  const dismissIntro = () => { writeFlag(INTRO_KEY); setIntroOpen(false); };

  if (!client && !apiKey) return <ApiKeyModal onSave={setApiKey} />;

  const empty = messages.length === 0;
  const assistantReplies = messages.filter(m => m.role === "assistant").length;
  const last = messages.at(-1);
  const actions = availableActions({
    hasConversation: messages.length > 0, loading, hintsUsed, problem, assistantReplies,
    lastType: last?.role === "assistant" ? last.type : "error",
  });
  const canCheck = !empty && input.trim().length > 0 && !loading && online && !problem?.solved;

  // One composer: in the middle of the welcome screen, at the bottom once a conversation starts.
  const composer = (
    <form className="mn-composer" onSubmit={e => { e.preventDefault(); runAction("message", input); }}>
      <textarea ref={inputRef} dir="auto" rows={empty ? 2 : 1} value={input} onChange={e => setInput(e.target.value)}
        onKeyDown={e => {
          if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
          const send = settings.enterToSend ? !e.shiftKey : (e.ctrlKey || e.metaKey);
          if (send) { e.preventDefault(); runAction("message", input); }
        }}
        maxLength={4000}
        placeholder={empty ? t("composer.placeholder") : t("composer.placeholderFollowUp")}
        aria-label={t("composer.aria")} />
      <div className="mn-composer-row">
        {!empty && (
          <button type="button" className="mn-check-btn" onClick={() => runAction("check", input)} disabled={!canCheck}
            aria-describedby="mn-check-help">
            <ClipboardCheck size={15} aria-hidden="true" />{t("composer.check")}
          </button>
        )}
        {!empty && <span id="mn-check-help" className="mn-sr">{t("composer.checkHelp")}</span>}
        <span className="spacer" />
        <span className="mn-kbd mn-hide-sm">{settings.enterToSend ? t("composer.kbdEnter") : t("composer.kbdCtrl")}</span>
        <button type="submit" className="mn-send" disabled={loading || !input.trim() || !online} aria-label={t("composer.send")}><ArrowUp size={18} strokeWidth={2.5} /></button>
      </div>
    </form>
  );
  const offlineNote = !online && <div className="mn-offline" role="status"><WifiOff size={15} aria-hidden="true" />{t("offline")}</div>;

  return (
    <div className={`mn-app${empty ? " is-empty" : ""}`}>
      <header className="mn-topbar">
        <div className="mn-brand">
          <BrandMark size={32} decorative={false} />
          <Wordmark size="md" />
        </div>
        <div className="mn-actions">
          <label className="mn-select" title={t("lang.label")}>
            <Globe size={15} className="lead" aria-hidden="true" />
            <select value={language} onChange={e => setLanguage(e.target.value)} aria-label={t("lang.label")}>
              {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.code === "auto" ? (lastLanguage ? t("lang.matchCurrent", { lang: lastLanguage }) : t("lang.match")) : l.label}</option>)}
            </select>
            <ChevronDown size={14} className="trail" aria-hidden="true" />
          </label>
          <button className="mn-btn" onClick={newProblem} disabled={empty} aria-label={t("header.newProblem")} title={t("header.newProblem")}>
            <SquarePen size={16} /><span className="mn-hide-sm">{t("header.newProblem")}</span>
          </button>
          <button className="mn-btn icon mn-hide-sm" onClick={toggleTheme} aria-label={theme === "dark" ? t("header.toLight") : t("header.toDark")} title={theme === "dark" ? t("header.toLight") : t("header.toDark")}>
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          {!client && (
            <button className="mn-btn" onClick={openPlans} title={t("header.plans")}><Crown size={16} /><span className="mn-hide-sm">{t("header.plans")}</span></button>
          )}
          <button className="mn-btn icon" onClick={() => setShowSettings(true)} aria-label={t("header.settings")} title={t("header.settings")}><SettingsIcon size={16} /></button>
          {client && headerExtras}
        </div>
      </header>

      <div className="mn-main">
      {sidebar}
      <div className="mn-body">
        <main className="mn-thread">
          <div className="mn-thread-inner">
            {empty && (
              <Welcome client={client} userName={userName} onExample={q => runAction("message", q)} onIntent={useIntent}
                introOpen={introOpen} onDismissIntro={dismissIntro}
                composer={<div className="mn-welcome-composer">{offlineNote}{composer}</div>} />
            )}

            <div aria-live="polite" aria-relevant="additions">
              {messages.map((msg, i) => msg.role === "user"
                ? <UserMessage key={i} msg={msg} />
                : <AssistantMessage key={i} msg={msg} animate={settings.animate && i === animateIndex} showTags={settings.showTags}
                    onRetry={retry} onPlans={openPlans} retryDisabled={loading || !online} />)}
            </div>

            <ActionBar actions={actions} onAction={id => runAction(id)} />

            {loading && (
              <div className="mn-thinking" role="status">
                <BrandAvatar size={28} />
                <span className="label">{t(`loading.${loadingKind}`)}<span className="mn-dots" aria-hidden="true"><i /><i /><i /></span></span>
                {waitSeconds && <span className="wait">{t("loading.wait", { n: waitSeconds })}</span>}
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </main>

        {!empty && (
          <div className="mn-composer-wrap">
            {offlineNote}
            {composer}
            <div className="mn-footnote">{t("footnote")}{client ? "" : " · Developer mode"}</div>
          </div>
        )}

        {showSettings && (
          <SettingsPanel settings={settings} update={updateSettings} reset={resetSettings}
            mode={client ? "commercial" : "dev"} account={account} hasConversation={!empty}
            onClose={() => setShowSettings(false)} onPlans={openPlans}
            onAccount={() => { setShowSettings(false); onNavigate?.("account"); }}
            onExport={exportConversation} onClear={clearConversation}
            onShowIntro={() => { try { localStorage.removeItem(INTRO_KEY); } catch { /* ignore */ } setIntroOpen(true); setShowSettings(false); }}
            onForgetKey={() => { setShowSettings(false); resetKey(); }} />
        )}
        {showPlans && <PlansView onClose={() => setShowPlans(false)} />}
      </div>
      </div>
    </div>
  );
}
