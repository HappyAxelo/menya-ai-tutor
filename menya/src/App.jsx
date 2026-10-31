import { useState, useRef, useEffect, useCallback, useLayoutEffect, lazy, Suspense } from "react";
import {
  ArrowUp, Meh, ThumbsDown, ThumbsUp, BookOpen, CircleHelp, NotebookPen, RefreshCw, Target, Mic, Square, Paperclip, X, FileText, Image as ImageIcon, LoaderCircle, Check, CheckCircle2, ChevronDown, ClipboardCheck, Copy, Flag, Globe, GraduationCap,
  CalendarCheck, HelpCircle, Lightbulb, Moon, RotateCcw, Sparkles, SquarePen, Sun, TriangleAlert, WifiOff,
  Settings as SettingsIcon, Crown,
} from "lucide-react";
import { useSettings, effectiveTheme } from "./settings.js";
import SettingsPanel from "./SettingsPanel.jsx";
import PlansView from "./PlansView.jsx";
import { callTutor, actionRequest, hintRequest, verifyKey, LANGUAGES } from "./tutor.js";
import { ACTION_LABELS, availableActions, tabTitle } from "./lib/chat.js";
import { useT, greeting, setConversationLanguage } from "./i18n.js";
import { readAttachment } from "./lib/attachments.js";
import { browserDictation, dictationSupported, recordVoice, voiceSupported } from "./lib/voice.js";
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
    return <div className="mn-msg user"><div className="mn-user-action">{msg.control === "stuck" ? msg.content : t(`action.${msg.control}`)}</div></div>;
  }
  return (
    <div className="mn-msg user">
      <div className="mn-user-bubble" dir="auto">
        {msg.control === "check" && <span className="mn-user-label"><ClipboardCheck size={13} />{t("action.check")}</span>}
        {msg.content}
        {msg.attachments?.length > 0 && (
          <span className="mn-user-files">
            {msg.attachments.map((a, i) => <span key={i} className="mn-file-chip sent">{a.kind === "image" ? <ImageIcon size={13} /> : <FileText size={13} />}{a.name}</span>)}
          </span>
        )}
      </div>
    </div>
  );
}

// "Was this helpful?" Bad / Fair / Good under a saved tutor reply.
const RATINGS = [{ id: "bad", icon: ThumbsDown }, { id: "fair", icon: Meh }, { id: "good", icon: ThumbsUp }];
function Feedback({ onRate }) {
  const { t } = useT();
  const [rated, setRated] = useState(null);
  const [failed, setFailed] = useState(false);
  const rate = async (id) => {
    setRated(id); setFailed(false);
    if (!(await onRate(id))) { setRated(null); setFailed(true); }
  };
  if (rated) return <span className="mn-feedback-thanks" role="status"><Check size={14} aria-hidden="true" />{t("feedback.thanks")}</span>;
  return (
    <div className="mn-feedback" role="group" aria-label={t("feedback.ask")}>
      <span>{failed ? t("feedback.failed") : t("feedback.ask")}</span>
      {RATINGS.map(({ id, icon: Icon }) => (
        <button key={id} className={`mn-btn rate-${id}`} onClick={() => rate(id)}><Icon size={14} aria-hidden="true" />{t(`feedback.${id}`)}</button>
      ))}
    </div>
  );
}

function AssistantMessage({ msg, animate, showTags, onRetry, onPlans, retryDisabled, onFeedback }) {
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
        {msg.engine?.item && <div className="mn-item-label"><Target size={13} aria-hidden="true" />{t(`engine.item.${msg.engine.item.kind}`)}</div>}
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
            {msg.engine?.verified === "correct" && <div className="mn-verified ok"><Check size={14} aria-hidden="true" />{t("engine.correct")}</div>}
            {msg.engine?.verified === "incorrect" && <div className="mn-verified no">{t("engine.incorrect")}</div>}
            {msg.engine?.mastery && msg.engine.objective && (
              <div className="mn-mastery-line">
                <b>{t(`obj.${msg.engine.objective.id}`, null) === `obj.${msg.engine.objective.id}` ? msg.engine.objective.title : t(`obj.${msg.engine.objective.id}`)}</b>
                {" · "}{t(`engine.status.${msg.engine.mastery.status}`)}
                {" · "}{t("engine.independent", { n: msg.engine.mastery.independent })}
                {msg.engine.mastery.nextReview && <>{" · "}{t("engine.nextReview", { date: new Date(msg.engine.mastery.nextReview).toLocaleDateString() })}</>}
              </div>
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
                {onFeedback && msg.messageId && <Feedback onRate={rating => onFeedback(msg.messageId, rating)} />}
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
  const [menu, setMenu] = useState(null);
  if (!actions.length) return null;
  return (
    <div className="mn-action-bar" role="group" aria-label={t("msg.nextSteps")}>
      {actions.map(a => a.menu ? (
        <span key={a.id} className="mn-action-menu">
          <button className="mn-action" aria-expanded={menu === a.id} onClick={() => setMenu(menu === a.id ? null : a.id)}>
            <CircleHelp size={14} aria-hidden="true" />{t(`next.${a.id}`)}
          </button>
          {menu === a.id && (
            <span className="mn-menu" role="menu">
              {a.menu.map(reason => (
                <button key={reason} role="menuitem" onClick={() => { setMenu(null); onAction(a.id, reason); }}>{t(`stuck.${reason}`)}</button>
              ))}
            </span>
          )}
        </span>
      ) : (
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
function Welcome({ client, userName, composer, onExample, onIntent, introOpen, onDismissIntro, onReview, onNavigate }) {
  const { t, lang } = useT();
  const hour = useHour();
  const [subject, setSubject] = useState(null);
  const [due, setDue] = useState([]);
  useEffect(() => { client?.dueReviews?.().then(setDue).catch(() => {}); }, [client]);
  return (
    <section className="mn-welcome">
      <h1 className="mn-greeting"><BrandMark size={40} /><span>{greeting(lang, hour, userName)}</span></h1>
      <p className="mn-hero-sub">{t("welcome.sub")}</p>
      {composer}

      {client && onNavigate && (
        <div className="mn-companion" role="group" aria-label={t("companion.label")}>
          <button className="mn-intent" onClick={() => onNavigate("study")}><CalendarCheck size={16} aria-hidden="true" />{t("companion.study")}</button>
          <button className="mn-intent" onClick={() => onNavigate("exam")}><ClipboardCheck size={16} aria-hidden="true" />{t("companion.exam")}</button>
          <button className="mn-intent" onClick={() => onNavigate("notes")}><BookOpen size={16} aria-hidden="true" />{t("companion.notes")}</button>
        </div>
      )}

      {due.length > 0 && (
        <div className="mn-reviews">
          <div className="mn-section-label">{t("review.title")}</div>
          <div className="mn-subject-row">
            {due.map(d => <button key={d.objective_id} className="mn-subject" onClick={() => onReview(d.objective_id)}><RefreshCw size={13} aria-hidden="true" /> {t(`obj.${d.objective_id}`)}</button>)}
          </div>
        </div>
      )}

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
                                  sidebar = null, onSessionChange = null, newChatKey = 0, userName = null, reviewRequest = null }) {
  const [apiKey, setApiKey] = useState(null);
  const [messages, setMessages] = useState([]);
  const [apiMessages, setApiMessages] = useState([]); // developer mode only: what the model sees
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingKind, setLoadingKind] = useState("message");
  const [hintsUsed, setHintsUsed] = useState(0);
  const [problem, setProblem] = useState(null); // { solved, practice, attempts } from the server
  const [engine, setEngine] = useState(null);   // { mode, state, objective, item, mastery } from the tutoring engine
  const [mode, setMode] = useState("learn");     // learn: guided step by step; explain: direct explanation
  const [scratchOpen, setScratchOpen] = useState(false);
  const [scratch, setScratch] = useState("");
  const [files, setFiles] = useState([]);       // [{ id, name, kind, status: reading|ready|error, text, error }]
  const [voice, setVoice] = useState(null);     // { phase: recording|transcribing|dictating, seconds, level }
  const [voiceError, setVoiceError] = useState(null);
  const [dragging, setDragging] = useState(false);
  const recorderRef = useRef(null);
  const fileInputRef = useRef(null);
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

  // The browser tab shows the problem being worked on, or just the name.
  const conversationTitle = tabTitle(messages);
  useEffect(() => { document.title = conversationTitle ?? "Menya AI"; }, [conversationTitle]);

  // Reopen a saved conversation.
  useEffect(() => {
    if (!resume || !client) return;
    client.resume(resume.session.id);
    setMessages(resume.messages); setApiMessages([]); setAnimateIndex(-1);
    setHintsUsed(resume.session.hints_used ?? 0);
    setProblem({ solved: resume.session.solved, practice: resume.session.practice, attempts: resume.session.attempts });
    setMode(resume.session.mode ?? "learn");
    setEngine(resume.session.objective ? { objective: { id: resume.session.objective } } : null);
    setLastLanguage(resume.session.language ?? null);
    setInput("");
    onSessionChange?.(resume.session.id);
  }, [resume?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const pushAssistant = useCallback((msg) => {
    setMessages(prev => { setAnimateIndex(prev.length); return [...prev, { role: "assistant", ...msg }]; });
  }, []);

  const openPlans = useCallback(() => { setShowSettings(false); onNavigate ? onNavigate("pricing") : setShowPlans(true); }, [onNavigate]);

  // One path for every learner action: a typed message, an answer to check, or a button.
  const runAction = useCallback(async (action, text = "", { retry = false, stuck = null, objective = null, attachments = null } = {}) => {
    if (loading || !online) return;
    if ((action === "message" || action === "check") && !text.trim() && !attachments?.length) return;
    loadMarkdown();
    setLoading(true); setLoadingKind(action);
    const userMsg = action === "message" ? { role: "user", content: text, attachments: attachments?.map(a => ({ name: a.name, kind: a.kind })) }
      : { role: "user", control: action, content: action === "check" ? text : action === "stuck" ? t(`stuck.${stuck}`) : ACTION_LABELS[action] };
    setMessages(prev => {
      const base = retry && prev.at(-1)?.type === "error" ? prev.slice(0, -1) : prev;
      return retry ? base : [...base, userMsg];
    });
    if (action === "message" || action === "check") { setInput(""); if (attachments) setFiles([]); }
    const prefs = { learnerLevel: settings.level, style: settings.style };
    const lang = language !== "auto" ? language : lastLanguage;
    try {
      let parsed, advanced = false, engineView = null;
      if (client) {
        const r = await client.act(action, { text, language, ...prefs, mode, stuck: stuck ?? undefined, objective: objective ?? undefined,
          attachments: attachments?.map(({ name, kind, text: body }) => ({ name, kind, text: body })) });
        if (!r.ok) {
          const message = errorText(t, r.error, r.message, { seconds: r.retryAfter ?? 30 });
          throw Object.assign(new Error(message), { limit: r.isLimit ? r : null, retryable: r.retryable });
        }
        parsed = r.reply; advanced = r.advanced; engineView = r.engine;
        setHintsUsed(r.hintsUsed ?? 0);
        setProblem(r.problem);
        setEngine(r.engine);
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
        progressSummary: parsed.progressSummary, solved: parsed.solved === true, advanced, messageId: parsed.messageId ?? null,
        engine: client ? engineView : null,
      });
    } catch (err) {
      if (err.limit) pushAssistant({ content: err.message, type: "limit", upgradeTo: err.limit.upgradeTo });
      else pushAssistant({ content: err.message || t("err.generic"), type: "error",
                           retry: client ? (err.retryable ? { action, text, stuck, objective, attachments } : null) : { action, text } });
    }
    setLoading(false);
    if (action === "message" || action === "check") inputRef.current?.focus();
  }, [loading, online, client, apiKey, apiMessages, language, lastLanguage, hintsUsed, settings.level, settings.style, mode, onUsage, onSessionChange, pushAssistant, t]);

  const retry = useCallback(({ action, text, stuck, objective, attachments }) => runAction(action, text, { retry: true, stuck, objective, attachments }), [runAction]);

  // ---------------- attachments ----------------
  const addFiles = useCallback((list) => {
    if (!client) return;
    const incoming = [...list].slice(0, Math.max(0, 5 - files.length));
    for (const file of incoming) {
      const id = `${Date.now()}-${Math.random()}`;
      setFiles(f => [...f, { id, name: file.name || "file", kind: null, status: "reading" }]);
      readAttachment(file, { readImage: client.readImage, transcribe: blob => client.transcribe(blob, language) })
        .then(a => setFiles(f => f.map(x => x.id === id ? { ...x, ...a, status: "ready" } : x)))
        .catch(err => setFiles(f => f.map(x => x.id === id ? { ...x, status: "error", error: err.code ?? "generic" } : x)));
    }
  }, [client, files.length, language]);
  const readyFiles = files.filter(f => f.status === "ready");
  const filesBusy = files.some(f => f.status === "reading");
  const send = () => {
    if (filesBusy) return;
    runAction("message", input, { attachments: readyFiles.length ? readyFiles : null });
  };

  // ---------------- voice ----------------
  const kinyarwanda = language === "Kinyarwanda" || (language === "auto" && lang === "rw");
  const insertText = (text) => {
    if (!text) return;
    setInput(i => (i.trim() ? `${i.trimEnd()} ${text}` : text));
    requestAnimationFrame(() => inputRef.current?.focus());
  };
  const voiceFail = (code) => { setVoice(null); recorderRef.current = null; setVoiceError(code); };
  const startWhisper = async () => {
    try {
      const rec = await recordVoice({
        onLevel: level => setVoice(v => v && { ...v, level }),
        onTick: seconds => setVoice(v => v && { ...v, seconds }),
        onAutoStop: () => stopVoice(),
      });
      recorderRef.current = { kind: "record", ...rec };
      setVoice({ phase: "recording", seconds: 0, level: 0 });
    } catch (err) {
      voiceFail(err?.name === "NotAllowedError" || err?.name === "SecurityError" ? "denied" : "unsupported");
    }
  };
  const startVoice = async () => {
    setVoiceError(null);
    if (kinyarwanda && dictationSupported()) {
      const base = input;
      const rec = browserDictation("rw-RW", {
        onText: (finalText, interim) => setInput(`${base ? `${base.trimEnd()} ` : ""}${finalText} ${interim}`.trimEnd()),
        onEnd: () => { setVoice(null); recorderRef.current = null; },
        onError: (code) => { if (code === "language-not-supported" || code === "service-not-allowed") { setInput(base); startWhisper(); } else if (code === "not-allowed") voiceFail("denied"); },
      });
      recorderRef.current = { kind: "dictate", ...rec };
      setVoice({ phase: "dictating", seconds: 0, level: 0 });
      return;
    }
    if (!voiceSupported()) { voiceFail("unsupported"); return; }
    await startWhisper();
  };
  const stopVoice = async () => {
    const rec = recorderRef.current;
    if (!rec) return;
    if (rec.kind === "dictate") { rec.stop(); return; }
    recorderRef.current = null;
    setVoice({ phase: "transcribing", seconds: 0, level: 0 });
    try {
      const blob = await rec.stop();
      if (blob.size < 1500) { voiceFail("empty"); return; }
      const text = await client.transcribe(blob, language);
      if (!text.trim()) { voiceFail("empty"); return; }
      insertText(text.trim());
      setVoice(null);
    } catch (err) {
      voiceFail(err?.code === "media_limit" ? "limit" : "failed");
    }
  };
  const cancelVoice = () => { recorderRef.current?.cancel(); recorderRef.current = null; setVoice(null); };

  const newProblem = () => {
    client?.newProblem();
    setMessages([]); setApiMessages([]); setHintsUsed(0); setProblem(null); setEngine(null); setLastLanguage(null);
    setInput(""); setAnimateIndex(-1);
    onSessionChange?.(null);
    inputRef.current?.focus();
  };

  useEffect(() => { if (newChatKey) newProblem(); }, [newChatKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // "Review now" from the progress page: a fresh conversation on that objective.
  // From "My study", exams or notes: a lesson ({ text }), a draft question ({ draft }) or an unseen problem ({ objective }).
  useEffect(() => {
    if (!reviewRequest) return;
    newProblem();
    if (reviewRequest.draft) useIntent(reviewRequest.draft);
    else if (reviewRequest.text) runAction("message", reviewRequest.text);
    else runAction("review", "", { objective: reviewRequest.objective });
  }, [reviewRequest?.key]); // eslint-disable-line react-hooks/exhaustive-deps

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
    lastType: last?.role === "assistant" ? last.type : "error", engine,
  });
  const canCheck = !empty && input.trim().length > 0 && !loading && online && !problem?.solved;

  // One composer: in the middle of the welcome screen, at the bottom once a conversation starts.
  const modeSwitch = client && (
    <div className="mn-mode" role="radiogroup" aria-label={t("mode.label")}>
      {["learn", "explain"].map(m => (
        <button key={m} type="button" role="radio" aria-checked={mode === m} title={t(`mode.${m}Help`)} onClick={() => setMode(m)}>{t(`mode.${m}`)}</button>
      ))}
    </div>
  );
  const scratchpad = scratchOpen && (
    <div className="mn-scratch">
      <textarea value={scratch} onChange={e => setScratch(e.target.value)} rows={4} dir="auto" placeholder={t("scratch.placeholder")} aria-label={t("scratch.open")} />
      <div className="mn-scratch-row">
        <button type="button" className="mn-btn" disabled={!scratch.trim()} onClick={() => { setInput(i => (i ? `${i}\n${scratch}` : scratch)); inputRef.current?.focus(); }}>{t("scratch.insert")}</button>
      </div>
    </div>
  );
  const composer = (
    <>
    {scratchpad}
    <form className={`mn-composer${dragging ? " dragging" : ""}`} onSubmit={e => { e.preventDefault(); send(); }}
      onDragOver={e => { if (client && e.dataTransfer?.types?.includes("Files")) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { if (!client) return; e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}>
      {dragging && <div className="mn-drop-hint">{t("attach.drop")}</div>}
      {files.length > 0 && (
        <div className="mn-file-row">
          {files.map(f => (
            <span key={f.id} className={`mn-file-chip ${f.status}`} title={f.status === "error" ? t(`attach.failed.${f.error}`) : f.name}>
              {f.status === "reading" ? <LoaderCircle size={13} className="mn-spin" /> : f.kind === "image" ? <ImageIcon size={13} /> : <FileText size={13} />}
              <span className="name">{f.name}</span>
              {f.status === "reading" && <span className="state">{t("attach.reading")}</span>}
              {f.status === "error" && <span className="state">{t(`attach.failed.${f.error}`) === `attach.failed.${f.error}` ? t("attach.failed.generic") : t(`attach.failed.${f.error}`)}</span>}
              <button type="button" onClick={() => setFiles(x => x.filter(y => y.id !== f.id))} aria-label={t("attach.remove", { name: f.name })}><X size={12} /></button>
            </span>
          ))}
        </div>
      )}
      <textarea ref={inputRef} dir="auto" rows={empty ? 2 : 1} value={input} onChange={e => setInput(e.target.value)}
        onKeyDown={e => {
          if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
          const go = settings.enterToSend ? !e.shiftKey : (e.ctrlKey || e.metaKey);
          if (go) { e.preventDefault(); send(); }
        }}
        onPaste={e => { const pasted = [...(e.clipboardData?.files ?? [])]; if (client && pasted.length) { e.preventDefault(); addFiles(pasted); } }}
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
        {modeSwitch}
        {client && (
          <button type="button" className="mn-btn icon" aria-pressed={scratchOpen} onClick={() => setScratchOpen(o => !o)} title={t("scratch.open")} aria-label={t("scratch.open")}>
            <NotebookPen size={15} />
          </button>
        )}
        {client && (
          <>
            <button type="button" className="mn-btn icon" onClick={() => fileInputRef.current?.click()} disabled={files.length >= 5}
              title={files.length >= 5 ? t("attach.max") : t("attach.button")} aria-label={t("attach.button")}>
              <Paperclip size={15} />
            </button>
            <input ref={fileInputRef} type="file" multiple hidden onChange={e => { addFiles(e.target.files); e.target.value = ""; }} />
          </>
        )}
        <span className="spacer" />
        {voice && (
          <span className="mn-voice-status" role="status">
            {voice.phase === "transcribing" ? <><LoaderCircle size={14} className="mn-spin" />{t("voice.transcribing")}</>
              : voice.phase === "dictating" ? <><span className="mn-rec-dot" />{t("voice.dictating")}</>
              : <>
                  <span className="mn-rec-dot" />
                  {t("voice.recording", { time: `${Math.floor(voice.seconds / 60)}:${String(voice.seconds % 60).padStart(2, "0")}` })}
                  <span className="mn-level" aria-hidden="true"><span style={{ transform: `scaleX(${Math.max(0.05, voice.level)})` }} /></span>
                </>}
            {voice.phase !== "transcribing" && <button type="button" className="mn-btn icon" onClick={cancelVoice} aria-label={t("voice.cancel")} title={t("voice.cancel")}><X size={14} /></button>}
          </span>
        )}
        {!voice && <span className="mn-kbd mn-hide-sm">{settings.enterToSend ? t("composer.kbdEnter") : t("composer.kbdCtrl")}</span>}
        {client && (
          <button type="button" className={`mn-mic${voice && voice.phase !== "transcribing" ? " live" : ""}`} disabled={voice?.phase === "transcribing" || loading}
            onClick={() => (voice ? stopVoice() : startVoice())}
            aria-label={voice ? t("voice.stop") : t("voice.start")} title={voice ? t("voice.stop") : t("voice.start")}>
            {voice ? <Square size={14} fill="currentColor" /> : <Mic size={17} />}
          </button>
        )}
        <button type="submit" className="mn-send" disabled={loading || filesBusy || (!input.trim() && !readyFiles.length) || !online || Boolean(voice)} aria-label={t("composer.send")}><ArrowUp size={18} strokeWidth={2.5} /></button>
      </div>
    </form>
    {voiceError && <div className="mn-voice-error" role="alert">{t(`voice.${voiceError}`)} <button type="button" className="mn-link" onClick={() => setVoiceError(null)}><X size={12} /></button></div>}
    </>
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
              <Welcome client={client} userName={userName} onNavigate={onNavigate} onExample={q => runAction("message", q)} onIntent={useIntent}
                onReview={objective => runAction("review", "", { objective })}
                introOpen={introOpen} onDismissIntro={dismissIntro}
                composer={<div className="mn-welcome-composer">{offlineNote}{composer}</div>} />
            )}

            <div aria-live="polite" aria-relevant="additions">
              {messages.map((msg, i) => msg.role === "user"
                ? <UserMessage key={i} msg={msg} />
                : <AssistantMessage key={i} msg={msg} animate={settings.animate && i === animateIndex} showTags={settings.showTags}
                    onRetry={retry} onPlans={openPlans} retryDisabled={loading || !online}
                    onFeedback={client?.feedback} />)}
            </div>

            <ActionBar actions={actions} onAction={(id, reason) => runAction(id, "", { stuck: reason })} />

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
