// Shared building blocks for the account, plans, institution and admin pages.
// They use the same classes and tokens as the tutor (menya.css), so every
// page follows one design system and the light/dark theme.
import { Component } from "react";
import { ArrowLeft } from "lucide-react";
import { useT } from "../i18n.js";

// Keeps one failing page from blanking the whole app.
export class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err) { console.error(err); }
  render() {
    if (!this.state.failed) return this.props.children;
    return <Crashed onBack={() => { this.setState({ failed: false }); this.props.onReset?.(); }} />;
  }
}

// Theme tokens, for the few places that still need an inline colour.
export const C = {
  bg: "var(--bg)", panel: "var(--surface)", panel2: "var(--surface)", border: "var(--border)", text: "var(--text)", muted: "var(--text-2)",
  dim: "var(--muted)", faint: "var(--faint)", accent: "var(--accent)", violet: "var(--accent)", green: "var(--success)", amber: "var(--warn)", red: "var(--danger)",
};
export const mono = "var(--font-mono)";
export const serif = "var(--font-display)";

function Crashed({ onBack }) {
  const { t } = useT();
  return (
    <main className="mn-page">
      <Notice kind="error">{t("page.crashed")}</Notice>
      <Button variant="ghost" onClick={onBack}>{t("page.back")}</Button>
    </main>
  );
}

export function Page({ title, subtitle, children, onBack }) {
  const { t } = useT();
  return (
    <main className="mn-page">
      {onBack && <button onClick={onBack} className="mn-back"><ArrowLeft size={15} aria-hidden="true" />{t("page.back")}</button>}
      <h1>{title}</h1>
      {subtitle && <p className="mn-page-sub">{subtitle}</p>}
      {children}
    </main>
  );
}

export function Card({ title, children, style, className = "" }) {
  return (
    <section className={`mn-panel ${className}`} style={style}>
      {title && <h2 className="mn-panel-title">{title}</h2>}
      {children}
    </section>
  );
}

const VARIANT = { primary: "primary", ghost: "outline", danger: "danger" };
export function Button({ children, onClick, variant = "primary", disabled, type = "button", style }) {
  return <button type={type} onClick={onClick} disabled={disabled} className={`mn-btn ${VARIANT[variant] ?? "outline"}`} style={{ justifyContent: "center", ...style }}>{children}</button>;
}

export const linkBtn = { background: "none", border: "none", color: C.accent, cursor: "pointer", fontSize: "13px", padding: 0, textDecoration: "underline" };

export function Meter({ label, used, limit }) {
  const { t } = useT();
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const left = Math.max(limit - used, 0);
  return (
    <div className="mn-meter" role="meter" aria-label={label} aria-valuenow={used} aria-valuemin={0} aria-valuemax={limit}>
      <div className="mn-meter-row">
        <span>{label}</span>
        <span className={pct >= 90 ? "low" : ""}>{limit > 0 ? t("meter.left", { left, limit }) : t("meter.none")}</span>
      </div>
      <div className="mn-bar-track"><div className={`mn-bar-fill${pct >= 90 ? " low" : ""}`} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <label className="mn-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export const inputStyle = {
  width: "100%", minHeight: "42px", padding: "10px 12px", background: "var(--bg-elev)", border: "1px solid var(--border)", borderRadius: "10px",
  color: "var(--text)", fontSize: "16px", fontFamily: "inherit",
};

export function Notice({ kind = "info", children }) {
  return <div role={kind === "error" ? "alert" : "status"} className={`mn-notice ${kind}`}>{children}</div>;
}

export function Loading({ label }) {
  const { t } = useT();
  return <div role="status" className="mn-loading">{label ?? t("page.loading")}</div>;
}

export function Table({ columns, rows, empty = "Nothing here yet." }) {
  if (!Array.isArray(rows) || !rows.length) return <div className="mn-empty-line">{empty}</div>;
  return (
    <div className="mn-table-wrap">
      <table className="mn-table">
        <thead>
          <tr>{columns.map(c => <th key={c.key} style={{ textAlign: c.align ?? "left" }} scope="col">{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id ?? r.user_id ?? r.plan_id ?? i}>
              {columns.map(c => <td key={c.key} style={{ textAlign: c.align ?? "left", whiteSpace: c.wrap ? "normal" : "nowrap" }}>{c.render ? c.render(r) : r[c.key] ?? "—"}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
