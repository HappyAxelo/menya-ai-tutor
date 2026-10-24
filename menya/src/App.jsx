import { useState, useRef, useEffect, useCallback, useLayoutEffect, lazy, Suspense } from "react";
import {
  ArrowUp, BarChart3, BookOpen, Check, CheckCircle2, ChevronDown, Code2, Copy, Gauge, Globe, GraduationCap,
  HelpCircle, Lightbulb, Moon, RotateCcw, Sigma, Sparkles, SquarePen, Sun, TriangleAlert, X, Zap, Flag,
  Settings as SettingsIcon, Crown,
} from "lucide-react";
import { useSettings, effectiveTheme } from "./settings.js";
import SettingsPanel from "./SettingsPanel.jsx";
import PlansView from "./PlansView.jsx";
import { callTutor, hintRequest, verifyKey, LANGUAGES } from "./tutor.js";
// The Markdown + maths renderer is a separate download, fetched while the
// first reply is being prepared, so the first screen stays light.
const loadMarkdown = () => import("./Markdown.jsx");
const Markdown = lazy(loadMarkdown);
import "./menya.css";

// ============================================================
// INITIAL MASTERY STATE
// ============================================================
const INITIAL_MASTERY = {
  "Ohm's Law":        { score: 0, interactions: 0, subject: "EE" },
  "Kirchhoff's Laws": { score: 0, interactions: 0, subject: "EE" },
  "AC Circuits":      { score: 0, interactions: 0, subject: "EE" },
  "Derivatives":      { score: 0, interactions: 0, subject: "Math" },
  "Integration":      { score: 0, interactions: 0, subject: "Math" },
  "Newton's Laws":    { score: 0, interactions: 0, subject: "Physics" },
  "Thermodynamics":   { score: 0, interactions: 0, subject: "Physics" },
  "Recursion":        { score: 0, interactions: 0, subject: "CS" },
  "Big-O Notation":   { score: 0, interactions: 0, subject: "CS" },
  "Data Structures":  { score: 0, interactions: 0, subject: "CS" },
};

// Example problems — clicking one sends it as the student's question.
// Mixed languages to show that Menya replies in whatever language you write.
const STARTER_PROMPTS = [
  { icon: Zap, title: "Circuits", lang: "EN", text: "A 12 V battery is connected across a 4 Ω resistor. How do I find the current?" },
  { icon: Sigma, title: "Calculus", lang: "FR", text: "Comment dériver f(x) = x² · sin(x) ?" },
  { icon: Gauge, title: "Motion", lang: "RW", text: "Imodoka igenda ibilometero 120 mu masaha 2. Umuvuduko wayo ni uwuhe?" },
  { icon: Code2, title: "Recursion", lang: "SW", text: "Nisaidie: kwa nini function hii ya recursion haikomi? def f(n): return n * f(n-1)" },
];

const REPLY_STYLE = {
  question:        { label: "Your turn", icon: HelpCircle, cls: "" },
  affirmation:     { label: "Correct", icon: CheckCircle2, cls: "ok" },
  hint:            { label: "Hint", icon: Lightbulb, cls: "hint" },
  redirect:        { label: "Let's check that", icon: RotateCcw, cls: "redirect" },
  summary:         { label: "Summary", icon: Flag, cls: "info" },
  explanation:     { label: "Explanation", icon: BookOpen, cls: "info" },
  worked_solution: { label: "Worked solution", icon: GraduationCap, cls: "ok" },
  limit:           { label: "Plan limit", icon: TriangleAlert, cls: "hint" },
  error:           { label: "Something went wrong", icon: TriangleAlert, cls: "redirect" },
};

const SUBJECT_COLORS = { EE: "#f59e0b", Math: "#60a5fa", Physics: "#34d399", CS: "#a78bfa" };
const NODE_COLORS = { concept: "#34d399", formula: "#60a5fa", step: "#f59e0b", assumption: "#a78bfa", misconception: "#f87171" };

// ============================================================
// API KEY SCREEN — developer mode (own Groq key)
// ============================================================
function ApiKeyModal({ onSave }) {
  const [key, setKey] = useState("");
  const [showPlans, setShowPlans] = useState(false);
  const [error, setError] = useState("");
  const [testing, setTesting] = useState(false);

  const handleSave = async () => {
    const trimmed = key.trim();
    if (!trimmed) { setError("Please enter your API key."); return; }
    if (!trimmed.startsWith("gsk_")) {
      setError("Groq keys start with gsk_ — please check and try again.");
      return;
    }
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
        <div style={{ display: "flex", justifyContent: "center" }}><div className="mn-mark" style={{ width: 52, height: 52, fontSize: 28, borderRadius: 15 }}>M</div></div>
        <h1>Welcome to Menya</h1>
        <p className="sub">A tutor that guides you to the answer, one accurate hint at a time — in your language.</p>
        <form onSubmit={e => { e.preventDefault(); handleSave(); }}>
          <label className="mn-field">
            <span>Groq API key</span>
            <input className={`mn-input${error ? " invalid" : ""}`} type="password" value={key} autoComplete="off"
              onChange={e => setKey(e.target.value)} placeholder="gsk_…" aria-invalid={Boolean(error)} />
            {error && <div className="mn-error" role="alert">{error}</div>}
          </label>
          <button type="submit" className="mn-btn primary" disabled={!key.trim() || testing} style={{ width: "100%", height: 44, justifyContent: "center", fontSize: 14.5 }}>
            {testing ? "Checking your key…" : "Start learning"}
          </button>
        </form>
        <div className="mn-steps">
          <b>Get a free key in 2 minutes</b>
          <ol>
            <li>Open <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer">console.groq.com/keys</a> and sign in</li>
            <li>Click <strong>Create API Key</strong></li>
            <li>Copy the key (starts with gsk_) and paste it above</li>
          </ol>
        </div>
        <p style={{ marginTop: 14, fontSize: 12, color: "var(--faint)", textAlign: "center", lineHeight: 1.6 }}>
          Your key stays in this tab's memory only and goes straight to Groq. Refreshing clears it.
        </p>
        <div style={{ textAlign: "center", marginTop: 10 }}>
          <button className="mn-btn" onClick={() => setShowPlans(true)}><Crown size={15} />See Free, Pro &amp; Professional plans</button>
        </div>
      </div>
      {showPlans && <PlansView onClose={() => setShowPlans(false)} />}
    </div>
  );
}

// ============================================================
// MESSAGE PARTS
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

function AssistantMessage({ msg, animate, latest, onHint, canHint, showTags }) {
  const shown = useReveal(msg.content, animate);
  const done = shown === msg.content;
  const [copied, setCopied] = useState(false);
  const style = REPLY_STYLE[msg.type] ?? REPLY_STYLE.question;
  const Icon = style.icon;

  const copy = async () => {
    try { await navigator.clipboard.writeText(msg.content); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  };

  return (
    <div className={`mn-msg${latest ? " latest" : ""}`}>
      <div className="mn-mark sm" aria-hidden="true">M</div>
      <div className="mn-assistant">
        <div className={`mn-chip ${style.cls}`}>
          <Icon size={13} strokeWidth={2.4} />
          {msg.type === "hint" ? `Hint ${msg.hintLevel || 1} of 3` : style.label}
          {msg.type === "hint" && <span className="pips" aria-hidden="true">{[1, 2, 3].map(i => <i key={i} className={i <= (msg.hintLevel || 1) ? "on" : ""} />)}</span>}
        </div>
        <div className={`mn-content${msg.type === "error" ? " error" : ""}`} dir="auto">
          {msg.type === "error" || msg.type === "limit" ? <p>{shown}</p> : <Suspense fallback={<p style={{ whiteSpace: "pre-wrap" }}>{shown}</p>}><Markdown>{shown}</Markdown></Suspense>}
        </div>
        {done && (
          <>
            {msg.misconceptionDetected && (
              <div className="mn-callout warn"><TriangleAlert size={16} /><div><b>Common misconception</b>{msg.misconceptionDetected}</div></div>
            )}
            {msg.progressSummary && (
              <div className="mn-callout ok"><Flag size={16} /><div><b>What you've established</b>{msg.progressSummary}</div></div>
            )}
            {msg.type === "limit" && (
              <button className="mn-btn outline" style={{ marginTop: 12 }}
                onClick={() => window.dispatchEvent(new CustomEvent("menya:navigate", { detail: "pricing" }))}>
                {msg.upgradeTo ? "Compare plans" : "View your plan"}
              </button>
            )}
            {showTags && msg.conceptsDetected?.length > 0 && (
              <div className="mn-tags">{msg.conceptsDetected.map((c, i) => <span key={i} className="mn-tag-chip">{c}</span>)}</div>
            )}
            {msg.advanced && <div className="mn-advanced"><Sparkles size={12} /> Advanced reasoning used</div>}
            {msg.type !== "error" && msg.type !== "limit" && (
              <div className="mn-msg-actions">
                <button className="mn-btn" onClick={copy} aria-label="Copy reply">{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Copied" : "Copy"}</button>
                {latest && canHint && <button className="mn-btn" onClick={onHint}><Lightbulb size={14} />I'm stuck — hint</button>}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ProgressDrawer({ onClose, tab, setTab, reasoningGraph, subjectGroups, analytics }) {
  useEffect(() => {
    const onKey = e => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <>
      <div className="mn-scrim" onClick={onClose} />
      <aside className="mn-drawer" role="dialog" aria-label="Your progress">
        <div className="mn-drawer-head">
          <h2>Your progress</h2>
          <button className="mn-btn icon" onClick={onClose} aria-label="Close progress"><X size={18} /></button>
        </div>
        <div className="mn-tabs" role="tablist">
          {[["reasoning", "Reasoning"], ["mastery", "Mastery"], ["analytics", "Analytics"]].map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} className="mn-tab" onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>
        <div className="mn-drawer-body">
          {tab === "reasoning" && (
            <>
              <div className="mn-section-label">Reasoning graph</div>
              {reasoningGraph.length === 0
                ? <div className="mn-empty">The concepts and steps you work through will appear here.</div>
                : reasoningGraph.map((n, i) => {
                    const c = NODE_COLORS[n.type] || "#94a3b8";
                    return <span key={i} className="mn-node" style={{ color: c, borderColor: `${c}55`, background: `${c}14` }}><small style={{ opacity: .6 }}>#{i + 1}</small>{n.label}</span>;
                  })}
              <div className="mn-legend">
                {Object.entries(NODE_COLORS).map(([t, c]) => <span key={t}><i style={{ background: c }} />{t[0].toUpperCase() + t.slice(1)}</span>)}
              </div>
            </>
          )}
          {tab === "mastery" && Object.entries(subjectGroups).map(([subj, concepts]) => (
            <div key={subj} style={{ marginBottom: 18 }}>
              <div className="mn-section-label">{subj}</div>
              {concepts.map(([concept, data]) => {
                const pct = Math.min(100, Math.round(data.score));
                const color = SUBJECT_COLORS[data.subject] || "#94a3b8";
                return (
                  <div key={concept} className="mn-bar">
                    <div className="mn-bar-row"><span>{concept}</span><span>{pct}%</span></div>
                    <div className="mn-bar-track"><div className="mn-bar-fill" style={{ width: `${pct}%`, background: color }} /></div>
                  </div>
                );
              })}
            </div>
          ))}
          {tab === "analytics" && (
            <>
              <div className="mn-stats">
                {[["Messages", analytics.totalMessages, "var(--info)"], ["Hints used", analytics.hintsUsed, "var(--warn)"],
                  ["Concepts", analytics.conceptsIdentified, "var(--success)"], ["Misconceptions", analytics.misconceptionsDetected, "var(--danger)"]].map(([l, v, c]) => (
                  <div key={l} className="mn-stat"><div className="v" style={{ color: c }}>{v}</div><div className="l">{l}</div></div>
                ))}
              </div>
              <div className="mn-summary">
                {analytics.totalMessages === 0 ? "Start a problem to build your learning report."
                  : `You've worked through ${analytics.totalMessages} exchanges, met ${analytics.conceptsIdentified} concepts and used ${analytics.hintsUsed} hints${analytics.misconceptionsDetected ? `; ${analytics.misconceptionsDetected} misconceptions were caught and corrected` : ""}.`}
              </div>
            </>
          )}
        </div>
      </aside>
    </>
  );
}

// ============================================================
// MAIN APP
// ============================================================
// client: backend tutor client (commercial mode). Without it the app runs in
// developer mode and asks for the developer's own Groq key.
export default function AITutor({ client = null, headerExtras = null, onUsage = null, account = null, onNavigate = null }) {
  const [apiKey, setApiKey] = useState(null);
  const [messages, setMessages] = useState([]);
  const [apiMessages, setApiMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [hints, setHints] = useState([]);
  const [reasoningGraph, setReasoningGraph] = useState([]);
  const [mastery, setMastery] = useState(INITIAL_MASTERY);
  const [activeTab, setSideTab] = useState("reasoning");
  const [analytics, setAnalytics] = useState({ totalMessages: 0, hintsUsed: 0, conceptsIdentified: 0, misconceptionsDetected: 0 });
  const [encouragement, setEncouragement] = useState(null);
  const [lastLanguage, setLastLanguage] = useState(null);
  const [waitSeconds, setWaitSeconds] = useState(null);
  const [showSidebar, setShowSidebar] = useState(false);
  const [animateIndex, setAnimateIndex] = useState(-1);
  const [loadingKind, setLoadingKind] = useState("message");
  const [settings, updateSettings, resetSettings] = useSettings();
  const [showSettings, setShowSettings] = useState(false);
  const [showPlans, setShowPlans] = useState(false);
  const language = settings.language;
  const setLanguage = (l) => updateSettings({ language: l });
  const theme = effectiveTheme(settings.theme);
  const toggleTheme = () => updateSettings({ theme: theme === "dark" ? "light" : "dark" });
  const tutorPrefs = { learnerLevel: settings.level, style: settings.style };
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, loading]);

  // Auto-grow the composer
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

  const updateMastery = useCallback((concepts, score) => {
    setMastery(prev => {
      const updated = { ...prev };
      concepts.forEach(c => {
        const key = Object.keys(updated).find(k => k.toLowerCase().includes(c.toLowerCase()) || c.toLowerCase().includes(k.toLowerCase()));
        if (key) updated[key] = { ...updated[key], score: Math.min(100, updated[key].score + (score / 5) * 8), interactions: updated[key].interactions + 1 };
      });
      return updated;
    });
  }, []);

  const processResponse = useCallback((parsed, userText) => {
    if (parsed.conceptsDetected?.length > 0)
      setReasoningGraph(prev => [...prev, ...parsed.conceptsDetected.map(c => ({ label: c, type: "concept" }))]);
    if (userText.toLowerCase().match(/formula|equation|law|theorem/))
      setReasoningGraph(prev => [...prev, { label: userText.slice(0, 30), type: "formula" }]);
    if (parsed.misconceptionDetected)
      setReasoningGraph(prev => [...prev, { label: parsed.misconceptionDetected.slice(0, 30), type: "misconception" }]);
    setAnalytics(prev => ({ ...prev, totalMessages: prev.totalMessages + 1, conceptsIdentified: prev.conceptsIdentified + (parsed.conceptsDetected?.length || 0), misconceptionsDetected: prev.misconceptionsDetected + (parsed.misconceptionDetected ? 1 : 0) }));
    if (parsed.conceptsDetected?.length > 0) updateMastery(parsed.conceptsDetected, parsed.encouragementScore || 3);
    if (parsed.encouragementScore >= 4) {
      setEncouragement(parsed.encouragementScore === 5 ? "Excellent reasoning!" : "Great progress!");
      setTimeout(() => setEncouragement(null), 2800);
    }
  }, [updateMastery]);

  const pushAssistant = useCallback((msg) => {
    setMessages(prev => { setAnimateIndex(prev.length); return [...prev, { role: "assistant", ...msg }]; });
  }, []);

  const failureMessage = (err) => err.limit
    ? { content: err.message, type: "limit", upgradeTo: err.limit.upgradeTo }
    : { content: err.message || "Something went wrong. Please try again.", type: "error" };

  const sendMessage = useCallback(async (text) => {
    if (!text.trim() || loading) return;
    loadMarkdown();
    setLoading(true); setLoadingKind("message");
    const newApiMsgs = [...apiMessages, { role: "user", content: text }];
    setApiMessages(newApiMsgs);
    setMessages(prev => [...prev, { role: "user", content: text }]);
    setInput("");
    try {
      let parsed, advanced = false;
      if (client) {
        const r = await client.send({ text, language, ...tutorPrefs });
        if (!r.ok) throw Object.assign(new Error(r.message), { limit: r.isLimit ? r : null });
        parsed = r.reply; advanced = r.advanced;
        onUsage?.(r.quota);
      } else {
        parsed = await callTutor(newApiMsgs, apiKey, { language, onWait: setWaitSeconds, ...tutorPrefs });
      }
      if (parsed.language) setLastLanguage(parsed.language);
      setApiMessages(prev => [...prev, { role: "assistant", content: parsed.message }]);
      pushAssistant({ content: parsed.message, type: parsed.type, conceptsDetected: parsed.conceptsDetected, misconceptionDetected: parsed.misconceptionDetected, hintLevel: parsed.hintLevel, progressSummary: parsed.progressSummary, advanced });
      processResponse(parsed, text);
    } catch (err) {
      pushAssistant(failureMessage(err));
    }
    setLoading(false);
    inputRef.current?.focus();
  }, [loading, apiMessages, apiKey, processResponse, language, client, onUsage, pushAssistant, settings.level, settings.style]);

  const requestHint = useCallback(async () => {
    if (loading || hints.length >= 3 || messages.length === 0) return;
    setLoading(true); setLoadingKind("hint");
    const level = hints.length + 1;
    const request = { role: "user", content: hintRequest(level, language !== "auto" ? language : lastLanguage) };
    try {
      let parsed;
      if (client) {
        const r = await client.hint({ language, ...tutorPrefs });
        if (!r.ok) throw Object.assign(new Error(r.message), { limit: r.isLimit ? r : null });
        parsed = r.reply;
        onUsage?.(r.quota);
      } else {
        parsed = await callTutor([...apiMessages, request], apiKey, { language, onWait: setWaitSeconds, ...tutorPrefs });
      }
      if (parsed.language) setLastLanguage(parsed.language);
      setHints(prev => [...prev, { level, text: parsed.message }]);
      pushAssistant({ content: parsed.message, type: "hint", hintLevel: level, conceptsDetected: parsed.conceptsDetected });
      setApiMessages(prev => [...prev, request, { role: "assistant", content: parsed.message }]);
      setAnalytics(prev => ({ ...prev, hintsUsed: prev.hintsUsed + 1 }));
    } catch (err) {
      pushAssistant(failureMessage(err));
    }
    setLoading(false);
  }, [loading, hints, messages, apiMessages, apiKey, language, lastLanguage, client, onUsage, pushAssistant, settings.level, settings.style]);

  // Clears the conversation (and the 3-hint budget) but keeps mastery and analytics.
  const newProblem = () => {
    client?.newProblem();
    setMessages([]); setApiMessages([]); setHints([]); setLastLanguage(null);
    setReasoningGraph([]); setInput(""); setAnimateIndex(-1);
    inputRef.current?.focus();
  };

  const resetKey = () => {
    if (confirm("Clear your API key and reset the session?")) {
      setApiKey(null); setMessages([]); setApiMessages([]); setHints([]); setLastLanguage(null);
      setReasoningGraph([]); setMastery(INITIAL_MASTERY);
      setAnalytics({ totalMessages: 0, hintsUsed: 0, conceptsIdentified: 0, misconceptionsDetected: 0 });
    }
  };

  const exportConversation = () => {
    const label = m => m.role === "user" ? "You" : `Menya${m.type === "hint" ? ` (hint ${m.hintLevel || 1} of 3)` : ""}`;
    const md = `# Menya conversation\n\n_${new Date().toLocaleString()}_\n\n` +
      messages.map(m => `**${label(m)}:**\n\n${m.content}\n`).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([md], { type: "text/markdown" }));
    a.download = `menya-conversation-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const clearEverything = () => {
    if (!confirm("Clear this conversation and your progress in this tab?")) return;
    newProblem();
    setMastery(INITIAL_MASTERY);
    setAnalytics({ totalMessages: 0, hintsUsed: 0, conceptsIdentified: 0, misconceptionsDetected: 0 });
  };

  const openPlans = () => { setShowSettings(false); onNavigate ? onNavigate("pricing") : setShowPlans(true); };

  const subjectGroups = {};
  Object.entries(mastery).forEach(([k, v]) => { if (!subjectGroups[v.subject]) subjectGroups[v.subject] = []; subjectGroups[v.subject].push([k, v]); });

  if (!client && !apiKey) return <ApiKeyModal onSave={setApiKey} />;

  const hintsLeft = 3 - hints.length;
  const canHint = messages.length > 0 && hintsLeft > 0 && !loading;
  const lastAssistant = messages.map(m => m.role).lastIndexOf("assistant");

  return (
    <div className="mn-app">
      <header className="mn-topbar">
        <div className="mn-brand">
          <div className="mn-mark" aria-hidden="true">M</div>
          <div style={{ minWidth: 0 }}>
            <div className="mn-wordmark">Menya</div>
            <div className="mn-tag">AI tutor</div>
          </div>
        </div>
        <div className="mn-actions">
          <label className="mn-select" title="Reply language">
            <Globe size={15} className="lead" />
            <select value={language} onChange={e => setLanguage(e.target.value)} aria-label="Reply language">
              {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.code === "auto" && lastLanguage ? `Auto · ${lastLanguage}` : l.label}</option>)}
            </select>
            <ChevronDown size={14} className="trail" />
          </label>
          <button className="mn-btn" onClick={newProblem} disabled={messages.length === 0} title="New problem">
            <SquarePen size={16} /><span className="mn-hide-sm">New problem</span>
          </button>
          <button className="mn-btn" onClick={() => setShowSidebar(true)} aria-label="Your progress" title="Your progress">
            <BarChart3 size={16} /><span className="mn-hide-sm">Progress</span>
            {reasoningGraph.length > 0 && <span className="mn-badge">{reasoningGraph.length}</span>}
          </button>
          <button className="mn-btn icon mn-hide-sm" onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} title="Theme">
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          {!client && (
            <button className="mn-btn" onClick={openPlans} title="Plans"><Crown size={16} /><span className="mn-hide-sm">Plans</span></button>
          )}
          <button className="mn-btn icon" onClick={() => setShowSettings(true)} aria-label="Settings" title="Settings"><SettingsIcon size={16} /></button>
          {client && headerExtras}
        </div>
      </header>

      {encouragement && <div className="mn-toast" role="status"><Sparkles size={15} />{encouragement}</div>}

      <div className="mn-body">
        <main className="mn-thread" aria-live="polite">
          <div className="mn-thread-inner">
            {messages.length === 0 && (
              <section className="mn-hero">
                <div className="mn-mark" aria-hidden="true">M</div>
                <h1>What are we <span>learning</span> today?</h1>
                <p>Bring any problem. I'll guide you to the answer step by step, with hints when you need them — in English, Kinyarwanda, Français, Kiswahili and more.</p>
                <div className="mn-suggestions">
                  {STARTER_PROMPTS.map(({ icon: Icon, title, lang, text }) => (
                    <button key={text} className="mn-suggestion" onClick={() => sendMessage(text)}>
                      <span className="ico"><Icon size={17} /></span>
                      <span style={{ minWidth: 0 }}>
                        <span className="t">{title}<span className="mn-lang">{lang}</span></span>
                        <span className="d">{text}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {messages.map((msg, i) => msg.role === "user"
              ? <div key={i} className="mn-msg user"><div className="mn-user-bubble" dir="auto">{msg.content}</div></div>
              : <AssistantMessage key={i} msg={msg} animate={settings.animate && i === animateIndex} latest={i === lastAssistant} onHint={requestHint} canHint={canHint} showTags={settings.showTags} />)}

            {loading && (
              <div className="mn-thinking" role="status">
                <div className="mn-mark sm" aria-hidden="true">M</div>
                <span className="label">{loadingKind === "hint" ? "Preparing a hint…" : "Thinking…"}</span>
                {waitSeconds && <span className="wait">busy — retrying in {waitSeconds}s</span>}
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </main>

        <div className="mn-composer-wrap">
          <form className="mn-composer" onSubmit={e => { e.preventDefault(); sendMessage(input); }}>
            <textarea ref={inputRef} dir="auto" rows={1} value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
                const send = settings.enterToSend ? !e.shiftKey : (e.ctrlKey || e.metaKey);
                if (send) { e.preventDefault(); sendMessage(input); }
              }}
              placeholder={messages.length ? "Share your next step or your answer…" : "Ask about any problem, in any language…"}
              aria-label="Message Menya" />
            <div className="mn-composer-row">
              <button type="button" className="mn-hint-btn" onClick={requestHint} disabled={!canHint}
                aria-label={`Get a hint, ${hintsLeft} of 3 left`}>
                <Lightbulb size={15} />Hint
                <span className="pips" aria-hidden="true">{[0, 1, 2].map(i => <i key={i} className={i < hints.length ? "used" : ""} />)}</span>
              </button>
              <span className="spacer" />
              <span className="mn-kbd mn-hide-sm">{settings.enterToSend ? "Shift + Enter for a new line" : "Ctrl + Enter to send"}</span>
              <button type="submit" className="mn-send" disabled={loading || !input.trim()} aria-label="Send message"><ArrowUp size={18} strokeWidth={2.5} /></button>
            </div>
          </form>
          <div className="mn-footnote">Menya guides you to answers instead of handing them over. {client ? "Your progress is saved to your account." : "Developer mode · your own Groq key."}</div>
        </div>

        {showSettings && (
          <SettingsPanel settings={settings} update={updateSettings} reset={resetSettings}
            mode={client ? "commercial" : "dev"} account={account} hasConversation={messages.length > 0}
            onClose={() => setShowSettings(false)} onPlans={openPlans}
            onAccount={() => { setShowSettings(false); onNavigate?.("account"); }}
            onExport={exportConversation} onClear={clearEverything}
            onForgetKey={() => { setShowSettings(false); resetKey(); }} />
        )}
        {showPlans && <PlansView onClose={() => setShowPlans(false)} />}

        {showSidebar && (
          <ProgressDrawer onClose={() => setShowSidebar(false)} tab={activeTab} setTab={setSideTab}
            reasoningGraph={reasoningGraph} subjectGroups={subjectGroups} analytics={analytics} />
        )}
      </div>
    </div>
  );
}
