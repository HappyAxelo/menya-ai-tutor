import { useEffect, useState } from "react";
import { api, formatPrice } from "../lib/backend.js";
import { C, mono, Page, Card, Button, Field, inputStyle, Notice, Loading } from "./ui.jsx";

export default function PricingPage({ account, onBack }) {
  const [plans, setPlans] = useState(null);
  const [interval, setBillingInterval] = useState("month");
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    api("/plans").then(r => setPlans(r.ok ? r.data.plans : []));
  }, []);

  const yearlyOffered = plans?.some(p => p.id !== "free" && p.price_yearly_cents != null);

  const upgrade = async (plan) => {
    setBusy(plan.id); setNotice(null);
    const r = await api("/billing/checkout", { method: "POST", body: { plan: plan.id, interval } });
    setBusy(null);
    if (r.ok && r.data.url) { window.location.href = r.data.url; return; }
    setNotice(r.status === 501
      ? { kind: "warn", text: "Online payment isn't available yet. Use the form below and we'll set up your plan with you directly." }
      : { kind: "error", text: r.data.message ?? "Checkout is temporarily unavailable." });
  };

  return (
    <Page title="Plans" subtitle="Every plan includes the same patient, Socratic tutor. Paid plans add more daily use, longer sessions and deeper reasoning. Limits are shown up front: nothing is unlimited." onBack={onBack}>
      {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}
      {yearlyOffered && (
        <div role="radiogroup" aria-label="Billing period" style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
          {["month", "year"].map(i => (
            <Button key={i} variant={interval === i ? "primary" : "ghost"} onClick={() => setBillingInterval(i)}>{i === "month" ? "Monthly" : "Yearly"}</Button>
          ))}
        </div>
      )}
      {!plans ? <Loading /> : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "16px", marginBottom: "24px" }}>
          {plans.map(p => {
            const current = account?.plan === p.id;
            const cents = interval === "year" ? p.price_yearly_cents : p.price_monthly_cents;
            const unavailable = p.id !== "free" && cents == null;
            return (
              <Card key={p.id} style={{ marginBottom: 0, border: `1px solid ${p.id === "pro" ? "#0369a1" : C.border}`, display: "flex", flexDirection: "column" }}>
                <div style={{ fontSize: "18px", fontWeight: 600, color: C.text }}>{p.name}</div>
                <div style={{ fontSize: "13px", color: C.dim, marginBottom: "12px" }}>{p.tagline}</div>
                <div style={{ fontSize: "28px", fontWeight: 700, color: C.text, marginBottom: "4px" }}>
                  {unavailable ? "—" : formatPrice(cents, p.currency)}
                  {!unavailable && cents > 0 && <span style={{ fontSize: "13px", color: C.dim, fontWeight: 400 }}> / {interval}</span>}
                </div>
                <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 16px", flex: 1 }}>
                  {p.features.map(f => <li key={f} style={{ fontSize: "13px", color: C.muted, padding: "4px 0", lineHeight: 1.5 }}>✓ {f}</li>)}
                  {p.monthly_premium_limit > 0 && <li style={{ fontSize: "12px", color: C.dim, padding: "4px 0", fontFamily: mono }}>Advanced reasoning: {p.monthly_premium_limit} requests / month</li>}
                  <li style={{ fontSize: "12px", color: C.dim, padding: "4px 0", fontFamily: mono }}>{p.daily_request_limit} messages / day · {p.monthly_request_limit} / month</li>
                </ul>
                {current ? <Button variant="ghost" disabled>Your current plan</Button>
                  : p.id === "free" ? null
                  : <Button onClick={() => upgrade(p)} disabled={busy === p.id || unavailable}>{busy === p.id ? "Opening checkout…" : unavailable ? "Not offered yearly yet" : `Choose ${p.name}`}</Button>}
              </Card>
            );
          })}
        </div>
      )}
      <QuoteForm />
    </Page>
  );
}

function QuoteForm() {
  const [form, setForm] = useState({ institution: "", contact_name: "", contact_email: "", country: "", learners: "", message: "", website: "" });
  const [state, setState] = useState("idle");
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    setState("sending");
    const r = await api("/quote", { method: "POST", body: { ...form, learners: form.learners ? Number(form.learners) : undefined } });
    setState(r.ok ? "sent" : r.status === 429 ? "throttled" : "error");
  };
  return (
    <Card title="Universities, schools and teams">
      <p style={{ color: C.muted, fontSize: "14px", lineHeight: 1.7, marginBottom: "14px" }}>
        Institutional plans are priced by number of learners, usage and support needs. Learners get seats under your institution; administrators see aggregate learning analytics, never individual conversations.
      </p>
      {state === "sent" ? <Notice kind="ok">Thank you. We'll contact you about a quotation.</Notice> : (
        <form onSubmit={submit} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0 14px" }}>
          <Field label="INSTITUTION"><input required value={form.institution} onChange={set("institution")} style={inputStyle} /></Field>
          <Field label="YOUR NAME"><input required value={form.contact_name} onChange={set("contact_name")} style={inputStyle} /></Field>
          <Field label="EMAIL"><input required type="email" value={form.contact_email} onChange={set("contact_email")} style={inputStyle} /></Field>
          <Field label="COUNTRY"><input value={form.country} onChange={set("country")} style={inputStyle} /></Field>
          <Field label="NUMBER OF LEARNERS"><input type="number" min="1" value={form.learners} onChange={set("learners")} style={inputStyle} /></Field>
          <input aria-hidden="true" tabIndex={-1} autoComplete="off" value={form.website} onChange={set("website")} style={{ position: "absolute", left: "-9999px" }} />
          <div style={{ gridColumn: "1 / -1" }}>
            <Field label="WHAT DO YOU NEED?"><textarea rows={3} value={form.message} onChange={set("message")} style={{ ...inputStyle, resize: "vertical" }} /></Field>
            {state === "error" && <Notice kind="error">Please check the form and try again.</Notice>}
            {state === "throttled" && <Notice kind="warn">We already have your request. We'll be in touch soon.</Notice>}
            <Button type="submit" disabled={state === "sending"}>{state === "sending" ? "Sending…" : "Request a quotation"}</Button>
          </div>
        </form>
      )}
    </Card>
  );
}
