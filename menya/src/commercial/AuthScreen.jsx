import { useEffect, useState } from "react";
import { supabase } from "../lib/backend.js";
import { C, Button, Field, inputStyle, Notice } from "./ui.jsx";
import { BrandLockup } from "../Brand.jsx";
import { Globe } from "lucide-react";
import { useT } from "../i18n.js";
import { useSettings } from "../settings.js";
import { LANGUAGES } from "../tutor.js";

// Only when the app points at the local development backend
// (supabase/dev/local-server.ts). Never shown against a real Supabase project.
const LOCAL_DEMO = /^http:\/\/localhost(:\d+)?$/.test(import.meta.env.VITE_SUPABASE_URL ?? "");
const DEMO_USERS = [
  { label: "Demo learner", id: "00000000-0000-4000-8000-000000000001", email: "learner@menya.local" },
  { label: "Demo admin (platform + university)", id: "00000000-0000-4000-8000-000000000002", email: "admin@menya.local" },
];

function LocalDemoLogin() {
  const signIn = (u) => {
    const session = { access_token: `local_${u.id}`, refresh_token: "local", token_type: "bearer", expires_in: 86400,
      expires_at: Math.floor(Date.now() / 1000) + 86400,
      user: { id: u.id, email: u.email, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {} } };
    try { localStorage.setItem("sb-localhost-auth-token", JSON.stringify(session)); } catch { /* storage blocked */ }
    window.location.reload();
  };
  return (
    <div style={{ marginTop: "18px", paddingTop: "16px", borderTop: `1px solid ${C.border}` }}>
      <div style={{ fontSize: "12px", color: C.amber, marginBottom: "8px", textAlign: "center", fontWeight: 600 }}>Local demo backend</div>
      {DEMO_USERS.map(u => (
        <Button key={u.id} variant="ghost" onClick={() => signIn(u)} style={{ width: "100%", marginBottom: "8px" }}>Sign in as {u.label}</Button>
      ))}
    </div>
  );
}

const GOOGLE_ICON = (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/>
  </svg>
);

// Sign-in: Google (primary) or a one-time email link. No passwords and no
// API keys: the AI provider key is configured once by the owner, on the server.
export default function AuthScreen({ inviteToken }) {
  const { t } = useT();
  const [settings, update] = useSettings();
  const [email, setEmail] = useState("");
  const [state, setState] = useState("idle"); // idle | sending | sent | error
  const [error, setError] = useState(""); // a translation key
  const [showEmail, setShowEmail] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(null); // null = checking

  // Only offer Google once the owner has enabled it in Supabase Auth.
  useEffect(() => {
    const url = import.meta.env.VITE_SUPABASE_URL, key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } })
      .then(r => r.json()).then(d => setGoogleEnabled(Boolean(d?.external?.google)))
      .catch(() => setGoogleEnabled(false));
  }, []);
  const emailOpen = showEmail || googleEnabled === false;

  const google = async () => {
    setError("");
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + window.location.pathname },
    });
    if (err) setError("auth.googleFailed");
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { setError("auth.invalidEmail"); return; }
    setState("sending"); setError("");
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin + window.location.pathname },
    });
    if (err) { setState("error"); setError("auth.sendFailed"); }
    else setState("sent");
  };
  const [sentBefore, sentAfter] = t("auth.sent").split("{email}");

  return (
    <div className="mn-gate">
      <main className="mn-card">
        <label className="mn-auth-lang">
          <Globe size={14} aria-hidden="true" />
          <span className="mn-sr">{t("auth.language")}</span>
          <select value={settings.language} onChange={e => update({ language: e.target.value })} aria-label={t("auth.language")}>
            {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.code === "auto" ? t("lang.match") : l.label}</option>)}
          </select>
        </label>
        <BrandLockup tagline={false} />
        <h1 className="mn-auth-title">{t("auth.title")}</h1>
        <p className="sub">{t("auth.sub")}</p>
        {inviteToken && <Notice kind="info">{t("auth.invite")}</Notice>}
        {googleEnabled && <Button onClick={google} variant="ghost" style={{ width: "100%", height: "46px", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", fontSize: "14.5px", background: "#fff", color: "#1f1f1f", border: "1px solid #dadce0" }}>
          {GOOGLE_ICON} {t("auth.google")}
        </Button>}
        {error && !emailOpen && <div style={{ marginTop: "12px" }}><Notice kind="error">{t(error)}</Notice></div>}
        {googleEnabled && (
          <div style={{ display: "flex", alignItems: "center", gap: "10px", margin: "18px 0 14px", color: C.faint, fontSize: "12px" }}>
            <span style={{ flex: 1, height: "1px", background: C.border }} />{t("auth.or")}<span style={{ flex: 1, height: "1px", background: C.border }} />
          </div>
        )}
        {googleEnabled === null ? null : !emailOpen ? (
          <button onClick={() => setShowEmail(true)} style={{ display: "block", margin: "0 auto", background: "none", border: "none", color: C.accent, cursor: "pointer", fontSize: "13.5px" }}>
            {t("auth.emailInstead")}
          </button>
        ) : state === "sent" ? (
          <Notice kind="ok">{sentBefore}<strong>{email}</strong>{sentAfter}</Notice>
        ) : (
          <form onSubmit={submit} noValidate>
            <Field label={t("auth.emailLabel")}>
              <input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={t("auth.emailPlaceholder")} style={inputStyle} />
            </Field>
            {error && <Notice kind="error">{t(error)}</Notice>}
            <Button type="submit" disabled={state === "sending" || !email.trim()} style={{ width: "100%" }}>
              {state === "sending" ? t("auth.sending") : t("auth.sendLink")}
            </Button>
          </form>
        )}
        <p className="mn-fine">
          {t("auth.fine")}{" "}
          <a href={`${import.meta.env.BASE_URL}privacy.html`} target="_blank" rel="noopener noreferrer">{t("privacy")}</a>
        </p>
        {LOCAL_DEMO && <LocalDemoLogin />}
      </main>
    </div>
  );
}
