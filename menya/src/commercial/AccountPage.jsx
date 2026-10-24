import { useEffect, useState } from "react";
import { api, listSessions, deleteSession, downloadWithAuth, supabase } from "../lib/backend.js";
import { C, mono, Page, Card, Button, Meter, Notice, Loading, Field, inputStyle, Table } from "./ui.jsx";

const PLAN_NAMES = { free: "Free", pro: "Pro", professional: "Professional" };
const STATUS_TEXT = {
  active: "Active", trialing: "Trial", past_due: "Payment failed — retrying", canceled: "Canceled",
  expired: "Expired", refunded: "Refunded", incomplete: "Payment not completed",
};

export default function AccountPage({ account, email, onBack, onPricing, refresh }) {
  const [sessions, setSessions] = useState(null);
  const [confirmText, setConfirmText] = useState("");
  const [msg, setMsg] = useState(null);

  useEffect(() => { listSessions().then(setSessions).catch(() => setSessions([])); }, []);

  if (!account) return <Page title="Your account" onBack={onBack}><Loading /></Page>;
  const { limits, used } = account;
  const periodEnd = account.period_end ? new Date(account.period_end).toLocaleDateString() : null;

  const removeSession = async (id) => {
    await deleteSession(id);
    setSessions(s => s.filter(x => x.id !== id));
  };

  const deleteAccount = async () => {
    const r = await api("/account", { method: "DELETE" });
    if (r.ok) { await supabase.auth.signOut(); window.location.reload(); }
    else setMsg({ kind: "error", text: "We couldn't delete your account. Please try again or contact support." });
  };

  return (
    <Page title="Your account" subtitle={email} onBack={onBack}>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      <Card title="Plan">
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "12px", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: "20px", fontWeight: 600 }}>{PLAN_NAMES[account.plan] ?? account.plan}</div>
            <div style={{ fontSize: "13px", color: C.dim, marginTop: "4px", lineHeight: 1.6 }}>
              {account.source === "organization" && "Provided by your institution. "}
              {account.subscription_status && `${STATUS_TEXT[account.subscription_status] ?? account.subscription_status}. `}
              {periodEnd && (account.cancel_at_period_end || account.subscription_status === "canceled"
                ? `Access continues until ${periodEnd}, then returns to Free.`
                : account.subscription_status === "past_due" ? `Please update your payment details before ${periodEnd}.`
                : `Renews on ${periodEnd}.`)}
            </div>
          </div>
          {account.source !== "organization" && <Button variant="ghost" onClick={onPricing}>{account.plan === "free" ? "See paid plans" : "Change plan"}</Button>}
        </div>
      </Card>

      <Card title="Usage">
        <Meter label="Messages today" used={used.daily} limit={limits.daily} />
        <Meter label="Messages this month" used={used.monthly} limit={limits.monthly} />
        <Meter label="Advanced reasoning this month" used={used.premium} limit={limits.premium} color={C.violet} />
        <div style={{ fontSize: "12px", color: C.faint, fontFamily: mono }}>Daily allowance resets at 00:00 UTC. Sessions hold up to {limits.session_turns} exchanges.</div>
        <button onClick={refresh} style={{ marginTop: "8px", background: "none", border: "none", color: C.accent, cursor: "pointer", fontSize: "12px", fontFamily: mono, padding: 0 }}>Refresh</button>
      </Card>

      <Card title="Recent sessions">
        {!sessions ? <Loading /> : (
          <Table empty="Your tutoring sessions will appear here."
            columns={[
              { key: "title", label: "PROBLEM", wrap: true, render: s => s.title || "Untitled" },
              { key: "turn_count", label: "EXCHANGES", align: "right" },
              { key: "hints_used", label: "HINTS", align: "right" },
              { key: "updated_at", label: "LAST ACTIVE", render: s => new Date(s.updated_at).toLocaleDateString() },
              { key: "x", label: "", render: s => <button onClick={() => removeSession(s.id)} aria-label={`Delete session ${s.title}`} style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: "12px" }}>Delete</button> },
            ]}
            rows={sessions} />
        )}
      </Card>

      <Card title="Your data">
        <p style={{ fontSize: "13px", color: C.muted, lineHeight: 1.7, marginBottom: "12px" }}>
          Download everything Menya stores about you, or delete your account. Deleting removes your profile, sessions and messages; anonymous usage counts are kept for billing records.
        </p>
        <Button variant="ghost" onClick={() => downloadWithAuth("/account/export", "menya-data.json").catch(e => setMsg({ kind: "error", text: e.message }))}>Download my data</Button>
        <div style={{ marginTop: "18px", maxWidth: "360px" }}>
          <Field label='TYPE "DELETE" TO CONFIRM ACCOUNT DELETION'>
            <input value={confirmText} onChange={e => setConfirmText(e.target.value)} style={inputStyle} />
          </Field>
          <Button variant="danger" disabled={confirmText !== "DELETE"} onClick={deleteAccount}>Delete my account</Button>
        </div>
      </Card>
    </Page>
  );
}
