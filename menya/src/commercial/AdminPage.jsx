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
  const [billing, setBilling] = useState(null);
  const [retention, setRetention] = useState(null);
  const [revenue, setRevenue] = useState(null);
  const [users, setUsers] = useState(null);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    const m = `${month}-01`;
    const [e, a, h, c, o, b, rt, rv] = await Promise.all([api(`/admin/economics?month=${m}`), api("/admin/alerts"), api("/admin/health"), api("/admin/config"), api("/admin/overview"), api("/admin/billing"), api("/admin/retention"), api("/admin/revenue")]);
    if (e.status === 403) { setMsg({ kind: "error", text: "Administrator access required." }); return; }
    setEcon(e.data.rows); setAlerts(a.data); setHealth(h.data.providers); setConfig(c.data); setOverview(o.ok ? o.data : null); setBilling(b.ok ? b.data : null); setRetention(rt.ok ? rt.data : null); setRevenue(rv.ok ? rv.data : null);
  }, [month]);
  useEffect(() => { load(); }, [load]);

  const searchUsers = async () => {
    const r = await api(`/admin/users?q=${encodeURIComponent(q)}`);
    setUsers(r.ok ? r.data.users : []);
  };

  const grant = async (user) => {
    const plan = prompt("Grant which plan? (pro, exam, or professional for Max)", "pro");
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

      <Card title="Sign-ups and guests">
        <SignupsView />
      </Card>

      <Card title="Subscribers and revenue">
        {!revenue ? <Loading /> : <RevenueView r={revenue} />}
      </Card>

      <Card title="Retention and learning">
        {!retention ? <Loading /> : <RetentionView r={retention} />}
      </Card>

      <Card title="Payments (IremboPay setup check)">
        {!billing ? <Loading /> : (
          <>
            <div style={{ fontFamily: mono, fontSize: "13px", lineHeight: 1.9 }}>
              <span style={{ color: billing.provider ? C.green : C.muted }}>●</span>{" "}
              {billing.provider ? `${billing.provider} — ${billing.mode === "production" ? "PRODUCTION (real money)" : "sandbox (test payments only)"}` : "Online payment is off (BILLING_PROVIDER not set). Learners see “email us”."}
            </div>
            {billing.problems.map(p => <Notice key={p} kind="warn">{p}</Notice>)}
            <Table rows={billing.rows} columns={[
              { key: "plan", label: "Plan" }, { key: "interval", label: "Period" },
              { key: "price", label: "Menya price", align: "right", render: r => `${(r.price_cents / 100).toFixed(2)} ${r.currency}` },
              { key: "product_code", label: "IremboPay product" },
              { key: "amount", label: "Charged", align: "right" },
              { key: "payable", label: "", render: r => <span style={{ color: r.payable ? C.green : C.red }}>{r.payable ? "can be paid" : "not set up"}</span> },
            ]} />
            <div style={{ fontSize: "12px", color: C.muted, marginTop: "8px" }}>
              “Charged” is in the currency of your IremboPay payment account (RWF for a RWF account). Webhook URL to give IremboPay: <code>https://tgrihnmngbamxxjnedlc.supabase.co/functions/v1/api/billing/webhook</code>
            </div>
          </>
        )}
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
          <Table rows={config.plans} columns={["daily_image_limit", "material_limit", "daily_exam_limit", "daily_request_limit", "monthly_request_limit", "monthly_premium_limit", "premium_safety_margin", "requests_per_minute", "max_session_turns", "context_turns", "price_monthly_cents", "price_semester_cents", "price_yearly_cents", "price_two_weeks_cents"]
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

// Learning behaviour, not clicks: activity means a tutor reply or a server-marked answer.
const pct = (a, b) => (b > 0 ? `${Math.round((100 * a) / b)}%` : "—");
function RetentionView({ r }) {
  const rows = [
    ["Learners", r.users, `${r.signups_30d} new in 30 days`],
    ["Activated", pct(r.activation.activated, r.activation.eligible), `${r.activation.activated} of ${r.activation.eligible}: active within 7 days of signing up`],
    ["Day-1 retention", pct(r.d1.retained, r.d1.eligible), `${r.d1.retained} of ${r.d1.eligible}: active the day after signing up`],
    ["Day-7 retention", pct(r.d7.retained, r.d7.eligible), `${r.d7.retained} of ${r.d7.eligible}: active during days 7–13`],
    ["Day-30 retention", pct(r.d30.retained, r.d30.eligible), `${r.d30.retained} of ${r.d30.eligible}: active during days 30–59`],
    ["Weekly / monthly active", `${r.wal} / ${r.mal}`, "learners active in the last 7 / 30 days"],
    ["Independent success (30 days)", pct(r.independent_30d.correct, r.independent_30d.total), `${r.independent_30d.correct} of ${r.independent_30d.total} unseen questions solved without hints`],
    ["Retained after a delay", pct(r.delayed_retention.topics_retained_after_delay, r.delayed_retention.topics_with_independent), "topics solved alone again 2+ days later"],
    ["Topics mastered", r.topics_mastered, `${r.topics_mastered_30d} in the last 30 days`],
    ["Reviews done / overdue", `${r.reviews_done_30d} / ${r.reviews_overdue}`, "reviews answered in 30 days / topics more than 3 days overdue now"],
    ["Practice exams (30 days)", r.practice_exams_30d, "submitted"],
    ["Paid learners / lapsed", `${r.paid_users} / ${r.lapsed_30d}`, "live paid plans / paid plans that ended in 30 days without renewal"],
    ["AI cost (30 days)", `$${Number(r.ai_cost_30d_usd).toFixed(2)}`, r.ai_cost_per_active_learner_usd != null ? `$${Number(r.ai_cost_per_active_learner_usd).toFixed(4)} per monthly active learner` : ""],
  ];
  return (
    <>
      <Table rows={rows.map(([label, value, note]) => ({ label, value, note }))} columns={[
        { key: "label", label: "Measure" }, { key: "value", label: "Value", align: "right" }, { key: "note", label: "Meaning", wrap: true },
      ]} />
      <div style={{ fontSize: "12px", color: C.muted, marginTop: "8px" }}>Small numbers swing a lot: read percentages together with the counts. Gross margin per plan is in "Unit economics by plan".</div>
    </>
  );
}

// Money from payment records only. Amounts stay in the currency they were paid in.
const moneyList = (rows) => (rows?.length ? rows.map(x => `${Number(x.amount).toLocaleString()} ${x.currency ?? ""}`).join(" + ") : "0");
function RevenueView({ r }) {
  const rows = [
    ...r.subscribers_by_plan.map(p => [`${p.name} subscribers`, p.paying, p.granted ? `plus ${p.granted} granted by hand` : "paid and active now"]),
    ["Monthly plan payments (30 days)", moneyList(r.monthly_plan_revenue_30d), "actual payments for monthly plans. Each is one month: nothing renews by itself"],
    ["All revenue (30 days)", moneyList(r.revenue_30d), "every confirmed payment, before IremboPay's fees"],
    ["Exam Pass sales (30 days)", r.exam_pass_sales_30d, ""],
    ["New / renewals (30 days)", `${r.new_subscriptions_30d} / ${r.renewals_30d}`, "first-ever payment / paid again for the same plan"],
    ["Expired (30 days)", r.expired_30d, "paid plan ended, nothing active now"],
    ["Failed or cancelled / pending", `${r.failed_payments_30d} / ${r.pending_payments}`, "failed or cancelled in 30 days / checkouts open now"],
    ["Conversion", r.conversion.users ? `${Math.round((100 * r.conversion.ever_paid) / r.conversion.users)}%` : "—", `${r.conversion.ever_paid} of ${r.conversion.users} learners have ever paid`],
    ["AI requests today / this month", `${r.ai.requests_today} / ${r.ai.requests_month}`, `${Number(r.ai.tokens_month).toLocaleString()} tokens this month`],
    ["AI cost this month", `$${Number(r.ai.cost_month_usd).toFixed(2)}`, r.ai.cost_per_subscriber_usd != null ? `$${Number(r.ai.cost_per_subscriber_usd).toFixed(4)} per paying subscriber` : "estimate from provider tokens × configured prices"],
    ["Voice / photos / pictures today", `${r.media_today.transcribe ?? 0} / ${r.media_today.read_image ?? 0} / ${r.media_today.diagram ?? 0}`, "counts only; these aren't priced yet"],
  ];
  return (
    <>
      <Table rows={rows.map(([label, value, note]) => ({ label, value, note }))} columns={[
        { key: "label", label: "Measure" }, { key: "value", label: "Value", align: "right" }, { key: "note", label: "Meaning", wrap: true },
      ]} />
      <div style={{ fontSize: "13px", fontWeight: 600, margin: "14px 0 6px" }}>Payment methods (30 days)</div>
      <Table empty="No confirmed payments yet." rows={r.by_method_30d} columns={[{ key: "method", label: "Method" }, { key: "payments", label: "Payments", align: "right" },
        { key: "amount", label: "Amount", align: "right", render: m => `${Number(m.amount).toLocaleString()} ${m.currency ?? ""}` }]} />
      <div style={{ fontSize: "13px", fontWeight: 600, margin: "14px 0 6px" }}>Unusually heavy use today</div>
      <Table empty="Nobody above the review level." rows={r.heavy_users} columns={[{ key: "email", label: "Learner" }, { key: "plan", label: "Plan" },
        { key: "requests_today", label: "Messages today", align: "right" }, { key: "cost_30d_usd", label: "AI cost, 30 days", align: "right", render: h => `$${Number(h.cost_30d_usd).toFixed(4)}` }]} />
    </>
  );
}

// Real records only. A guest session isn't a person: one student on two phones is two sessions.
function SignupsView() {
  const [days, setDays] = useState(30);
  const [d, setD] = useState(null);
  useEffect(() => {
    setD(null);
    const iso = (t) => new Date(t).toISOString().slice(0, 10);
    api(`/admin/auth?from=${iso(Date.now() - (days - 1) * 864e5)}&to=${iso(Date.now())}`).then(r => setD(r.ok ? r.data : { failed: true }));
  }, [days]);
  if (!d) return <Loading />;
  if (d.failed) return <Notice kind="error">Couldn't load these numbers.</Notice>;
  const pct = (a, b) => (b > 0 ? `${Math.round((100 * a) / b)}%` : "—");
  const providers = Object.entries(d.by_provider);
  const rows = [
    ["Accounts in total", d.accounts_total, "people who signed in with Google or email"],
    ["New accounts: today / 7 days / 30 days", `${d.registrations.today} / ${d.registrations.week} / ${d.registrations.month}`, ""],
    [`New accounts in these ${days} days`, d.registrations.in_range, providers.length ? providers.map(([p, n]) => `${p}: ${n}`).join(", ") : "none"],
    ["Guest sessions", d.guest_sessions, `${d.guest_sessions_all_time} all time. A session is one browser, not one person`],
    ["Guests active today", d.guests_active_today, "sessions that got a reply today"],
    ["Messages per guest session", d.guest_sessions ? (d.guest_messages / d.guest_sessions).toFixed(1) : "—", `${d.guest_messages} messages`],
    ["Reached the guest limit", d.reached_limit, pct(d.reached_limit, d.guest_sessions) + " of sessions"],
    ["Guest to account", pct(d.converted, d.guest_sessions), `${d.converted} of ${d.guest_sessions} sessions`],
    ["Started signing up, didn't finish", d.abandoned_signup, `of ${d.started_signup} who started. Only guests are counted: sign-ups that begin without a guest session aren't visible to us`],
    ["Guest to paid", pct(d.converted_to_paid, d.guest_sessions), `${d.converted_to_paid} sessions became paying accounts`],
  ];
  const max = Math.max(1, ...d.trend.map(x => Math.max(x.guests, x.accounts)));
  return (
    <>
      <div className="mn-row wrap" role="group" aria-label="Period">
        {[7, 30, 90].map(n => <Button key={n} variant={n === days ? undefined : "ghost"} onClick={() => setDays(n)}>{n} days</Button>)}
      </div>
      <Table rows={rows.map(([label, value, note]) => ({ label, value, note }))} columns={[
        { key: "label", label: "Measure" }, { key: "value", label: "Value", align: "right" }, { key: "note", label: "Meaning", wrap: true },
      ]} />
      <div className="mn-trend" role="img" aria-label={`Guest sessions and new accounts per day, last ${days} days`}>
        {d.trend.map(x => (
          <div key={x.day} title={`${x.day}: ${x.guests} guest sessions, ${x.accounts} new accounts`}>
            <i style={{ height: `${(x.guests / max) * 100}%` }} /><b style={{ height: `${(x.accounts / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="mn-trend-key"><span><i /> Guest sessions</span><span><b /> New accounts</span></div>
    </>
  );
}
