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
// The Markdown + maths renderer is a separate download, fetched while the
// first reply is being prepared, so the first screen stays light.
const loadMarkdown = () => import("./Markdown.jsx");
const Markdown = lazy(loadMarkdown);
import { BrandMark, BrandAvatar, BrandLockup, Wordmark } from "./Brand.jsx";
import "./menya.css";

// Example questions per subject. Clicking one sends it as the student's question.
const SUBJECTS = {
  Maths: ["How do I differentiate f(x) = x² · sin(x)?", "Solve 2x + 7 = 19 and explain each step."],
  Physics: ["A car goes from 0 to 20 m/s in 5 s. What is its acceleration?", "Why does a heavier object not fall faster in a vacuum?"],
  Chemistry: ["How many moles are in 36 g of water?", "What is the difference between ionic and covalent bonds?"],
  Biology: ["Explain how osmosis differs from diffusion.", "Quiz me on the stages of mitosis."],
  "Computer science": ["Why does this never stop? def f(n): return n * f(n - 1)", "What does O(log n) mean, with an example?"],
  "Electrical eng.": ["A 12 V battery is connected across a 4 Ω resistor. How do I find the current?", "Explain Kirchhoff's current law."],
};

// Shortcuts that start the student's message; they finish it in their own words.
const INTENTS = [
  { label: "Explain a concept", prefix: "Explain this concept: ", icon: BookOpen },
  { label: "Help me solve a problem", prefix: "Help me solve this problem: ", icon: GraduationCap },
  { label: "Quiz me on a topic", prefix: "Quiz me on ", icon: HelpCircle },
];

const REPLY_STYLE = {
  question:        { label: "Your turn", icon: HelpCircle, cls: "" },
  affirmation:     { label: "Correct", icon: CheckCircle2, cls: "ok" },
  hint:            { label: "Hint", icon: Lightbulb, cls: "hint" },
  redirect:        { label: "Not quite yet", icon: RotateCcw, cls: "redirect" },
  summary:         { label: "Summary", icon: Flag, cls: "info" },
  explanation:     { label: "Explanation", icon: BookOpen, cls: "info" },
  worked_solution: { label: "Worked solution", icon: GraduationCap, cls: "ok" },
  limit:           { label: "Plan limit", icon: TriangleAlert, cls: "hint" },
  error:           { label: "Not sent", icon: TriangleAlert, cls: "redirect" },
};

const LOADING_LABEL = {
  message: "Thinking", hint: "Preparing a hint", simpler: "Rephrasing", example: "Working through an example",
  check: "Checking your answer", practice: "Writing a practice question", summary: "Summarising",
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
  if (msg.control && msg.control !== "check") {
    return <div className="mn-msg user"><div className="mn-user-action">{msg.content}</div></div>;
  }
  return (
    <div className="mn-msg user">
      <div className="mn-user-bubble" dir="auto">
        {msg.control === "check" && <span className="mn-user-label"><ClipboardCheck size={13} />Check my answer</span>}
        {msg.content}
      </div>
    </div>
  );
}

function AssistantMessage({ msg, animate, showTags, onRetry, onPlans, retryDisabled }) {
  const shown = useReveal(msg.content, animate);
  const done = shown === msg.content;
  const [copied, setCopied] = useState(false);
  const style = msg.solved ? { label: "Correct — answer checked", icon: CheckCircle2, cls: "ok" } : REPLY_STYLE[msg.type] ?? REPLY_STYLE.question;
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
          {msg.type === "hint" && !msg.solved ? `Hint ${msg.hintLevel || 1} of 3` : style.label}
        </div>
        <div className="mn-content" dir="auto">
          {plain ? <p>{shown}</p> : <Suspense fallback={<p style={{ whiteSpace: "pre-wrap" }}>{shown}</p>}><Markdown>{shown}</Markdown></Suspense>}
        </div>
        {done && (
          <>
            {msg.misconceptionDetected && (
              <div className="mn-callout warn"><TriangleAlert size={16} aria-hidden="true" /><div><b>Watch out for this</b>{msg.misconceptionDetected}</div></div>
            )}
            {msg.progressSummary && (
              <div className="mn-callout ok"><Flag size={16} aria-hidden="true" /><div><b>Key idea</b>{msg.progressSummary}</div></div>
            )}
            {msg.type === "limit" && (
              <button className="mn-btn outline" style={{ marginTop: 12 }} onClick={onPlans}>{msg.upgradeTo ? "Compare plans" : "View your plan"}</button>
            )}
            {msg.type === "error" && msg.retry && (
              <button className="mn-btn outline" style={{ marginTop: 12 }} onClick={() => onRetry(msg.retry)} disabled={retryDisabled}><RotateCcw size={14} />Try again</button>
            )}
            {showTags && msg.conceptsDetected?.length > 0 && (
              <div className="mn-tags" aria-label="Topics">{msg.conceptsDetected.map((c, i) => <span key={i} className="mn-tag-chip">{c}</span>)}</div>
            )}
            {msg.advanced && <div className="mn-advanced"><Sparkles size={12} aria-hidden="true" /> Advanced reasoning used</div>}
            {!plain && (
              <div className="mn-msg-actions">
                <button className="mn-btn" onClick={copy} aria-label="Copy reply">{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Copied" : "Copy"}</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ActionBar({ actions, onAction }) {
  if (!actions.length) return null;
  return (
    <div className="mn-action-bar" role="group" aria-label="Next steps">
      {actions.map(a => (
        <button key={a.id} className={`mn-action${a.primary ? " primary" : ""}`} onClick={() => onAction(a.id)}>
          {a.id === "hint" && <Lightbulb size={14} aria-hidden="true" />}
          {a.label}
          {a.detail && <span className="mn-action-detail">{a.detail}</span>}
        </button>
      ))}
    </div>
  );
}

function EmptyState({ client, onExample, onIntent, introOpen, onDismissIntro }) {
  const [subject, setSubject] = useState(null);
  return (
    <section className="mn-hero">
      <h1>What are you working on?</h1>
      <p className="mn-hero-sub">Type a question or paste a problem, in any language. Menya works through it with you.</p>

      {introOpen && (
        <div className="mn-intro" role="note" aria-label="How Menya works">
          <ul>
            <li><b>It asks before it tells.</b> You'll be asked what you know and what you'd try first.</li>
            <li><b>Hints when you're stuck.</b> Up to three per problem, each more specific than the last.</li>
            <li><b>Explanations when you ask.</b> Simpler wording, a worked example, or the full solution once you've had a real go.</li>
          </ul>
          <button className="mn-btn" onClick={onDismissIntro}>Got it</button>
        </div>
      )}

      <div className="mn-intents">
        {INTENTS.map(({ label, prefix, icon: Icon }) => (
          <button key={label} className="mn-intent" onClick={() => onIntent(prefix)}><Icon size={16} aria-hidden="true" />{label}</button>
        ))}
      </div>

      <div className="mn-subjects">
        <div className="mn-section-label" id="mn-subjects-label">Or pick a subject for an example</div>
        <div className="mn-subject-row" role="group" aria-labelledby="mn-subjects-label">
          {Object.keys(SUBJECTS).map(s => (
            <button key={s} className="mn-subject" aria-pressed={subject === s} onClick={() => setSubject(subject === s ? null : s)}>{s}</button>
          ))}
        </div>
        {subject && (
          <div className="mn-examples">
            {SUBJECTS[subject].map(q => <button key={q} className="mn-example" onClick={() => onExample(q)}>{q}</button>)}
          </div>
        )}
      </div>

      <p className="mn-data-note">
        {client
          ? <>Your conversations are saved to your account so you can reopen them from History. They're deleted after 180 days. <a href={`${import.meta.env.BASE_URL}privacy.html`} target="_blank" rel="noopener noreferrer">Privacy policy</a></>
          : "Developer mode: nothing is saved. Refreshing the page clears the conversation."}
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
export default function AITutor({ client = null, headerExtras = null, onUsage = null, account = null, onNavigate = null, resume = null }) {
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
  const language = settings.language;
  const setLanguage = (l) => updateSettings({ language: l });
  const theme = effectiveTheme(settings.theme);
  const toggleTheme = () => updateSettings({ theme: theme === "dark" ? "light" : "dark" });
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

  // Reopen a saved conversation.
  useEffect(() => {
    if (!resume || !client) return;
    client.resume(resume.session.id);
    setMessages(resume.messages); setApiMessages([]); setAnimateIndex(-1);
    setHintsUsed(resume.session.hints_used ?? 0);
    setProblem({ solved: resume.session.solved, practice: resume.session.practice, attempts: resume.session.attempts });
    setLastLanguage(resume.session.language ?? null);
    setInput("");
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
        if (!r.ok) throw Object.assign(new Error(r.message), { limit: r.isLimit ? r : null, retryable: r.retryable });
        parsed = r.reply; advanced = r.advanced;
        setHintsUsed(r.hintsUsed ?? 0);
        setProblem(r.problem);
        onUsage?.(r.quota);
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
      else pushAssistant({ content: err.message || "Something went wrong. Please try again.", type: "error",
                           retry: client ? (err.retryable ? { action, text } : null) : { action, text } });
    }
    setLoading(false);
    if (action === "message" || action === "check") inputRef.current?.focus();
  }, [loading, online, client, apiKey, apiMessages, language, lastLanguage, hintsUsed, settings.level, settings.style, onUsage, pushAssistant]);

  const retry = useCallback(({ action, text }) => runAction(action, text, { retry: true }), [runAction]);

  const newProblem = () => {
    client?.newProblem();
    setMessages([]); setApiMessages([]); setHintsUsed(0); setProblem(null); setLastLanguage(null);
    setInput(""); setAnimateIndex(-1);
    inputRef.current?.focus();
  };

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
    if (confirm(client ? "Clear this conversation from the screen? The saved copy stays in History until you delete it there." : "Clear this conversation?")) newProblem();
  };

  const useIntent = (prefix) => { setInput(prefix); requestAnimationFrame(() => { const el = inputRef.current; el?.focus(); el?.setSelectionRange(prefix.length, prefix.length); }); };
  const dismissIntro = () => { writeFlag(INTRO_KEY); setIntroOpen(false); };

  if (!client && !apiKey) return <ApiKeyModal onSave={setApiKey} />;

  const assistantReplies = messages.filter(m => m.role === "assistant").length;
  const last = messages.at(-1);
  const actions = availableActions({
    hasConversation: messages.length > 0, loading, hintsUsed, problem, assistantReplies,
    lastType: last?.role === "assistant" ? last.type : "error",
  });
  const canCheck = messages.length > 0 && input.trim().length > 0 && !loading && online && !problem?.solved;

  return (
    <div className="mn-app">
      <header className="mn-topbar">
        <div className="mn-brand">
          <BrandMark size={34} decorative={false} />
          <Wordmark size="md" />
        </div>
        <div className="mn-actions">
          <label className="mn-select" title="Reply language">
            <Globe size={15} className="lead" aria-hidden="true" />
            <select value={language} onChange={e => setLanguage(e.target.value)} aria-label="Reply language">
              {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.code === "auto" && lastLanguage ? `Auto · ${lastLanguage}` : l.label}</option>)}
            </select>
            <ChevronDown size={14} className="trail" aria-hidden="true" />
          </label>
          <button className="mn-btn" onClick={newProblem} disabled={messages.length === 0} aria-label="New problem" title="New problem">
            <SquarePen size={16} /><span className="mn-hide-sm">New problem</span>
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

      <div className="mn-body">
        <main className="mn-thread">
          <div className="mn-thread-inner">
            {messages.length === 0 && (
              <EmptyState client={client} onExample={q => runAction("message", q)} onIntent={useIntent}
                introOpen={introOpen} onDismissIntro={dismissIntro} />
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
                <span className="label">{LOADING_LABEL[loadingKind] ?? "Thinking"}<span className="mn-dots" aria-hidden="true"><i /><i /><i /></span></span>
                {waitSeconds && <span className="wait">Groq is busy, retrying in {waitSeconds}s</span>}
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </main>

        <div className="mn-composer-wrap">
          {!online && <div className="mn-offline" role="status"><WifiOff size={15} aria-hidden="true" />You're offline. Reconnect to send messages.</div>}
          <form className="mn-composer" onSubmit={e => { e.preventDefault(); runAction("message", input); }}>
            <textarea ref={inputRef} dir="auto" rows={1} value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
                const send = settings.enterToSend ? !e.shiftKey : (e.ctrlKey || e.metaKey);
                if (send) { e.preventDefault(); runAction("message", input); }
              }}
              maxLength={4000}
              placeholder={messages.length ? "Your next step, your answer, or a question…" : "Ask a question or paste a problem…"}
              aria-label="Message Menya" />
            <div className="mn-composer-row">
              {messages.length > 0 && (
                <button type="button" className="mn-check-btn" onClick={() => runAction("check", input)} disabled={!canCheck}
                  aria-describedby="mn-check-help">
                  <ClipboardCheck size={15} aria-hidden="true" />Check my answer
                </button>
              )}
              {messages.length > 0 && (
                <span id="mn-check-help" className="mn-sr">Sends what you've typed as your answer, for Menya to check.</span>
              )}
              <span className="spacer" />
              <span className="mn-kbd mn-hide-sm">{settings.enterToSend ? "Shift + Enter for a new line" : "Ctrl + Enter to send"}</span>
              <button type="submit" className="mn-send" disabled={loading || !input.trim() || !online} aria-label="Send message"><ArrowUp size={18} strokeWidth={2.5} /></button>
            </div>
          </form>
          <div className="mn-footnote">Menya can make mistakes. Check important results{client ? "" : " · Developer mode"}.</div>
        </div>

        {showSettings && (
          <SettingsPanel settings={settings} update={updateSettings} reset={resetSettings}
            mode={client ? "commercial" : "dev"} account={account} hasConversation={messages.length > 0}
            onClose={() => setShowSettings(false)} onPlans={openPlans}
            onAccount={() => { setShowSettings(false); onNavigate?.("account"); }}
            onExport={exportConversation} onClear={clearConversation}
            onShowIntro={() => { try { localStorage.removeItem(INTRO_KEY); } catch { /* ignore */ } setIntroOpen(true); setShowSettings(false); }}
            onForgetKey={() => { setShowSettings(false); resetKey(); }} />
        )}
        {showPlans && <PlansView onClose={() => setShowPlans(false)} />}
      </div>
    </div>
  );
}

