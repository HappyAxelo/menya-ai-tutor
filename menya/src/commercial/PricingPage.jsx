import { useEffect, useState } from "react";
import { api, formatPrice } from "../lib/backend.js";
import { Check } from "lucide-react";
import { useT } from "../i18n.js";
import { Page, Card, Button, Field, inputStyle, Notice, Loading } from "./ui.jsx";

const CONTACT = "muyombanohappy@gmail.com";

export default function PricingPage({ account, onBack }) {
  const { t } = useT();
  const [plans, setPlans] = useState(null);
  const [checkoutAvailable, setCheckoutAvailable] = useState(false);
  const [interval, setBillingInterval] = useState("month");
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    api("/plans").then(r => {
      setPlans(r.ok ? r.data.plans : []);
      setCheckoutAvailable(Boolean(r.ok && r.data.checkoutAvailable));
      if (!r.ok) setNotice({ kind: "error", text: t("pricing.loadError") });
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const yearlyOffered = checkoutAvailable && plans?.some(p => p.id !== "free" && p.price_yearly_cents != null);
  // Plan names, taglines and features come from the server in English; show the
  // translation when there is one.
  const tr = (key, english) => { const s = t(key); return s === key ? english : s; };
  const [before, after] = t("pricing.noPayment").split("{email}");

  const upgrade = async (plan) => {
    setBusy(plan.id); setNotice(null);
    const r = await api("/billing/checkout", { method: "POST", body: { plan: plan.id, interval } });
    setBusy(null);
    if (r.ok && r.data.url) { window.location.href = r.data.url; return; }
    setNotice({ kind: "error", text: t("pricing.checkoutError") });
  };

  return (
    <Page title={t("pricing.title")} subtitle={t("pricing.sub")} onBack={onBack}>
      {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}
      {plans && !checkoutAvailable && (
        <Notice kind="info">
          {before}<a href={`mailto:${CONTACT}?subject=Menya%20plan%20upgrade`}>{CONTACT}</a>{after}
        </Notice>
      )}
      {yearlyOffered && (
        <div className="mn-seg" role="radiogroup" aria-label={t("pricing.title")} style={{ maxWidth: 260, marginBottom: 16 }}>
          {["month", "year"].map(i => (
            <button key={i} type="button" role="radio" aria-checked={interval === i} onClick={() => setBillingInterval(i)}>{i === "month" ? t("pricing.monthly") : t("pricing.yearly")}</button>
          ))}
        </div>
      )}
      {!plans ? <Loading /> : (
        <div className="mn-plan-grid" style={{ marginBottom: 24 }}>
          {plans.map(p => {
            const current = account?.plan === p.id;
            const cents = interval === "year" ? p.price_yearly_cents : p.price_monthly_cents;
            const unavailable = p.id !== "free" && cents == null;
            const name = tr(`plan.${p.id}`, p.name);
            return (
              <div key={p.id} className={`mn-plan${current ? " highlight" : ""}`}>
                {current && <span className="ribbon">{t("pricing.yourPlan")}</span>}
                <div className="pname">{name}</div>
                <div className="ptag">{tr(`plan.tagline.${p.id}`, p.tagline)}</div>
                <div className="price">
                  {unavailable ? "—" : formatPrice(cents, p.currency)}
                  {!unavailable && cents > 0 && <small> {t(`pricing.per.${interval}`)}</small>}
                </div>
                <ul>
                  {p.features.map(f => <li key={f}><Check size={15} aria-hidden="true" />{tr(`feature.${f}`, f)}</li>)}
                </ul>
                <div className="limits">
                  {t("pricing.limits", { day: p.daily_request_limit, month: p.monthly_request_limit })}<br />
                  {t("pricing.turns", { n: p.max_session_turns })}
                  {p.monthly_premium_limit > 0 && <><br />{t("pricing.premium", { n: p.monthly_premium_limit })}</>}
                </div>
                {current ? <Button variant="ghost" disabled>{t("pricing.current")}</Button>
                  : p.id === "free" ? null
                  : checkoutAvailable
                    ? <Button onClick={() => upgrade(p)} disabled={busy === p.id || unavailable}>{busy === p.id ? t("pricing.opening") : unavailable ? t("pricing.notYearly") : t("pricing.choose", { plan: name })}</Button>
                    : <a className="mn-btn outline" href={`mailto:${CONTACT}?subject=${encodeURIComponent(`Menya ${p.name} plan`)}`}>{t("pricing.emailUs", { plan: name })}</a>}
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
  const { t } = useT();
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
    <Card title={t("quote.title")}>
      <p className="mn-panel-text">{t("quote.text")}</p>
      {state === "sent" ? <Notice kind="ok">{t("quote.sent")}</Notice> : (
        <form onSubmit={submit} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0 14px" }}>
          <Field label={t("quote.institution")}><input required value={form.institution} onChange={set("institution")} style={inputStyle} /></Field>
          <Field label={t("quote.name")}><input required value={form.contact_name} onChange={set("contact_name")} style={inputStyle} /></Field>
          <Field label={t("quote.email")}><input required type="email" value={form.contact_email} onChange={set("contact_email")} style={inputStyle} /></Field>
          <Field label={t("quote.country")}><input value={form.country} onChange={set("country")} style={inputStyle} /></Field>
          <Field label={t("quote.learners")}><input type="number" min="1" value={form.learners} onChange={set("learners")} style={inputStyle} /></Field>
          <input aria-hidden="true" tabIndex={-1} autoComplete="off" value={form.website} onChange={set("website")} style={{ position: "absolute", left: "-9999px" }} />
          <div style={{ gridColumn: "1 / -1" }}>
            <Field label={t("quote.need")}><textarea rows={3} value={form.message} onChange={set("message")} style={{ ...inputStyle, resize: "vertical" }} /></Field>
            {state === "error" && <Notice kind="error">{t("quote.error")}</Notice>}
            {state === "throttled" && <Notice kind="warn">{t("quote.throttled")}</Notice>}
            <Button type="submit" disabled={state === "sending"}>{state === "sending" ? t("quote.sending") : t("quote.send")}</Button>
          </div>
        </form>
      )}
    </Card>
  );
}
