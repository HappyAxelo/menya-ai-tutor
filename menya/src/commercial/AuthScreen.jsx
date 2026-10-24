import { useState } from "react";
import { supabase } from "../lib/backend.js";
import { C, mono, serif, Button, Field, inputStyle, Notice } from "./ui.jsx";

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
      <div style={{ fontSize: "11px", color: C.amber, fontFamily: mono, marginBottom: "8px", textAlign: "center" }}>LOCAL DEMO BACKEND</div>
      {DEMO_USERS.map(u => (
        <Button key={u.id} variant="ghost" onClick={() => signIn(u)} style={{ width: "100%", marginBottom: "8px" }}>Sign in as {u.label}</Button>
      ))}
    </div>
  );
}

// Passwordless sign-in: Supabase emails a one-time link. No passwords are
// stored by Menya.
export default function AuthScreen({ inviteToken }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState("idle"); // idle | sending | sent | error
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { setError("Please enter a valid email address."); return; }
    setState("sending"); setError("");
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin + window.location.pathname },
    });
    if (err) { setState("error"); setError("We couldn't send the sign-in link. Please try again in a minute."); }
    else setState("sent");
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
      <div style={{ background: C.panel2, border: "1px solid #1e3a5f", borderRadius: "20px", padding: "32px", maxWidth: "440px", width: "100%", boxShadow: "0 0 60px #0ea5e922" }}>
        <h1 style={{ fontFamily: serif, fontSize: "26px", textAlign: "center", marginBottom: "8px", background: "linear-gradient(135deg,#7dd3fc,#c084fc)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Welcome to Menya</h1>
        <p style={{ color: C.dim, fontSize: "14px", lineHeight: 1.7, textAlign: "center", marginBottom: "22px" }}>
          A tutor that helps you understand, one accurate hint at a time — in your language.
        </p>
        {inviteToken && <Notice kind="info">You've been invited to join your institution on Menya. Sign in with the email address the invitation was sent to.</Notice>}
        {state === "sent" ? (
          <Notice kind="ok">Check your inbox: we sent a sign-in link to <strong>{email}</strong>. You can close this tab after clicking it.</Notice>
        ) : (
          <form onSubmit={submit} noValidate>
            <Field label="EMAIL ADDRESS">
              <input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@university.edu" style={inputStyle} />
            </Field>
            {error && <Notice kind="error">{error}</Notice>}
            <Button type="submit" disabled={state === "sending" || !email.trim()} style={{ width: "100%" }}>
              {state === "sending" ? "Sending link…" : "Email me a sign-in link"}
            </Button>
          </form>
        )}
        <p style={{ marginTop: "18px", fontSize: "11px", color: C.faint, textAlign: "center", lineHeight: 1.6, fontFamily: mono }}>
          Free plan included. No card needed.
        </p>
        {LOCAL_DEMO && <LocalDemoLogin />}
      </div>
    </div>
  );
}
