import { useState, useRef, useEffect, useCallback } from "react";

// ============================================================
// SYSTEM PROMPT — Socratic AI Tutor Guardrail
// ============================================================
const TUTOR_SYSTEM_PROMPT = `You are Menya — a Socratic AI academic tutor for undergraduate students. Your singular purpose is to guide students to discover answers themselves through structured questioning. You MUST NEVER provide direct answers, solutions, or final values to academic problems.

CORE DIRECTIVES (ABSOLUTE — never violate these):
1. NEVER give a direct answer, solution, or final computed value.
2. NEVER solve the problem, even partially, beyond what the student has already reasoned.
3. ALWAYS respond with guiding questions that stimulate the student's own reasoning.
4. If a student directly asks "just tell me the answer" or "what is X?", respond with warmth, acknowledge their frustration, and redirect to the next logical reasoning step.

PEDAGOGICAL STRATEGY:
- Use the Socratic method: ask sequences of focused questions that lead the student step-by-step.
- Break complex problems into the smallest logical steps. Ask about ONE step at a time.
- When a student makes an error, do NOT correct them directly. Instead ask: "What happens if we test that assumption against [relevant principle]?"
- When a student reaches correct reasoning, warmly affirm it and explain WHY their reasoning works.
- Maintain a patient, warm, encouraging tone at all times.
- Prevent cognitive overload: ask one key question per response, then wait.
- Periodically summarize the student's progress: "So far you've identified X and Y — what do you think comes next?"

HINT SYSTEM (use only when student is clearly stuck after 2+ exchanges):
- Hint Level 1: Conceptual reminder ("What principle governs this type of problem?")
- Hint Level 2: Formula recall ("Which formula relates these quantities?")
- Hint Level 3: Method nudge ("What mathematical operation connects these two values?")
- Never go beyond Level 3. Never reveal the final answer.

MISCONCEPTION DETECTION:
When you detect a misconception, note it subtly and ask a redirecting question:
- "Interesting idea — what does [correct principle] say about that relationship?"
- "Let's test that: if that were true, what would happen in [counterexample]?"

RESPONSE FORMAT:
You MUST respond with valid JSON only — no markdown, no backticks, no extra text before or after. Use exactly this structure:
{
  "message": "Your tutoring response",
  "type": "question|affirmation|hint|redirect|summary",
  "conceptsDetected": ["array of concept strings"],
  "misconceptionDetected": null,
  "hintLevel": null,
  "progressSummary": null,
  "encouragementScore": 3
}
misconceptionDetected: null or short string. hintLevel: null or 1/2/3. progressSummary: null or short string. encouragementScore: integer 1-5.`;

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

const STARTER_PROMPTS = [
  "What problem are you trying to understand today?",
  "Tell me the first step you think should happen.",
  "Which concept do you think applies here?",
  "Show me the formula you believe is relevant.",
  "What part of the problem makes sense to you already?",
];

// ============================================================
// GROQ API CALL
// Uses OpenAI-compatible endpoint with llama-3.3-70b-versatile
// ============================================================
async function callGroq(messages, apiKey) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: TUTOR_SYSTEM_PROMPT },
        ...messages.map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content })),
      ],
      temperature: 0.7,
      max_tokens: 1000,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `API error: ${response.status}`);
  }

  const data = await response.json();
  const raw = data?.choices?.[0]?.message?.content || "";

  try {
    const clean = raw.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch {
    return {
      message: raw || "I couldn't process that. Please try again.",
      type: "question",
      conceptsDetected: [],
      misconceptionDetected: null,
      hintLevel: null,
      progressSummary: null,
      encouragementScore: 3,
    };
  }
}

// ============================================================
// API KEY MODAL — Groq version
// ============================================================
function ApiKeyModal({ onSave }) {
  const [key, setKey] = useState("");
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
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${trimmed}` },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [{ role: "user", content: "hi" }],
          max_tokens: 5,
        }),
      });
      if (res.status === 401) {
        setError("Invalid API key. Please check and try again.");
        setTesting(false);
        return;
      }
      onSave(trimmed);
    } catch {
      setError("Connection failed. Check your internet and try again.");
    }
    setTesting(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(2,8,23,0.96)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(8px)" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,600&family=DM+Mono:wght@400&family=Fraunces:opsz,wght@9..144,700&display=swap');*{box-sizing:border-box;margin:0;padding:0}input{outline:none}`}</style>
      <div style={{ background: "#0a1628", border: "1px solid #1e3a5f", borderRadius: "20px", padding: "40px", maxWidth: "460px", width: "90%", boxShadow: "0 0 60px #0ea5e922", fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ textAlign: "center", marginBottom: "24px" }}>
          <div style={{ fontSize: "44px", marginBottom: "12px" }}>🦉</div>
          <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: "26px", fontWeight: "700", background: "linear-gradient(135deg,#7dd3fc,#c084fc)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", marginBottom: "8px" }}>Welcome to Menya</h1>
          <p style={{ color: "#64748b", fontSize: "14px", lineHeight: "1.7" }}>Enter your free Groq API key to begin. Your key stays in memory only — never stored, never shared.</p>
        </div>

        <div style={{ display: "flex", justifyContent: "center", marginBottom: "20px" }}>
          <div style={{ padding: "6px 16px", background: "#0f2a1a", border: "1px solid #16a34a", borderRadius: "20px", fontSize: "12px", color: "#4ade80", fontFamily: "'DM Mono', monospace" }}>
            ✓ 100% Free — No credit card required
          </div>
        </div>

        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "block", fontSize: "11px", color: "#475569", fontFamily: "'DM Mono', monospace", letterSpacing: "0.1em", marginBottom: "8px" }}>GROQ API KEY</label>
          <input
            type="password" value={key}
            onChange={e => setKey(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSave()}
            placeholder="gsk_..."
            style={{ width: "100%", padding: "12px 16px", background: "#0f172a", border: `1px solid ${error ? "#7f1d1d" : "#1e293b"}`, borderRadius: "10px", color: "#e2e8f0", fontSize: "14px", fontFamily: "'DM Mono', monospace" }}
          />
          {error && <div style={{ marginTop: "8px", fontSize: "12px", color: "#f87171" }}>{error}</div>}
        </div>

        <button onClick={handleSave} disabled={!key.trim() || testing}
          style={{ width: "100%", padding: "13px", background: !key.trim() || testing ? "#1e293b" : "linear-gradient(135deg,#0ea5e9,#7c3aed)", border: "none", borderRadius: "10px", color: !key.trim() || testing ? "#475569" : "#fff", fontSize: "14px", fontWeight: "600", cursor: !key.trim() || testing ? "not-allowed" : "pointer", fontFamily: "'DM Sans', sans-serif", transition: "all 0.2s" }}>
          {testing ? "Verifying key…" : "Start Tutoring →"}
        </button>

        <div style={{ marginTop: "20px", padding: "16px", background: "#0f172a", border: "1px solid #1e293b", borderRadius: "10px" }}>
          <div style={{ fontSize: "11px", color: "#4ade80", fontFamily: "'DM Mono', monospace", marginBottom: "8px" }}>HOW TO GET YOUR FREE KEY (2 minutes)</div>
          <ol style={{ fontSize: "12px", color: "#64748b", paddingLeft: "16px", lineHeight: "2.1" }}>
            <li>Go to <span style={{ color: "#7dd3fc" }}>console.groq.com</span></li>
            <li>Sign up with Google or email — free</li>
            <li>Click <strong style={{ color: "#94a3b8" }}>"API Keys"</strong> in the left sidebar</li>
            <li>Click <strong style={{ color: "#94a3b8" }}>"Create API Key"</strong></li>
            <li>Copy the key (starts with <span style={{ color: "#94a3b8" }}>gsk_</span>) and paste above</li>
          </ol>
        </div>

        <p style={{ marginTop: "14px", fontSize: "11px", color: "#334155", textAlign: "center", lineHeight: "1.6" }}>
          🔒 Key held in memory only. Refreshing clears it. Free tier: 14,400 requests/day.
        </p>
      </div>
    </div>
  );
}

// ============================================================
// SUB-COMPONENTS
// ============================================================
function ReasoningNode({ node, index }) {
  const colors = { concept: "#4ade80", formula: "#60a5fa", step: "#f59e0b", assumption: "#c084fc", misconception: "#f87171" };
  const c = colors[node.type] || "#94a3b8";
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: `${c}22`, border: `1px solid ${c}55`, borderRadius: "20px", padding: "4px 12px", fontSize: "12px", color: c, margin: "3px", fontFamily: "'DM Mono', monospace" }}>
      <span style={{ fontSize: "9px", opacity: 0.7 }}>#{index + 1}</span>{node.label}
    </div>
  );
}

function MasteryBar({ concept, data }) {
  const colors = { EE: "#f59e0b", Math: "#60a5fa", Physics: "#4ade80", CS: "#c084fc" };
  const color = colors[data.subject] || "#94a3b8";
  const pct = Math.min(100, Math.round(data.score));
  return (
    <div style={{ marginBottom: "10px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px", fontSize: "11px" }}>
        <span style={{ color: "#cbd5e1" }}>{concept}</span>
        <span style={{ color, fontFamily: "'DM Mono', monospace" }}>{pct}%</span>
      </div>
      <div style={{ height: "4px", background: "#1e293b", borderRadius: "2px", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(90deg,${color}88,${color})`, borderRadius: "2px", transition: "width 0.8s cubic-bezier(0.4,0,0.2,1)" }} />
      </div>
    </div>
  );
}

function HintPanel({ hints, onRequestHint, loading }) {
  return (
    <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", padding: "16px", marginTop: "12px" }}>
      <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "12px", fontFamily: "'DM Mono', monospace" }}>Hint System</div>
      {hints.map((h, i) => (
        <div key={i} style={{ display: "flex", gap: "10px", marginBottom: "8px", padding: "8px 12px", background: "#1e293b", borderRadius: "8px", fontSize: "13px", color: "#94a3b8" }}>
          <span style={{ color: "#f59e0b", fontFamily: "'DM Mono', monospace", fontSize: "11px", minWidth: "20px" }}>L{h.level}</span>
          <span>{h.text}</span>
        </div>
      ))}
      <button onClick={onRequestHint} disabled={loading || hints.length >= 3}
        style={{ marginTop: "8px", width: "100%", padding: "10px", background: hints.length >= 3 ? "#1e293b" : "#f59e0b22", border: `1px solid ${hints.length >= 3 ? "#334155" : "#f59e0b55"}`, borderRadius: "8px", color: hints.length >= 3 ? "#475569" : "#f59e0b", fontSize: "13px", cursor: hints.length >= 3 ? "not-allowed" : "pointer", fontFamily: "'DM Mono', monospace" }}>
        {hints.length >= 3 ? "Maximum hints reached" : loading ? "Thinking…" : `Request Hint ${hints.length + 1} of 3`}
      </button>
    </div>
  );
}

function MessageBubble({ msg }) {
  const isUser = msg.role === "user";
  const typeLabels = { question: { label: "Question", color: "#60a5fa" }, affirmation: { label: "✓ Great!", color: "#4ade80" }, hint: { label: `Hint L${msg.hintLevel || 1}`, color: "#f59e0b" }, redirect: { label: "Redirect", color: "#c084fc" }, summary: { label: "Summary", color: "#94a3b8" } };
  const typeInfo = typeLabels[msg.type] || typeLabels["question"];
  return (
    <div style={{ display: "flex", flexDirection: isUser ? "row-reverse" : "row", gap: "10px", marginBottom: "16px", alignItems: "flex-start" }}>
      <div style={{ width: "34px", height: "34px", borderRadius: "50%", background: isUser ? "linear-gradient(135deg,#6366f1,#8b5cf6)" : "linear-gradient(135deg,#0ea5e9,#06b6d4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", flexShrink: 0 }}>
        {isUser ? "👤" : "🦉"}
      </div>
      <div style={{ maxWidth: "75%" }}>
        {!isUser && msg.type && <div style={{ fontSize: "10px", color: typeInfo.color, fontFamily: "'DM Mono', monospace", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.08em" }}>{typeInfo.label}</div>}
        <div style={{ background: isUser ? "#1e293b" : "#0f172a", border: `1px solid ${isUser ? "#334155" : "#1e3a5f"}`, borderRadius: isUser ? "16px 4px 16px 16px" : "4px 16px 16px 16px", padding: "12px 16px", fontSize: "14px", lineHeight: "1.6", color: isUser ? "#cbd5e1" : "#e2e8f0" }}>
          {msg.content}
        </div>
        {msg.progressSummary && <div style={{ marginTop: "6px", padding: "8px 12px", background: "#0f2a1a", border: "1px solid #166534", borderRadius: "8px", fontSize: "12px", color: "#4ade80" }}>📊 {msg.progressSummary}</div>}
        {msg.misconceptionDetected && <div style={{ marginTop: "6px", padding: "8px 12px", background: "#2d0a0a", border: "1px solid #7f1d1d", borderRadius: "8px", fontSize: "12px", color: "#fca5a5" }}>⚠️ Misconception detected: {msg.misconceptionDetected}</div>}
        {msg.conceptsDetected?.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", marginTop: "6px", gap: "4px" }}>
            {msg.conceptsDetected.map((c, i) => <span key={i} style={{ padding: "2px 8px", background: "#0c4a6e", border: "1px solid #0369a1", borderRadius: "12px", fontSize: "11px", color: "#7dd3fc", fontFamily: "'DM Mono', monospace" }}>{c}</span>)}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// MAIN APP
// ============================================================
export default function AITutor() {
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
  const [showWelcome, setShowWelcome] = useState(true);
  const [encouragement, setEncouragement] = useState(null);
  const bottomRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

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
      setEncouragement(parsed.encouragementScore === 5 ? "🌟 Excellent reasoning!" : "✨ Great progress!");
      setTimeout(() => setEncouragement(null), 3000);
    }
  }, [updateMastery]);

  const sendMessage = useCallback(async (text) => {
    if (!text.trim() || loading) return;
    setShowWelcome(false);
    setLoading(true);
    const newApiMsgs = [...apiMessages, { role: "user", content: text }];
    setApiMessages(newApiMsgs);
    setMessages(prev => [...prev, { role: "user", content: text }]);
    setInput("");
    try {
      const parsed = await callGroq(newApiMsgs, apiKey);
      setApiMessages(prev => [...prev, { role: "assistant", content: parsed.message }]);
      setMessages(prev => [...prev, { role: "assistant", content: parsed.message, type: parsed.type, conceptsDetected: parsed.conceptsDetected, misconceptionDetected: parsed.misconceptionDetected, hintLevel: parsed.hintLevel, progressSummary: parsed.progressSummary }]);
      processResponse(parsed, text);
    } catch (err) {
      setMessages(prev => [...prev, { role: "assistant", content: `Error: ${err.message}. Please check your API key.`, type: "question" }]);
    }
    setLoading(false);
  }, [loading, apiMessages, apiKey, processResponse]);

  const requestHint = useCallback(async () => {
    if (loading || hints.length >= 3 || messages.length === 0) return;
    setLoading(true);
    const level = hints.length + 1;
    const hintMsgs = [...apiMessages, { role: "user", content: `I need a level ${level} hint. Never reveal the answer.` }];
    try {
      const parsed = await callGroq(hintMsgs, apiKey);
      setHints(prev => [...prev, { level, text: parsed.message }]);
      setMessages(prev => [...prev, { role: "assistant", content: parsed.message, type: "hint", hintLevel: level }]);
      setApiMessages(prev => [...prev, { role: "user", content: `I need a level ${level} hint.` }, { role: "assistant", content: parsed.message }]);
      setAnalytics(prev => ({ ...prev, hintsUsed: prev.hintsUsed + 1 }));
    } catch {}
    setLoading(false);
  }, [loading, hints, messages, apiMessages, apiKey]);

  const resetKey = () => {
    if (confirm("Clear your API key and reset the session?")) {
      setApiKey(null); setMessages([]); setApiMessages([]); setHints([]);
      setReasoningGraph([]); setShowWelcome(true); setMastery(INITIAL_MASTERY);
      setAnalytics({ totalMessages: 0, hintsUsed: 0, conceptsIdentified: 0, misconceptionsDetected: 0 });
    }
  };

  const subjectGroups = {};
  Object.entries(mastery).forEach(([k, v]) => { if (!subjectGroups[v.subject]) subjectGroups[v.subject] = []; subjectGroups[v.subject].push([k, v]); });

  if (!apiKey) return <ApiKeyModal onSave={setApiKey} />;

  return (
    <div style={{ minHeight: "100vh", background: "#020817", color: "#e2e8f0", fontFamily: "'DM Sans', sans-serif", display: "flex", flexDirection: "column" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,600&family=DM+Mono:wght@300;400;500&family=Fraunces:opsz,wght@9..144,300;9..144,700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:#0f172a}::-webkit-scrollbar-thumb{background:#334155;border-radius:2px}
        textarea{resize:none;outline:none}
        @keyframes pulse-glow{0%,100%{opacity:1}50%{opacity:0.4}}
        @keyframes float-in{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        @keyframes encouragement-pop{0%{opacity:0;transform:scale(0.8) translateY(-10px)}20%{opacity:1;transform:scale(1.05) translateY(0)}80%{opacity:1;transform:scale(1) translateY(0)}100%{opacity:0;transform:scale(0.95) translateY(-5px)}}
      `}</style>

      <header style={{ borderBottom: "1px solid #1e293b", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#020817", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "linear-gradient(135deg,#0ea5e9,#7c3aed)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px" }}>🦉</div>
          <div>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: "20px", fontWeight: "700", background: "linear-gradient(135deg,#7dd3fc,#c084fc)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Menya</div>
            <div style={{ fontSize: "10px", color: "#475569", fontFamily: "'DM Mono', monospace", letterSpacing: "0.12em" }}>AI TUTOR</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ fontSize: "12px", color: "#475569", fontFamily: "'DM Mono', monospace" }}>{messages.filter(m => m.role === "user").length} exchanges</div>
          <button onClick={resetKey} style={{ padding: "4px 12px", background: "#0f172a", border: "1px solid #1e293b", borderRadius: "20px", color: "#475569", fontSize: "11px", cursor: "pointer", fontFamily: "'DM Mono', monospace" }}>⚙ Key</button>
          <div style={{ padding: "4px 12px", background: "#0f2a1a", border: "1px solid #166534", borderRadius: "20px", fontSize: "11px", color: "#4ade80", fontFamily: "'DM Mono', monospace", display: "flex", alignItems: "center", gap: "6px" }}>
            <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#4ade80", animation: "pulse-glow 2s ease-in-out infinite" }} />
            Free · Groq
          </div>
        </div>
      </header>

      {encouragement && (
        <div style={{ position: "fixed", top: "80px", left: "50%", transform: "translateX(-50%)", padding: "10px 24px", background: "linear-gradient(135deg,#0d4f2a,#14532d)", border: "1px solid #16a34a", borderRadius: "30px", color: "#4ade80", fontSize: "14px", fontWeight: "600", zIndex: 200, animation: "encouragement-pop 3s ease forwards", pointerEvents: "none" }}>
          {encouragement}
        </div>
      )}

      <div style={{ flex: 1, display: "flex", overflow: "hidden", maxHeight: "calc(100vh - 65px)" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{ flex: 1, overflowY: "auto", padding: "24px", paddingBottom: "8px" }}>
            {showWelcome && (
              <div style={{ textAlign: "center", padding: "40px 20px", animation: "float-in 0.6s ease" }}>
                <div style={{ fontSize: "48px", marginBottom: "16px" }}>🦉</div>
                <div style={{ fontFamily: "'Fraunces', serif", fontSize: "28px", fontWeight: "700", background: "linear-gradient(135deg,#7dd3fc,#c084fc)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", marginBottom: "8px" }}>Welcome to Menya</div>
                <div style={{ color: "#64748b", fontSize: "14px", maxWidth: "400px", margin: "0 auto 32px", lineHeight: "1.7" }}>I won't give you answers — I'll help you discover them. Every question I ask is a step toward your own understanding.</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxWidth: "480px", margin: "0 auto" }}>
                  {STARTER_PROMPTS.map((p, i) => (
                    <button key={i} onClick={() => sendMessage(p)}
                      style={{ padding: "12px 18px", background: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", color: "#94a3b8", fontSize: "13px", cursor: "pointer", textAlign: "left", fontFamily: "'DM Sans', sans-serif" }}
                      onMouseEnter={e => { e.target.style.borderColor = "#334155"; e.target.style.color = "#e2e8f0"; e.target.style.background = "#1e293b"; }}
                      onMouseLeave={e => { e.target.style.borderColor = "#1e293b"; e.target.style.color = "#94a3b8"; e.target.style.background = "#0f172a"; }}
                    >
                      <span style={{ color: "#475569", marginRight: "10px", fontFamily: "'DM Mono', monospace", fontSize: "11px" }}>{String(i + 1).padStart(2, "0")}</span>{p}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((msg, i) => <div key={i} style={{ animation: "float-in 0.3s ease" }}><MessageBubble msg={msg} /></div>)}
            {loading && (
              <div style={{ display: "flex", gap: "10px", marginBottom: "16px", alignItems: "center" }}>
                <div style={{ width: "34px", height: "34px", borderRadius: "50%", background: "linear-gradient(135deg,#0ea5e9,#06b6d4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px" }}>🦉</div>
                <div style={{ padding: "12px 20px", background: "#0f172a", border: "1px solid #1e3a5f", borderRadius: "4px 16px 16px 16px", display: "flex", gap: "5px", alignItems: "center" }}>
                  {[0,1,2].map(d => <div key={d} style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#0ea5e9", animation: `pulse-glow 1.2s ease-in-out infinite ${d * 0.2}s` }} />)}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {messages.length > 2 && <div style={{ padding: "0 24px" }}><HintPanel hints={hints} onRequestHint={requestHint} loading={loading} /></div>}

          <div style={{ padding: "16px 24px 20px", borderTop: "1px solid #1e293b", background: "#020817" }}>
            <div style={{ display: "flex", gap: "10px", background: "#0f172a", border: "1px solid #1e293b", borderRadius: "14px", padding: "10px 14px", alignItems: "flex-end" }}>
              <textarea value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
                placeholder="Share your thinking, show your work, or ask for guidance…" rows={1}
                style={{ flex: 1, background: "transparent", border: "none", color: "#e2e8f0", fontSize: "14px", lineHeight: "1.6", fontFamily: "'DM Sans', sans-serif", maxHeight: "120px", overflowY: "auto" }}
              />
              <button onClick={() => sendMessage(input)} disabled={loading || !input.trim()}
                style={{ padding: "8px 18px", background: loading || !input.trim() ? "#1e293b" : "linear-gradient(135deg,#0ea5e9,#7c3aed)", border: "none", borderRadius: "8px", color: loading || !input.trim() ? "#475569" : "#fff", fontSize: "13px", cursor: loading || !input.trim() ? "not-allowed" : "pointer", fontFamily: "'DM Mono', monospace", flexShrink: 0 }}>
                Send →
              </button>
            </div>
            <div style={{ textAlign: "center", marginTop: "8px", fontSize: "11px", color: "#334155", fontFamily: "'DM Mono', monospace" }}>Menya guides reasoning — never gives direct answers</div>
          </div>
        </div>

        <div style={{ width: "300px", borderLeft: "1px solid #1e293b", display: "flex", flexDirection: "column", background: "#030d1a", overflowY: "auto", flexShrink: 0 }}>
          <div style={{ display: "flex", borderBottom: "1px solid #1e293b", background: "#020817", position: "sticky", top: 0, zIndex: 10 }}>
            {["reasoning","mastery","analytics"].map(tab => (
              <button key={tab} onClick={() => setSideTab(tab)}
                style={{ flex: 1, padding: "12px 0", background: "transparent", border: "none", borderBottom: `2px solid ${activeTab === tab ? "#0ea5e9" : "transparent"}`, color: activeTab === tab ? "#7dd3fc" : "#475569", fontSize: "10px", cursor: "pointer", fontFamily: "'DM Mono', monospace", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                {tab}
              </button>
            ))}
          </div>
          <div style={{ padding: "16px" }}>
            {activeTab === "reasoning" && (
              <div>
                <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "12px", fontFamily: "'DM Mono', monospace" }}>Reasoning Graph</div>
                {reasoningGraph.length === 0
                  ? <div style={{ color: "#334155", fontSize: "13px", textAlign: "center", padding: "20px 0", lineHeight: "1.7" }}>Your reasoning steps will appear here as you work through problems.</div>
                  : reasoningGraph.map((node, i) => <ReasoningNode key={i} node={node} index={i} />)
                }
                <div style={{ marginTop: "20px", padding: "12px", background: "#0f172a", border: "1px solid #1e293b", borderRadius: "10px" }}>
                  <div style={{ fontSize: "10px", color: "#475569", fontFamily: "'DM Mono', monospace", marginBottom: "8px" }}>LEGEND</div>
                  {[["concept","#4ade80","Concept"],["formula","#60a5fa","Formula"],["step","#f59e0b","Logic Step"],["assumption","#c084fc","Assumption"],["misconception","#f87171","Misconception"]].map(([t,c,l]) => (
                    <div key={t} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                      <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: c }} />
                      <span style={{ fontSize: "12px", color: "#64748b" }}>{l}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {activeTab === "mastery" && (
              <div>
                <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "16px", fontFamily: "'DM Mono', monospace" }}>Concept Mastery Model</div>
                {Object.entries(subjectGroups).map(([subj, concepts]) => (
                  <div key={subj} style={{ marginBottom: "20px" }}>
                    <div style={{ fontSize: "10px", color: "#475569", fontFamily: "'DM Mono', monospace", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "10px", paddingBottom: "6px", borderBottom: "1px solid #1e293b" }}>{subj}</div>
                    {concepts.map(([concept, data]) => <MasteryBar key={concept} concept={concept} data={data} />)}
                  </div>
                ))}
              </div>
            )}
            {activeTab === "analytics" && (
              <div>
                <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "12px", fontFamily: "'DM Mono', monospace" }}>Learning Analytics</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  {[["Messages", analytics.totalMessages, "#60a5fa"],["Hints Used", analytics.hintsUsed, "#f59e0b"],["Concepts", analytics.conceptsIdentified, "#4ade80"],["Misconceptions", analytics.misconceptionsDetected, "#f87171"]].map(([l,v,c]) => (
                    <div key={l} style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "10px", padding: "12px", textAlign: "center" }}>
                      <div style={{ fontSize: "22px", fontFamily: "'DM Mono', monospace", color: c, fontWeight: "700" }}>{v}</div>
                      <div style={{ fontSize: "10px", color: "#475569", marginTop: "2px" }}>{l}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: "16px", padding: "14px", background: "#0f172a", border: "1px solid #1e293b", borderRadius: "10px", fontSize: "13px", color: "#94a3b8", lineHeight: "1.7" }}>
                  {analytics.totalMessages === 0
                    ? <span style={{ color: "#334155" }}>Start a problem to generate your learning report.</span>
                    : <>You've worked through <span style={{ color: "#60a5fa" }}>{analytics.totalMessages}</span> exchanges, identified <span style={{ color: "#4ade80" }}>{analytics.conceptsIdentified}</span> concepts, and used <span style={{ color: "#f59e0b" }}>{analytics.hintsUsed}</span> hints.{analytics.misconceptionsDetected > 0 && <> <span style={{ color: "#f87171" }}>{analytics.misconceptionsDetected}</span> misconceptions were caught.</>}</>
                  }
                </div>
                <div style={{ marginTop: "12px", padding: "12px", background: "#0f2a1a", border: "1px solid #166534", borderRadius: "10px", fontSize: "12px", color: "#4ade80", textAlign: "center" }}>
                  ✓ Powered by Groq · LLaMA 3.3 70B · Free · 14,400 req/day
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
