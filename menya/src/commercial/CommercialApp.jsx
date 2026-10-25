import { useCallback, useEffect, useMemo, useState } from "react";
import AITutor from "../App.jsx";
import { BarChart3, History as HistoryIcon, Menu } from "lucide-react";
import { supabase, api, getAccount, backendTutorClient, store, loadSession } from "../lib/backend.js";
import { historyToMessages } from "../lib/chat.js";
import AuthScreen from "./AuthScreen.jsx";
import PricingPage from "./PricingPage.jsx";
import AccountPage from "./AccountPage.jsx";
import OrgPage from "./OrgPage.jsx";
import AdminPage from "./AdminPage.jsx";
import HistoryDrawer, { HistorySidebar } from "./HistoryDrawer.jsx";
import ProgressPage from "./ProgressPage.jsx";
import { Notice, ErrorBoundary } from "./ui.jsx";

const PLAN_NAMES = { free: "Free", pro: "Pro", professional: "Professional" };

export default function CommercialApp() {
  const [session, setSession] = useState(undefined); // undefined = still loading
  const [account, setAccount] = useState(null);
  const [page, setPage] = useState("tutor");
  const [banner, setBanner] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [resume, setResume] = useState(null);
  const [opening, setOpening] = useState(null);
  const [currentId, setCurrentId] = useState(null);   // conversation on screen
  const [listKey, setListKey] = useState(0);          // bump to reload the conversation list
  const [newChatKey, setNewChatKey] = useState(0);    // bump to start a new conversation
  // The open conversation is remembered for this tab, so a page refresh reopens it.
  const onSessionChange = useCallback((id) => {
    setCurrentId(id);
    if (id) { setListKey(k => k + 1); store.set("menya_current", id); } else store.del("menya_current");
  }, []);
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

  // If the owner hasn't configured the AI provider key yet, say so plainly.
  useEffect(() => {
    api("/health").then(r => {
      if (r.ok && r.data.tutorReady === false) {
        setBanner({ kind: "warn", text: "Menya's tutor is still being set up, so replies aren't available yet. Please check back soon." });
      }
    });
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

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = e => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const openSession = useCallback(async (id, { quiet = false } = {}) => {
    setOpening(id);
    try {
      const { session: s, rows } = await loadSession(id);
      setResume({ key: `${id}:${Date.now()}`, session: s, messages: historyToMessages(rows) });
      setShowHistory(false); setPage("tutor");
    } catch {
      if (quiet) store.del("menya_current"); // e.g. deleted on another device
      else setBanner({ kind: "error", text: "Couldn't open that conversation. Check your connection and try again." });
    }
    setOpening(null);
  }, []);

  useReopenAfterRefresh(session, openSession);

  if (session === undefined) return <div className="mn-splash" role="status" aria-label="Loading" />;
  if (!session) return <AuthScreen inviteToken={inviteToken} />;

  const back = () => setPage("tutor");
  const historyProps = {
    onOpen: openSession, opening, currentId, refreshKey: listKey,
    onDeleted: (id) => { if (id === currentId) setNewChatKey(k => k + 1); },
  };
  const links = [
    ["Account", () => setPage("account")],
    ["Plans", () => setPage("pricing")],
    ...(account?.org_admin_of?.length > 0 ? [["Institution", () => setPage("org")]] : []),
    ...(account?.is_admin ? [["Admin", () => setPage("admin")]] : []),
    ["Sign out", () => supabase.auth.signOut()],
  ];
  const daysLeft = account ? Math.max(account.limits.daily - account.used.daily, 0) : null;
  const nav = (
    <>
      <button className="mn-btn mn-hide-lg" onClick={() => setShowHistory(true)} aria-label="History" title="Your conversations">
        <HistoryIcon size={16} /><span className="mn-hide-md">History</span>
      </button>
      <button className="mn-btn" onClick={() => setPage("progress")} aria-label="Progress" title="Progress">
        <BarChart3 size={16} /><span className="mn-hide-md">Progress</span>
      </button>
      {account && (
        <button onClick={() => setPage("account")} className="mn-pill mn-hide-sm" title="Messages left today on your plan">
          {PLAN_NAMES[account.plan] ?? account.plan} · {daysLeft} left today
        </button>
      )}
      <span className="mn-menu">
        <button className="mn-btn icon" onClick={() => setMenuOpen(o => !o)} aria-expanded={menuOpen} aria-haspopup="menu" aria-label="Account menu"><Menu size={17} /></button>
        {menuOpen && (
          <>
            <div className="mn-menu-scrim" onClick={() => setMenuOpen(false)} />
            <div role="menu" className="mn-menu-list">
              {account && <div className="mn-menu-note">{PLAN_NAMES[account.plan] ?? account.plan} plan · {daysLeft} messages left today</div>}
              {links.map(([label, act]) => (
                <button key={label} role="menuitem" onClick={() => { setMenuOpen(false); act(); }}>{label}</button>
              ))}
            </div>
          </>
        )}
      </span>
    </>
  );

  return (
    <div className="mn-shell">
      {banner && (
        <div className="mn-banner">
          <Notice kind={banner.kind}>
            {banner.text} <button onClick={() => setBanner(null)} className="mn-link">Dismiss</button>
          </Notice>
        </div>
      )}
      {/* The tutor stays mounted so a conversation survives visiting other pages. */}
      <div style={{ display: page === "tutor" ? "block" : "none" }}>
        <AITutor client={client} headerExtras={nav} onUsage={onUsage} account={account} onNavigate={setPage} resume={resume}
          onSessionChange={onSessionChange} newChatKey={newChatKey}
          sidebar={<HistorySidebar {...historyProps} onNew={() => setNewChatKey(k => k + 1)} />} />
      </div>
      {showHistory && <HistoryDrawer onClose={() => setShowHistory(false)} {...historyProps} />}
      {page !== "tutor" && (
        <ErrorBoundary key={page} onReset={back}>
          {page === "pricing" && <PricingPage account={account} onBack={back} />}
          {page === "progress" && <ProgressPage onBack={back} />}
          {page === "account" && <AccountPage account={account} email={session.user.email} onBack={back} onPricing={() => setPage("pricing")} refresh={refresh} />}
          {page === "org" && <OrgPage orgs={account?.org_admin_of ?? []} onBack={back} />}
          {page === "admin" && <AdminPage onBack={back} />}
        </ErrorBoundary>
      )}
    </div>
  );
}

function useReopenAfterRefresh(session, openSession) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!session || done) return;
    setDone(true);
    const id = store.get("menya_current");
    if (id) openSession(id, { quiet: true });
  }, [session, done, openSession]);
}
