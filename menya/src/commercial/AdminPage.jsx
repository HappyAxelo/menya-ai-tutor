import { useCallback, useEffect, useState } from "react";
import { api, downloadWithAuth } from "../lib/backend.js";
import { C, mono, Page, Card, Button, Notice, Loading, Field, inputStyle, Table } from "./ui.jsx";

// Platform administration. Every action here is re-authorised by the
// server (is_platform_admin) and audited; this page only displays results.
export default function AdminPage({ onBack }) {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [econ, setEcon] = useState(null);
  const [alerts, setAlerts] = useState(null);
  const [health, setHealth] = useState(null);
  const [config, setConfig] = useState(null);
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState(null);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    const m = `${month}-01`;
    const [e, a, h, c, o] = await Promise.all([api(`/admin/economics?month=${m}`), api("/admin/alerts"), api("/admin/health"), api("/admin/config"), api("/admin/overview")]);
    if (e.status === 403) { setMsg({ kind: "error", text: "Administrator access required." }); return; }
    setEcon(e.data.rows); setAlerts(a.data); setHealth(h.data.providers); setConfig(c.data); setOverview(o.ok ? o.data : null);
  }, [month]);
  useEffect(() => { load(); }, [load]);

  const searchUsers = async () => {
    const r = await api(`/admin/users?q=${encodeURIComponent(q)}`);
    setUsers(r.ok ? r.data.users : []);
  };

  const grant = async (user) => {
    const plan = prompt("Grant which plan? (pro or professional)", "pro");
    if (!plan) return;
    const days = Number(prompt("For how many days?", "30"));
    const note = prompt("Reason (stored in the audit log)", "") ?? "";
    const r = await api("/admin/grant", { method: "POST", body: { user, plan, days, note } });
    setMsg(r.ok ? { kind: "ok", text: `Granted ${plan} for ${days} days.` } : { kind: "error", text: r.data.error ?? "Grant failed." });
    searchUsers();
  };

  const savePlan = async (planId, field, value) => {
    const r = await api("/admin/plan", { method: "POST", body: { plan: planId, changes: { [field]: value === "" ? null : Number(value) } } });
    setMsg(r.ok ? { kind: "ok", text: `Updated ${planId}.${field}.` } : { kind: "error", text: r.data.error ?? "Update failed." });
    load();
  };

  const toggleModel = async (role, enabled) => {
    const r = await api("/admin/model", { method: "POST", body: { role, changes: { enabled } } });
    setMsg(r.ok ? { kind: "ok", text: `${role} ${enabled ? "enabled" : "disabled"}.` } : { kind: "error", text: r.data.error ?? "Update failed." });
    load();
  };

  const usd = v => v == null ? "—" : `$${Number(v).toFixed(2)}`;

  return (
    <Page title="Administration" subtitle="Usage, estimated costs, revenue estimates and gross margin by plan. Costs are estimates from provider-reported tokens × configured prices; revenue is estimated from plan prices until a payment provider is live." onBack={onBack}>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", marginBottom: "16px" }}>
        <input type="month" value={month} onChange={e => setMonth(e.target.value)} style={{ ...inputStyle, width: "auto" }} />
        <Button variant="ghost" onClick={() => downloadWithAuth(`/admin/export?month=${month}-01`, `menya-economics-${month}.csv`).catch(e => setMsg({ kind: "error", text: e.message }))}>Export CSV</Button>
      </div>

      <Card title="Learners and feedback">
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center", marginBottom: "12px" }}>
          <Button onClick={() => downloadWithAuth("/admin/analytics.xlsx", `menya-analytics-${new Date().toISOString().slice(0, 10)}.xlsx`).catch(e => setMsg({ kind: "error", text: e.message }))}>Download Excel (learners + feedback)</Button>
          <span style={{ fontSize: "12px", color: C.faint }}>Sheets: Summary by plan, every learner with plan and activity, every Bad / Fair / Good rating with the question and reply.</span>
        </div>
        {!overview ? <Loading /> : (
          <>
            <Table rows={[...overview.by_plan, { plan_id: "All plans", users: overview.users_total }]} columns={[
              { key: "plan_id", label: "Plan", render: p => <b>{p.plan_id}</b> }, { key: "users", label: "Learners", align: "right" },
              { key: "via_institution", label: "Via institution", align: "right" }, { key: "active_7d", label: "Active 7 d", align: "right" },
              { key: "active_30d", label: "Active 30 d", align: "right" }, { key: "new_30d", label: "New 30 d", align: "right" },
            ]} />
            <div style={{ fontSize: "13px", color: C.muted, lineHeight: 1.9, fontFamily: mono, marginTop: "12px" }}>
              Last 30 days: {overview.sessions_30d} conversations · {overview.requests_30d} tutor replies · {overview.verified_solves_30d} verified solves ({overview.independent_solves_30d} with no hints or examples)<br />
              {(() => { const f = overview.feedback, n = f.good + f.fair + f.bad, pct = x => n ? Math.round((x / n) * 100) : 0;
                return `Feedback: ${n} ratings · Good ${f.good} (${pct(f.good)}%) · Fair ${f.fair} (${pct(f.fair)}%) · Bad ${f.bad} (${pct(f.bad)}%)`; })()}
            </div>
          </>
        )}
      </Card>

      {alerts && (
        <Card title="Alerts">
          {Number(alerts.month_ai_cost_usd) > Number(alerts.month_budget_usd) && <Notice kind="warn">AI spend this month ({usd(alerts.month_ai_cost_usd)}) is above the budget ({usd(alerts.month_budget_usd)}).</Notice>}
          <div style={{ fontSize: "13px", color: C.muted, lineHeight: 1.9, fontFamily: mono }}>
            AI spend this month: {usd(alerts.month_ai_cost_usd)} of {usd(alerts.month_budget_usd)} budget<br />
            Error rate (24h): {alerts.error_rate_24h ?? 0}% · p95 latency (24h): {alerts.p95_latency_ms_24h ? `${Math.round(alerts.p95_latency_ms_24h)} ms` : "—"}<br />
            Heavy users today: {alerts.heavy_users_today.length}
          </div>
        </Card>
      )}

      <Card title="Unit economics by plan">
        {!econ ? <Loading /> : (
          <Table rows={econ} columns={[
            { key: "plan_id", label: "Plan" }, { key: "paying_subscriptions", label: "Paying subs", align: "right" },
            { key: "active_users", label: "Active users", align: "right" }, { key: "requests", label: "Requests", align: "right" },
            { key: "premium_requests", label: "Premium", align: "right" },
            { key: "ai_cost_usd", label: "Ai cost (est.)", align: "right", render: r => usd(r.ai_cost_usd) },
            { key: "allocated_infra_usd", label: "Infra (alloc.)", align: "right", render: r => usd(r.allocated_infra_usd) },
            { key: "est_revenue_usd", label: "Revenue (est.)", align: "right", render: r => usd(r.est_revenue_usd) },
            { key: "gross_margin_pct", label: "Gross margin", align: "right", render: r => r.gross_margin_pct == null ? "—" : `${r.gross_margin_pct}%` },
          ]} />
        )}
        <div style={{ fontSize: "12px", color: C.faint, marginTop: "10px", lineHeight: 1.6 }}>
          Gross margin = (revenue − AI cost − allocated infrastructure − payment fees) ÷ revenue. Set infrastructure cost and payment fee % in app_settings from real invoices.
        </div>
      </Card>

      <Card title="Model providers">
        {!health ? <Loading /> : Object.keys(health).length === 0
          ? <Notice kind="warn">No provider credentials are configured on the server.</Notice>
          : <div style={{ fontFamily: mono, fontSize: "13px", lineHeight: 1.9 }}>{Object.entries(health).map(([n, h]) => <div key={n}><span style={{ color: h.ok ? C.green : C.red }}>●</span> {n} {h.detail ? `— ${h.detail}` : ""}</div>)}</div>}
        {config && (
          <div style={{ marginTop: "14px" }}>
            <Table rows={config.models} columns={[
              { key: "role", label: "Role" }, { key: "provider", label: "Provider" }, { key: "model", label: "Model" },
              { key: "is_premium", label: "Premium", render: m => m.is_premium ? "yes" : "" },
              { key: "price", label: "$ / M TOKENS (IN/OUT)", render: m => `${m.input_usd_per_mtok} / ${m.output_usd_per_mtok}` },
              { key: "fallback_role", label: "Fallback" },
              { key: "enabled", label: "", render: m => <button onClick={() => toggleModel(m.role, !m.enabled)} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "3px 10px", color: m.enabled ? C.green : C.muted, cursor: "pointer", fontSize: "12px" }}>{m.enabled ? "Enabled" : "Disabled"}</button> },
            ]} />
          </div>
        )}
      </Card>

      {config && (
        <Card title="Plan limits (edit and press Enter)">
          <Table rows={config.plans} columns={["daily_request_limit", "monthly_request_limit", "monthly_premium_limit", "premium_safety_margin", "requests_per_minute", "max_session_turns", "context_turns", "price_monthly_cents", "price_yearly_cents"]
            .reduce((cols, f) => [...cols, { key: f, label: f.replace(/_/g, " ").toUpperCase(), render: p => (
              <input defaultValue={p[f] ?? ""} aria-label={`${p.id} ${f}`} onKeyDown={e => e.key === "Enter" && savePlan(p.id, f, e.target.value)}
                style={{ ...inputStyle, width: "90px", padding: "4px 6px", fontSize: "12px", fontFamily: mono }} />) }], [{ key: "id", label: "Plan" }])} />
        </Card>
      )}

      <Card title="Users">
        <div style={{ display: "flex", gap: "8px", marginBottom: "12px", flexWrap: "wrap" }}>
          <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && searchUsers()} placeholder="Search by email" style={{ ...inputStyle, maxWidth: "320px" }} />
          <Button variant="ghost" onClick={searchUsers}>Search</Button>
        </div>
        {users && <Table rows={users} columns={[
          { key: "email", label: "Email" }, { key: "plan_id", label: "Plan" }, { key: "plan_source", label: "Source" },
          { key: "requests_this_month", label: "Req. (month)", align: "right" },
          { key: "cost_this_month", label: "Cost (month)", align: "right", render: u => usd(u.cost_this_month) },
          { key: "g", label: "", render: u => <button onClick={() => grant(u.user_id)} style={{ background: "none", border: "none", color: C.accent, cursor: "pointer", fontSize: "12px" }}>Grant access</button> },
        ]} />}
      </Card>

      {config && (
        <>
          <Card title="Institutions">
            <Table rows={config.organizations} columns={[{ key: "name", label: "Name" }, { key: "plan", label: "Plan" }, { key: "status", label: "Status" }, { key: "seats", label: "Seats", align: "right" }]} />
          </Card>
          <Card title="Quotation requests">
            <Table rows={config.recent_quotes} columns={[{ key: "institution", label: "Institution" }, { key: "contact_email", label: "Contact" }, { key: "learners", label: "Learners", align: "right" }, { key: "created_at", label: "Received", render: x => new Date(x.created_at).toLocaleDateString() }]} />
          </Card>
          <Card title="Billing webhooks">
            <div style={{ fontFamily: mono, fontSize: "13px", color: C.muted }}>Received (24h): {config.webhooks.last_24h} · Failed (7d): {config.webhooks.failed_7d}</div>
          </Card>
          <Card title="Audit log (latest)">
            <Table rows={config.recent_audit} columns={[{ key: "created_at", label: "When", render: a => new Date(a.created_at).toLocaleString() }, { key: "action", label: "Action" }, { key: "target_id", label: "Target" }, { key: "details", label: "Details", wrap: true, render: a => <code style={{ fontSize: "11px" }}>{JSON.stringify(a.details)}</code> }]} />
          </Card>
        </>
      )}
    </Page>
  );
}
