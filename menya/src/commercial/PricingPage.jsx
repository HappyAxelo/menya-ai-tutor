import { useEffect, useState } from "react";
import { api, formatPrice } from "../lib/backend.js";
import { Check } from "lucide-react";
import { C, Page, Card, Button, Field, inputStyle, Notice, Loading } from "./ui.jsx";

const CONTACT = "muyombanohappy@gmail.com";

export default function PricingPage({ account, onBack }) {
  const [plans, setPlans] = useState(null);
  const [checkoutAvailable, setCheckoutAvailable] = useState(false);
  const [interval, setBillingInterval] = useState("month");
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    api("/plans").then(r => {
      setPlans(r.ok ? r.data.plans : []);
      setCheckoutAvailable(Boolean(r.ok && r.data.checkoutAvailable));
      if (!r.ok) setNotice({ kind: "error", text: "Couldn't load plans. Check your connection and refresh the page." });
    });
  }, []);

  const yearlyOffered = checkoutAvailable && plans?.some(p => p.id !== "free" && p.price_yearly_cents != null);

  const upgrade = async (plan) => {
    setBusy(plan.id); setNotice(null);
    const r = await api("/billing/checkout", { method: "POST", body: { plan: plan.id, interval } });
    setBusy(null);
    if (r.ok && r.data.url) { window.location.href = r.data.url; return; }
    setNotice({ kind: "error", text: r.data.message ?? "Checkout is temporarily unavailable. Please try again later." });
  };

  return (
    <Page title="Plans" subtitle="Every plan has the same tutor. Paid plans add more messages each day, longer conversations and stronger reasoning on hard problems. All limits are listed; nothing is unlimited." onBack={onBack}>
      {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}
      {plans && !checkoutAvailable && (
        <Notice kind="info">
          Online payment isn't set up yet. To move to Pro or Professional, email{" "}
          <a href={`mailto:${CONTACT}?subject=Menya%20plan%20upgrade`}>{CONTACT}</a> from the address you sign in with, and we'll arrange it with you.
        </Notice>
      )}
      {yearlyOffered && (
        <div className="mn-seg" role="radiogroup" aria-label="Billing period" style={{ maxWidth: 260, marginBottom: 16 }}>
          {["month", "year"].map(i => (
            <button key={i} type="button" role="radio" aria-checked={interval === i} onClick={() => setBillingInterval(i)}>{i === "month" ? "Monthly" : "Yearly"}</button>
          ))}
        </div>
      )}
      {!plans ? <Loading /> : (
        <div className="mn-plan-grid" style={{ marginBottom: 24 }}>
          {plans.map(p => {
            const current = account?.plan === p.id;
            const cents = interval === "year" ? p.price_yearly_cents : p.price_monthly_cents;
            const unavailable = p.id !== "free" && cents == null;
            return (
              <div key={p.id} className={`mn-plan${current ? " highlight" : ""}`}>
                {current && <span className="ribbon">Your plan</span>}
                <div className="pname">{p.name}</div>
                <div className="ptag">{p.tagline}</div>
                <div className="price">
                  {unavailable ? "—" : formatPrice(cents, p.currency)}
                  {!unavailable && cents > 0 && <small> / {interval}</small>}
                </div>
                <ul>
                  {p.features.map(f => <li key={f}><Check size={15} aria-hidden="true" />{f}</li>)}
                </ul>
                <div className="limits">
                  {p.daily_request_limit} messages a day · {p.monthly_request_limit} a month<br />
                  Conversations up to {p.max_session_turns} exchanges
                  {p.monthly_premium_limit > 0 && <><br />Advanced reasoning: {p.monthly_premium_limit} requests a month</>}
                </div>
                {current ? <Button variant="ghost" disabled>Current plan</Button>
                  : p.id === "free" ? null
                  : checkoutAvailable
                    ? <Button onClick={() => upgrade(p)} disabled={busy === p.id || unavailable}>{busy === p.id ? "Opening checkout…" : unavailable ? "Not offered yearly yet" : `Choose ${p.name}`}</Button>
                    : <a className="mn-btn outline" href={`mailto:${CONTACT}?subject=${encodeURIComponent(`Menya ${p.name} plan`)}`}>Email us about {p.name}</a>}
              </div>
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
      <p className="mn-panel-text">
        Institutional plans are priced by number of learners, usage and support needs. Learners get seats under your institution; administrators see aggregate learning analytics, never individual conversations.
      </p>
      {state === "sent" ? <Notice kind="ok">Thank you. We'll contact you about a quotation.</Notice> : (
        <form onSubmit={submit} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0 14px" }}>
          <Field label="Institution"><input required value={form.institution} onChange={set("institution")} style={inputStyle} /></Field>
          <Field label="Your name"><input required value={form.contact_name} onChange={set("contact_name")} style={inputStyle} /></Field>
          <Field label="Email"><input required type="email" value={form.contact_email} onChange={set("contact_email")} style={inputStyle} /></Field>
          <Field label="Country"><input value={form.country} onChange={set("country")} style={inputStyle} /></Field>
          <Field label="Number of learners"><input type="number" min="1" value={form.learners} onChange={set("learners")} style={inputStyle} /></Field>
          <input aria-hidden="true" tabIndex={-1} autoComplete="off" value={form.website} onChange={set("website")} style={{ position: "absolute", left: "-9999px" }} />
          <div style={{ gridColumn: "1 / -1" }}>
            <Field label="What do you need?"><textarea rows={3} value={form.message} onChange={set("message")} style={{ ...inputStyle, resize: "vertical" }} /></Field>
            {state === "error" && <Notice kind="error">Please check the form and try again.</Notice>}
            {state === "throttled" && <Notice kind="warn">We already have your request. We'll be in touch soon.</Notice>}
            <Button type="submit" disabled={state === "sending"}>{state === "sending" ? "Sending…" : "Request a quotation"}</Button>
          </div>
        </form>
      )}
    </Card>
  );
}
