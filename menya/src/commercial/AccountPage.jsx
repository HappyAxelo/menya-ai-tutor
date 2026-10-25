import { useEffect, useState } from "react";
import { api, listSessions, deleteSession, downloadWithAuth, supabase } from "../lib/backend.js";
import { C, Page, Card, Button, Meter, Notice, Loading, Field, inputStyle, Table } from "./ui.jsx";

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

  const removeSession = async (s) => {
    if (!confirm(`Delete "${s.title || "Untitled"}"? This can't be undone. Problems you solved stay in your progress.`)) return;
    try { await deleteSession(s.id); setSessions(list => list.filter(x => x.id !== s.id)); }
    catch { setMsg({ kind: "error", text: "Couldn't delete that conversation. Please try again." }); }
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
        <p className="mn-panel-text small">The daily allowance resets at 00:00 UTC. A conversation can hold up to {limits.session_turns} exchanges.</p>
        <button onClick={refresh} className="mn-btn outline" style={{ marginTop: 8 }}>Refresh</button>
      </Card>

      <Card title="Recent conversations">
        {!sessions ? <Loading /> : (
          <Table empty="No conversations yet. They appear here after your first question."
            columns={[
              { key: "title", label: "Problem", wrap: true, render: s => s.title || "Untitled" },
              { key: "turn_count", label: "Exchanges", align: "right" },
              { key: "hints_used", label: "Hints", align: "right" },
              { key: "updated_at", label: "Last active", render: s => new Date(s.updated_at).toLocaleDateString() },
              { key: "x", label: "", render: s => <button onClick={() => removeSession(s)} aria-label={`Delete conversation ${s.title}`} className="mn-link danger">Delete</button> },
            ]}
            rows={sessions} />
        )}
      </Card>

      <Card title="Your data">
        <p className="mn-panel-text">
          Download everything Menya stores about you, or delete your account. Deleting removes your profile, conversations and progress. Usage counts without your identity are kept for billing records. Messages are deleted automatically after 180 days.
        </p>
        <Button variant="ghost" onClick={() => downloadWithAuth("/account/export", "menya-data.json").catch(e => setMsg({ kind: "error", text: e.message }))}>Download my data</Button>
        <div style={{ marginTop: "18px", maxWidth: "360px" }}>
          <Field label='Type "DELETE" to confirm account deletion'>
            <input value={confirmText} onChange={e => setConfirmText(e.target.value)} style={inputStyle} />
          </Field>
          <Button variant="danger" disabled={confirmText !== "DELETE"} onClick={deleteAccount}>Delete my account</Button>
        </div>
      </Card>
    </Page>
  );
}
