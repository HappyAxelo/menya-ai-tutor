import { useEffect } from "react";
import { Check, Info, X } from "lucide-react";
import { PLAN_CATALOG, formatUsd } from "./plans.js";

// Plans overview for developer mode (no backend). Paid plans can't be bought
// here, and the screen says so instead of showing a fake checkout.
export default function PlansView({ onClose }) {
  useEffect(() => {
    const onKey = e => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="mn-modal-wrap" role="dialog" aria-modal="true" aria-labelledby="mn-plans-title">
      <div className="mn-scrim" onClick={onClose} />
      <div className="mn-modal">
        <button className="mn-btn icon close" onClick={onClose} aria-label="Close plans"><X size={18} /></button>
        <h2 id="mn-plans-title">Plans for every learner</h2>
        <p className="lead">Every plan has the same patient tutor that guides you to answers. Paid plans add more daily use, longer sessions and deeper reasoning. Limits are always shown — nothing is "unlimited".</p>
        <div className="mn-plan-grid">
          {PLAN_CATALOG.map(p => (
            <section key={p.id} className={`mn-plan${p.highlight ? " highlight" : ""}`} aria-label={`${p.name} plan`}>
              {p.highlight && <span className="ribbon">MOST POPULAR</span>}
              <div className="pname">{p.name}</div>
              <div className="ptag">{p.tagline}</div>
              <div className="price">{formatUsd(p.priceMonthlyCents)}{p.priceMonthlyCents > 0 && <small> / month</small>}</div>
              <ul>{p.features.map(f => <li key={f}><Check size={16} strokeWidth={2.6} />{f}</li>)}</ul>
              <div className="limits">
                {p.daily} messages / day · {p.monthly.toLocaleString()} / month
                {p.premium > 0 && <><br />{p.premium} advanced-reasoning requests / month</>}
              </div>
              {p.id === "free"
                ? <button className="mn-btn outline" disabled>Included</button>
                : <button className="mn-btn primary" disabled title="Accounts and payments are launching soon">Coming soon</button>}
            </section>
          ))}
        </div>
        <div className="mn-plan-note">
          <Info size={16} />
          <span>
            You're using <strong>developer mode</strong> with your own free Groq key, so Menya's plan limits don't apply here.
            Accounts, paid plans and institutional seats for universities launch with the hosted version of Menya; online payment isn't available yet.
          </span>
        </div>
      </div>
    </div>
  );
}
