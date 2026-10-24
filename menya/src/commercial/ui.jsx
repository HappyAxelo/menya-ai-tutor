// Shared building blocks for the commercial pages, matching the tutor's dark theme.
import { Component } from "react";

// Keeps one failing page from blanking the whole app.
export class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err) { console.error(err); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main style={{ maxWidth: "640px", margin: "0 auto", padding: "48px 16px" }}>
        <Notice kind="error">This page hit an unexpected problem. Your account and data are safe.</Notice>
        <Button variant="ghost" onClick={() => { this.setState({ failed: false }); this.props.onReset?.(); }}>Back to tutor</Button>
      </main>
    );
  }
}

// Theme tokens from menya.css, so these pages follow light/dark mode too.
export const C = {
  bg: "var(--bg)", panel: "var(--surface)", panel2: "var(--surface)", border: "var(--border)", text: "var(--text)", muted: "var(--text-2)",
  dim: "var(--muted)", faint: "var(--faint)", accent: "var(--info)", violet: "var(--accent)", green: "var(--success)", amber: "var(--warn)", red: "var(--danger)",
};
export const mono = "'DM Mono', monospace";
export const serif = "'Fraunces', serif";

export function Page({ title, subtitle, children, onBack }) {
  return (
    <main style={{ maxWidth: "1040px", margin: "0 auto", padding: "24px 16px 64px" }}>
      {onBack && <button onClick={onBack} style={linkBtn}>← Back to tutor</button>}
      <h1 style={{ fontFamily: serif, fontSize: "28px", margin: "12px 0 6px", background: "linear-gradient(135deg,#7dd3fc,#c084fc)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>{title}</h1>
      {subtitle && <p style={{ color: C.dim, fontSize: "14px", lineHeight: 1.7, marginBottom: "20px", maxWidth: "680px" }}>{subtitle}</p>}
      {children}
    </main>
  );
}

export function Card({ title, children, style }) {
  return (
    <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "18px", marginBottom: "16px", ...style }}>
      {title && <h2 style={{ fontSize: "11px", color: C.dim, textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: mono, marginBottom: "12px", fontWeight: 400 }}>{title}</h2>}
      {children}
    </section>
  );
}

export function Button({ children, onClick, variant = "primary", disabled, type = "button", style }) {
  const styles = {
    primary: { background: disabled ? C.border : "linear-gradient(135deg,#0ea5e9,#7c3aed)", color: disabled ? C.faint : "#fff", border: "none" },
    ghost: { background: C.panel, color: C.muted, border: `1px solid ${C.border}` },
    danger: { background: "var(--danger-soft)", color: "var(--danger)", border: "1px solid var(--danger)" },
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      style={{ padding: "9px 16px", borderRadius: "10px", fontSize: "13px", cursor: disabled ? "not-allowed" : "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, ...styles[variant], ...style }}>
      {children}
    </button>
  );
}

export const linkBtn = { background: "none", border: "none", color: C.accent, cursor: "pointer", fontSize: "13px", fontFamily: mono, padding: 0 };

export function Meter({ label, used, limit, color = C.accent }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const left = Math.max(limit - used, 0);
  return (
    <div style={{ marginBottom: "14px" }} role="meter" aria-label={label} aria-valuenow={used} aria-valuemin={0} aria-valuemax={limit}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", marginBottom: "6px" }}>
        <span style={{ color: C.text }}>{label}</span>
        <span style={{ color: pct >= 90 ? C.amber : C.muted, fontFamily: mono }}>{limit > 0 ? `${left} of ${limit} left` : "Not included"}</span>
      </div>
      <div style={{ height: "6px", background: C.border, borderRadius: "3px", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: pct >= 90 ? C.amber : color, transition: "width 0.6s" }} />
      </div>
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <label style={{ display: "block", marginBottom: "12px" }}>
      <span style={{ display: "block", fontSize: "11px", color: C.faint, fontFamily: mono, letterSpacing: "0.08em", marginBottom: "6px" }}>{label}</span>
      {children}
    </label>
  );
}

export const inputStyle = {
  width: "100%", padding: "10px 12px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: "10px",
  color: C.text, fontSize: "14px", fontFamily: "'DM Sans', sans-serif", outline: "none",
};

export function Notice({ kind = "info", children }) {
  const k = { info: ["var(--info)", "var(--info-soft)"], ok: ["var(--success)", "var(--success-soft)"], warn: ["var(--warn)", "var(--warn-soft)"], error: ["var(--danger)", "var(--danger-soft)"] }[kind];
  return <div role={kind === "error" ? "alert" : "status"} style={{ padding: "10px 14px", borderRadius: "12px", border: `1px solid color-mix(in srgb, ${k[0]} 35%, transparent)`, background: k[1], color: k[0], fontSize: "13px", lineHeight: 1.6, marginBottom: "14px" }}>{children}</div>;
}

export function Loading({ label = "Loading…" }) {
  return <div role="status" style={{ color: C.dim, fontSize: "13px", padding: "20px 0" }}>{label}</div>;
}

export function Table({ columns, rows, empty = "Nothing here yet." }) {
  if (!Array.isArray(rows) || !rows.length) return <div style={{ color: C.faint, fontSize: "13px" }}>{empty}</div>;
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
        <thead>
          <tr>{columns.map(c => <th key={c.key} style={{ textAlign: c.align ?? "left", padding: "8px", color: C.dim, fontFamily: mono, fontSize: "11px", fontWeight: 400, borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" }}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id ?? r.user_id ?? r.plan_id ?? i}>
              {columns.map(c => <td key={c.key} style={{ textAlign: c.align ?? "left", padding: "8px", color: C.text, borderBottom: `1px solid ${C.border}`, whiteSpace: c.wrap ? "normal" : "nowrap" }}>{c.render ? c.render(r) : r[c.key] ?? "—"}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
