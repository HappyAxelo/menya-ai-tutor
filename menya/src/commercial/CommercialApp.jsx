import { useCallback, useEffect, useMemo, useState } from "react";
import AITutor from "../App.jsx";
import { supabase, api, getAccount, backendTutorClient, store } from "../lib/backend.js";
import AuthScreen from "./AuthScreen.jsx";
import PricingPage from "./PricingPage.jsx";
import AccountPage from "./AccountPage.jsx";
import OrgPage from "./OrgPage.jsx";
import AdminPage from "./AdminPage.jsx";
import { C, mono, Notice, ErrorBoundary } from "./ui.jsx";

const PLAN_NAMES = { free: "Free", pro: "Pro", professional: "Professional" };
const pill = { height: "36px", padding: "0 12px", background: C.panel, border: `1px solid ${C.border}`, borderRadius: "10px", color: C.muted, fontSize: "13px", cursor: "pointer", fontWeight: 500 };

export default function CommercialApp() {
  const [session, setSession] = useState(undefined); // undefined = still loading
  const [account, setAccount] = useState(null);
  const [page, setPage] = useState("tutor");
  const [banner, setBanner] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const client = useMemo(() => backendTutorClient(), []);

  // Capture ?invite= and ?checkout= once, then clean the URL.
  const [inviteToken] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("invite");
    if (t) store.set("menya_invite", t);
    return t ?? store.get("menya_invite");
  });
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get("checkout");
    if (checkout === "done") setBanner({ kind: "info", text: "Thanks! Your plan changes as soon as the payment provider confirms the payment, usually within a minute." });
    if (checkout === "cancelled") setBanner({ kind: "warn", text: "Checkout was cancelled. You have not been charged." });
    if (params.has("invite") || params.has("checkout")) window.history.replaceState({}, "", window.location.pathname);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const refresh = useCallback(async () => {
    try { setAccount(await getAccount()); }
    catch { setBanner({ kind: "error", text: "Couldn't load your account. Some information may be out of date." }); }
  }, []);

  useEffect(() => {
    if (!session) return;
    (async () => {
      if (inviteToken) {
        const r = await api("/org/accept", { method: "POST", body: { token: inviteToken } });
        store.del("menya_invite");
        setBanner(r.ok
          ? { kind: "ok", text: r.data.seat_assigned ? "You've joined your institution. Your institution's plan is now active." : "You've joined your institution. An administrator will assign you a seat." }
          : { kind: "error", text: r.data.error === "invitation_for_another_email" ? "This invitation was sent to a different email address." : "This invitation is invalid or has expired." });
      }
      refresh();
    })();
  }, [session, inviteToken, refresh]);

  // A plan-limit message in the chat can open the pricing page.
  useEffect(() => {
    const go = (e) => setPage(e.detail);
    window.addEventListener("menya:navigate", go);
    return () => window.removeEventListener("menya:navigate", go);
  }, []);

  // Keep the usage badge current after each tutor reply.
  const onUsage = useCallback((quota) => {
    if (!quota) return;
    setAccount(a => a && ({ ...a, used: { ...a.used,
      daily: a.limits.daily - (quota.daily_remaining ?? a.limits.daily - a.used.daily),
      monthly: a.limits.monthly - (quota.monthly_remaining ?? a.limits.monthly - a.used.monthly),
      premium: a.limits.premium - (quota.premium_remaining ?? a.limits.premium - a.used.premium) } }));
  }, []);

  if (session === undefined) return <div style={{ minHeight: "100vh", background: C.bg }} />;
  if (!session) return <AuthScreen inviteToken={inviteToken} />;

  const back = () => setPage("tutor");
  const links = [
    ["Plans", () => setPage("pricing")],
    ...(account?.org_admin_of?.length > 0 ? [["Institution", () => setPage("org")]] : []),
    ...(account?.is_admin ? [["Admin", () => setPage("admin")]] : []),
    ["Sign out", () => supabase.auth.signOut()],
  ];
  const nav = (
    <>
      {account && (
        <button onClick={() => setPage("account")} className="mn-pill" style={{ height: "36px", cursor: "pointer" }}>
          <span className="dot" />
          <span className="mn-hide-sm">{PLAN_NAMES[account.plan] ?? account.plan} · </span>{Math.max(account.limits.daily - account.used.daily, 0)} left<span className="mn-hide-sm"> today</span>
        </button>
      )}
      <span className="menya-desktop-only" style={{ display: "contents" }}>{links.map(([label, act]) => <button key={label} onClick={act} style={pill}>{label}</button>)}</span>
      <span className="menya-mobile-only" style={{ position: "relative" }}>
        <button onClick={() => setMenuOpen(o => !o)} aria-expanded={menuOpen} aria-haspopup="menu" style={pill}>Menu</button>
        {menuOpen && (
          <div role="menu" style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", background: C.panel, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "6px", minWidth: "160px", zIndex: 200, boxShadow: "0 8px 24px #0008" }}>
            {links.map(([label, act]) => (
              <button key={label} role="menuitem" onClick={() => { setMenuOpen(false); act(); }}
                style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 12px", background: "none", border: "none", color: C.text, fontSize: "14px", cursor: "pointer", borderRadius: "8px" }}>{label}</button>
            ))}
          </div>
        )}
      </span>
    </>
  );

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'DM Sans', sans-serif" }}>
      {banner && (
        <div style={{ position: "fixed", bottom: "16px", left: "16px", right: "16px", maxWidth: "640px", margin: "0 auto", zIndex: 300 }}>
          <Notice kind={banner.kind}>
            {banner.text} <button onClick={() => setBanner(null)} style={{ marginLeft: "8px", background: "none", border: "none", color: "inherit", cursor: "pointer", textDecoration: "underline" }}>Dismiss</button>
          </Notice>
        </div>
      )}
      {/* The tutor stays mounted so a conversation survives visiting other pages. */}
      <div style={{ display: page === "tutor" ? "block" : "none" }}>
        <AITutor client={client} headerExtras={nav} onUsage={onUsage} account={account} onNavigate={setPage} />
      </div>
      {page !== "tutor" && (
        <ErrorBoundary key={page} onReset={back}>
          {page === "pricing" && <PricingPage account={account} onBack={back} />}
          {page === "account" && <AccountPage account={account} email={session.user.email} onBack={back} onPricing={() => setPage("pricing")} refresh={refresh} />}
          {page === "org" && <OrgPage orgs={account?.org_admin_of ?? []} onBack={back} />}
          {page === "admin" && <AdminPage onBack={back} />}
        </ErrorBoundary>
      )}
    </div>
  );
}
