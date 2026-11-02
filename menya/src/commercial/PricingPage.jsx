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

export default function PricingPage({ account, onBack, refresh }) {
  const { t, lang } = useT();
  const [plans, setPlans] = useState(null);
  const [checkoutAvailable, setCheckoutAvailable] = useState(false);
  const [checkoutOptions, setCheckoutOptions] = useState(null); // "plan:period" the payment provider sells; null = all
  const [checkoutPrices, setCheckoutPrices] = useState(null);   // what each pay button really charges, when known
  const [waiting, setWaiting] = useState(null);                 // { url, plan, periodEnd }: payment open in another tab
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(null);

  // Everything shown here comes from the server's plans table, the same one that enforces the limits.
  useEffect(() => {
    api("/plans").then(r => {
      setPlans(r.ok ? r.data.plans : []);
      setCheckoutAvailable(Boolean(r.ok && r.data.checkoutAvailable));
      setCheckoutOptions(r.ok && Array.isArray(r.data.checkoutOptions) ? r.data.checkoutOptions : null);
      setCheckoutPrices(r.ok ? r.data.checkoutPrices ?? null : null);
      if (!r.ok) setNotice({ kind: "error", text: t("pricing.loadError") });
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Plan names and descriptions come from the server in English; show the translation when there is one.
  const tr = (key, english) => { const x = t(key); return x === key ? english : x; };
  const [before, after] = t("pricing.noPayment").split("{email}");

  // The payment page has no way to send the learner back, so it opens in its own tab and this page
  // watches for the plan to change. The tab must open inside the click: phones block it after a wait.
  const upgrade = async (plan, interval) => {
    const tab = window.open("", "_blank");
    setBusy(`${plan.id}:${interval}`); setNotice(null);
    const r = await api("/billing/checkout", { method: "POST", body: { plan: plan.id, interval } });
    setBusy(null);
    if (r.ok && r.data.url) {
      if (tab) { tab.opener = null; tab.location.href = r.data.url; }
      setWaiting({ url: r.data.url, plan: account?.plan, periodEnd: account?.period_end ?? null });
      return;
    }
    tab?.close();
    setNotice({ kind: "error", text: r.data?.error === "higher_plan_active"
      ? t("pricing.higherActive", { date: new Date(r.data.until).toLocaleDateString([lang]) }) : t("pricing.checkoutError") });
  };

  // Every 5 seconds for 15 minutes: IremboPay's confirmation reaches the server, the account changes.
  useEffect(() => {
    if (!waiting || !refresh) return;
    let tries = 0;
    const id = setInterval(() => { if (++tries > 180) { clearInterval(id); setWaiting(null); } else refresh(); }, 5000);
    return () => clearInterval(id);
  }, [waiting, refresh]);
  useEffect(() => {
    if (waiting && account && (account.plan !== waiting.plan || (account.period_end ?? null) !== waiting.periodEnd)) {
      setWaiting(null);
      setNotice({ kind: "ok", text: t("pricing.paidThanks", { plan: tr(`plan.${account.plan}`, account.plan) }) });
    }
  }, [account, waiting]); // eslint-disable-line react-hooks/exhaustive-deps

  const offerOf = (p) => PERIODS.find(o => p[o.column] != null && (p.id === "free" || p[o.column] > 0));
  const priceText = (p, o) => (!o || p[o.column] === 0 ? formatPrice(0, p.currency).replace("Free", "$0") : formatPrice(p[o.column], p.currency));
  // On a pay button: the amount really charged (francs on an RWF account).
  const charge = (p, o) => {
    const c = checkoutPrices?.[`${p.id}:${o.id}`];
    return c ? new Intl.NumberFormat(undefined, { style: "currency", currency: c.currency, maximumFractionDigits: 0 }).format(c.amount) : priceText(p, o);
  };
  const n = (v) => Number(v).toLocaleString([lang]);
  const ROWS = [
    ["messagesDay", p => n(p.daily_request_limit)], ["messagesMonth", p => n(p.monthly_request_limit)],
    ["pictures", p => n(p.daily_image_limit)], ["length", p => t("pricing.exchanges", { n: p.max_session_turns })],
    ["memory", p => n(p.context_turns)], ["depth", p => t(p.analytics_level === "basic" ? "pricing.depthStandard" : "pricing.depthDetailed")],
    ["notes", p => t("pricing.files", { n: p.material_limit })], ["perMinute", p => n(p.requests_per_minute)],
  ];

  return (
    <Page className="mn-pricing" title={t("pricing.title")} subtitle={t("pricing.sub")} onBack={onBack}>
      {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}
      {waiting && (
        <Notice kind="info">
          {t("pricing.waiting")} <a href={waiting.url} target="_blank" rel="noopener noreferrer">{t("pricing.openPayment")}</a>
        </Notice>
      )}
      {plans && !checkoutAvailable && (
        <Notice kind="info">
          {before}<a href={`mailto:${CONTACT}?subject=Menya%20plan%20upgrade`}>{CONTACT}</a>{after}
        </Notice>
      )}
      {!plans ? <Loading /> : (
        <>
          <div className="mn-price-grid">
            {plans.map(p => {
              const current = account?.plan === p.id;
              const name = tr(`plan.${p.id}`, p.name);
              const o = offerOf(p);
              const payable = o && (!checkoutOptions || checkoutOptions.includes(`${p.id}:${o.id}`));
              const badge = current ? t("pricing.yourPlan") : p.id === "pro" ? t("pricing.recommended") : p.id === "professional" ? t("pricing.frequent") : null;
              return (
                <section key={p.id} className={`mn-price-card${p.id === "pro" ? " featured" : ""}`} aria-label={name}>
                  {badge && <span className="badge">{badge}</span>}
                  <h2>{name}</h2>
                  <div className="amount">{priceText(p, o)}{o && p[o.column] > 0 && <small> {t(`pricing.per.${o.id}`)}</small>}</div>
                  <p className="who">{tr(`plan.tagline.${p.id}`, p.tagline)}</p>
                  {p.id === "free" ? (current && <Button variant="ghost" disabled>{t("pricing.current")}</Button>)
                    : checkoutAvailable && payable ? (
                      <Button variant={p.id === "pro" ? undefined : "ghost"} onClick={() => upgrade(p, o.id)} disabled={busy !== null}>
                        {busy === `${p.id}:${o.id}` ? t("pricing.opening")
                          : current ? t("pricing.renew", { price: charge(p, o) }) : t("pricing.pay", { price: charge(p, o), period: t(`pricing.per.${o.id}`) })}
                      </Button>
                    ) : current ? <Button variant="ghost" disabled>{t("pricing.current")}</Button>
                    : <a className="mn-btn outline" href={`mailto:${CONTACT}?subject=${encodeURIComponent(`Menya ${p.name} plan`)}`}>{t("pricing.emailUs", { plan: name })}</a>}
                </section>
              );
            })}
          </div>

          <h2 className="mn-price-h">{t("pricing.compare")}</h2>
          <div className="mn-price-table-wrap" tabIndex={0} role="region" aria-label={t("pricing.compare")}>
            <table className="mn-price-table">
              <thead><tr><th scope="col"><span className="mn-sr">{t("pricing.feature")}</span></th>{plans.map(p => <th key={p.id} scope="col">{tr(`plan.${p.id}`, p.name)}</th>)}</tr></thead>
              <tbody>
                {ROWS.map(([key, value]) => (
                  <tr key={key}><th scope="row">{t(`pricing.row.${key}`)}</th>{plans.map(p => <td key={p.id}>{value(p)}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mn-price-note">{t("pricing.sameModel")}</p>

          <h2 className="mn-price-h">{t("pricing.everyPlan")}</h2>
          <ul className="mn-price-included">
            {["tutoring", "study", "map", "exams", "input", "languages", "data"].map(k => (
              <li key={k}><Check size={16} aria-hidden="true" /><span><b>{t(`pricing.inc.${k}`)}</b> {t(`pricing.inc.${k}Text`)}</span></li>
            ))}
          </ul>

          <h2 className="mn-price-h">{t("pricing.questions")}</h2>
          <div className="mn-price-faq">
            {["limits", "reach", "expire", "renew", "cancel", "switch", "pictures"].map(k => (
              <details key={k}><summary>{t(`pricing.q.${k}`)}</summary><p>{t(`pricing.a.${k}`)}</p></details>
            ))}
          </div>
        </>
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
