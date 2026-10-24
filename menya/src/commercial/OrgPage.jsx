import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/backend.js";
import { C, mono, Page, Card, Button, Notice, Loading, Field, inputStyle, Table } from "./ui.jsx";

// Institution administrators: seats, roster and aggregate learning analytics.
// Individual conversations are never shown here.
export default function OrgPage({ orgs, onBack }) {
  const [orgId, setOrgId] = useState(orgs[0]?.id);
  const [dash, setDash] = useState(null);
  const [roster, setRoster] = useState(null);
  const [error, setError] = useState(null);
  const [inviteText, setInviteText] = useState("");
  const [invited, setInvited] = useState(null);

  const load = useCallback(async () => {
    if (!orgId) return;
    setError(null);
    const [d, r] = await Promise.all([api(`/org/dashboard?org=${orgId}`), api(`/org/roster?org=${orgId}`)]);
    if (!d.ok || !r.ok) { setError("Couldn't load your institution's data."); return; }
    setDash(d.data); setRoster(r.data.members);
  }, [orgId]);
  useEffect(() => { load(); }, [load]);

  const invite = async () => {
    setInvited(null);
    const r = await api("/org/invite", { method: "POST", body: { org: orgId, csv: inviteText } });
    if (!r.ok) { setError(r.data.message ?? "Invitations failed."); return; }
    setInvited(r.data.invited); setInviteText(""); load();
  };

  const setSeat = async (user, assigned) => {
    const r = await api("/org/seat", { method: "POST", body: { org: orgId, user, assigned } });
    if (!r.ok) setError(r.data.error === "no_seats_available" ? "All purchased seats are assigned." : "Couldn't change the seat.");
    load();
  };

  if (!orgs.length) return <Page title="Institution" onBack={onBack}><Notice>You are not an administrator of any institution.</Notice></Page>;

  return (
    <Page title={dash?.organization?.name ?? "Institution"} subtitle="Seats, enrolment and aggregate learning activity for your institution." onBack={onBack}>
      {orgs.length > 1 && (
        <select value={orgId} onChange={e => setOrgId(e.target.value)} style={{ ...inputStyle, maxWidth: "320px", marginBottom: "16px" }}>
          {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      )}
      {error && <Notice kind="error">{error}</Notice>}
      {!dash ? <Loading /> : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "12px", marginBottom: "16px" }}>
            {[["Purchased seats", dash.seats.purchased], ["Assigned seats", dash.seats.assigned], ["Monthly active learners", dash.usage.monthly_active_learners],
              ["Tutor messages this month", dash.usage.requests], ["Pending invitations", dash.seats.pending_invitations], ["Misconceptions caught", dash.misconceptions_caught]].map(([l, v]) => (
              <Card key={l} style={{ marginBottom: 0, textAlign: "center" }}>
                <div style={{ fontSize: "24px", fontFamily: mono, color: C.accent }}>{v ?? 0}</div>
                <div style={{ fontSize: "12px", color: C.dim, marginTop: "4px" }}>{l}</div>
              </Card>
            ))}
          </div>
          {dash.usage.pool_limit != null && <Notice kind="info">Shared monthly allowance: {dash.usage.requests} of {dash.usage.pool_limit} used.</Notice>}

          <Card title="What learners are working on (this month)">
            {dash.top_concepts.length === 0 ? <div style={{ color: C.faint, fontSize: "13px" }}>No activity yet.</div> : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {dash.top_concepts.map(c => <span key={c.concept} style={{ padding: "4px 10px", background: "var(--accent-soft)", border: "1px solid var(--border)", borderRadius: "12px", fontSize: "12px", color: C.accent }}>{c.concept} · {c.count}</span>)}
              </div>
            )}
          </Card>

          <Card title="Invite learners">
            <Field label="EMAILS (ONE PER LINE, OR PASTE A CSV WITH AN 'EMAIL' COLUMN)">
              <textarea rows={4} value={inviteText} onChange={e => setInviteText(e.target.value)} style={{ ...inputStyle, fontFamily: mono, fontSize: "12px" }} placeholder={"student1@university.edu\nstudent2@university.edu"} />
            </Field>
            <Button onClick={invite} disabled={!inviteText.trim()}>Send invitations</Button>
            {invited && (
              <div style={{ marginTop: "14px" }}>
                {invited.some(i => !i.emailed) && <Notice kind="warn">Email delivery isn't configured yet. Share each personal link below with its learner; links expire in 14 days and work only for that email address.</Notice>}
                <Table columns={[{ key: "email", label: "EMAIL" }, { key: "link", label: "INVITATION", wrap: true, render: i => i.emailed ? "Emailed" : <code style={{ fontSize: "11px", wordBreak: "break-all" }}>{i.link}</code> }]} rows={invited} />
              </div>
            )}
          </Card>

          <Card title="Roster">
            <Table empty="No members yet." rows={roster}
              columns={[
                { key: "email", label: "EMAIL" },
                { key: "role", label: "ROLE", render: m => m.role === "org_admin" ? "Admin" : "Learner" },
                { key: "requests_this_month", label: "MESSAGES (MONTH)", align: "right" },
                { key: "last_active", label: "LAST ACTIVE", render: m => m.last_active ? new Date(m.last_active).toLocaleDateString() : "—" },
                { key: "seat", label: "SEAT", render: m => (
                  <button onClick={() => setSeat(m.user_id, !m.seat_assigned)} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "3px 10px", color: m.seat_assigned ? C.green : C.muted, cursor: "pointer", fontSize: "12px" }}>
                    {m.seat_assigned ? "Assigned" : "Assign seat"}
                  </button>) },
              ]} />
          </Card>
        </>
      )}
    </Page>
  );
}
