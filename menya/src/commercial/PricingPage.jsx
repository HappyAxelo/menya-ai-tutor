import { useEffect, useState } from "react";
import { api, formatPrice } from "../lib/backend.js";
import { Check } from "lucide-react";
import { useT } from "../i18n.js";
import { Page, Card, Button, Field, inputStyle, Notice, Loading } from "./ui.jsx";

const CONTACT = "muyombanohappy@gmail.com";

// Each plan is sold for one or more periods; the order here is the order shown.
const PERIODS = [
  { id: "month", column: "price_monthly_cents", months: 1 },
  { id: "semester", column: "price_semester_cents", months: 4 },
  { id: "year", column: "price_yearly_cents", months: 12 },
  { id: "two_weeks", column: "price_two_weeks_cents", months: null },
];

export default function PricingPage({ account, onBack }) {
  const { t } = useT();
  const [plans, setPlans] = useState(null);
  const [checkoutAvailable, setCheckoutAvailable] = useState(false);
  const [checkoutOptions, setCheckoutOptions] = useState(null); // "plan:period" the payment provider sells; null = all
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    api("/plans").then(r => {
      setPlans(r.ok ? r.data.plans : []);
      setCheckoutAvailable(Boolean(r.ok && r.data.checkoutAvailable));
      setCheckoutOptions(r.ok && Array.isArray(r.data.checkoutOptions) ? r.data.checkoutOptions : null);
      if (!r.ok) setNotice({ kind: "error", text: t("pricing.loadError") });
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Plan names, taglines and features come from the server in English; show the
  // translation when there is one.
  const tr = (key, english) => { const s = t(key); return s === key ? english : s; };
  const [before, after] = t("pricing.noPayment").split("{email}");

  const upgrade = async (plan, interval) => {
    setBusy(`${plan.id}:${interval}`); setNotice(null);
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
      {!plans ? <Loading /> : (
        <div className="mn-plan-grid" style={{ marginBottom: 24 }}>
          {plans.map(p => {
            const current = account?.plan === p.id;
            const name = tr(`plan.${p.id}`, p.name);
            const offers = p.id === "free" ? PERIODS.slice(0, 1) : PERIODS.filter(o => p[o.column] != null && p[o.column] > 0);
            const [main, ...more] = offers;
            const payable = offers.filter(o => !checkoutOptions || checkoutOptions.includes(`${p.id}:${o.id}`));
            const monthly = p.price_monthly_cents;
            // "Save 25%" against paying monthly for the same time.
            const saving = (o) => (monthly && o.months > 1 ? Math.round(100 * (1 - p[o.column] / (monthly * o.months))) : 0);
            const price = (o) => (p[o.column] === 0 ? t("plan.free") : formatPrice(p[o.column], p.currency));
            return (
              <div key={p.id} className={`mn-plan${current ? " highlight" : ""}${p.id === "exam" ? " exam" : ""}`}>
                {current && <span className="ribbon">{t("pricing.yourPlan")}</span>}
                <div className="pname">{name}</div>
                <div className="ptag">{tr(`plan.tagline.${p.id}`, p.tagline)}</div>
                <div className="price">
                  {main ? price(main) : "—"}
                  {main && p[main.column] > 0 && <small> {t(`pricing.per.${main.id}`)}</small>}
                </div>
                {more.length > 0 && (
                  <div className="price-more">
                    {more.map(o => (
                      <span key={o.id}>{price(o)} {t(`pricing.per.${o.id}`)}{saving(o) > 0 && <b> · {t("pricing.save", { pct: saving(o) })}</b>}</span>
                    ))}
                  </div>
                )}
                <ul>
                  {p.features.map(f => <li key={f}><Check size={15} aria-hidden="true" />{tr(`feature.${f}`, f)}</li>)}
                </ul>
                <div className="limits">
                  {p.id === "exam" ? t("pricing.fairUse")
                    : <>{t("pricing.limits", { day: p.daily_request_limit, month: p.monthly_request_limit })}</>}<br />
                  {t("pricing.turns", { n: p.max_session_turns })}
                  {p.monthly_premium_limit > 0 && <><br />{t("pricing.premium", { n: p.monthly_premium_limit })}</>}
                </div>
                {current ? <Button variant="ghost" disabled>{t("pricing.current")}</Button>
                  : p.id === "free" ? null
                  : checkoutAvailable && payable.length > 0
                    ? <div className="pay-options">
                        {payable.map((o, i) => (
                          <Button key={o.id} variant={i === 0 ? undefined : "ghost"} onClick={() => upgrade(p, o.id)} disabled={busy !== null}>
                            {busy === `${p.id}:${o.id}` ? t("pricing.opening") : t("pricing.pay", { price: price(o), period: t(`pricing.per.${o.id}`) })}
                          </Button>
                        ))}
                      </div>
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
