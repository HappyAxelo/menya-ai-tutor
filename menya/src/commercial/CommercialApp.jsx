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
import StudyPage from "./StudyPage.jsx";
import ExamPage from "./ExamPage.jsx";
import MaterialsPage from "./MaterialsPage.jsx";
import { Notice, ErrorBoundary } from "./ui.jsx";
import { useT } from "../i18n.js";

// First name for the greeting, from the Google profile (or nothing).
function firstName(user) {
  const full = user?.user_metadata?.given_name || user?.user_metadata?.full_name || user?.user_metadata?.name || "";
  return String(full).trim().split(/\s+/)[0] || null;
}

export default function CommercialApp() {
  const [session, setSession] = useState(undefined); // undefined = still loading
  const [account, setAccount] = useState(null);
  const [page, setPage] = useState("tutor");
  const [banner, setBanner] = useState(null); // { kind, key }
  const { t } = useT();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [resume, setResume] = useState(null);
  const [opening, setOpening] = useState(null);
  const [currentId, setCurrentId] = useState(null);   // conversation on screen
  const [listKey, setListKey] = useState(0);          // bump to reload the conversation list
  const [reviewRequest, setReviewRequest] = useState(null); // { objective } | { text } | { draft }, plus key: work started from another page
  const [examFor, setExamFor] = useState(null);             // { id, count } when a practice exam is opened for an exam
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
    if (checkout === "done") setBanner({ kind: "info", key: "banner.checkoutDone" });
    if (checkout === "cancelled") setBanner({ kind: "warn", key: "banner.checkoutCancelled" });
    if (params.has("invite") || params.has("checkout")) window.history.replaceState({}, "", window.location.pathname);
  }, []);

  // If the owner hasn't configured the AI provider key yet, say so plainly.
  useEffect(() => {
    api("/health").then(r => {
      if (r.ok && r.data.tutorReady === false) {
        setBanner({ kind: "warn", key: "banner.notReady" });
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
    catch { setBanner({ kind: "error", key: "banner.accountError" }); }
  }, []);

  useEffect(() => {
    if (!session) return;
    (async () => {
      if (inviteToken) {
        const r = await api("/org/accept", { method: "POST", body: { token: inviteToken } });
        store.del("menya_invite");
        setBanner(r.ok
          ? { kind: "ok", key: r.data.seat_assigned ? "banner.inviteSeat" : "banner.inviteNoSeat" }
          : { kind: "error", key: r.data.error === "invitation_for_another_email" ? "banner.inviteWrongEmail" : "banner.inviteInvalid" });
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
      else setBanner({ kind: "error", key: "banner.openError" });
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
    [t("menu.study"), () => setPage("study")],
    [t("menu.exam"), () => { setExamFor(null); setPage("exam"); }],
    [t("menu.notes"), () => setPage("notes")],
    [t("menu.account"), () => setPage("account")],
    [t("menu.plans"), () => setPage("pricing")],
    ...(account?.org_admin_of?.length > 0 ? [[t("menu.institution"), () => setPage("org")]] : []),
    ...(account?.is_admin ? [[t("menu.admin"), () => setPage("admin")]] : []),
    [t("menu.signOut"), () => supabase.auth.signOut()],
  ];
  const planName = account ? t(`plan.${account.plan}`) : "";
  const daysLeft = account ? Math.max(account.limits.daily - account.used.daily, 0) : null;
  const nav = (
    <>
      <button className="mn-btn mn-hide-lg" onClick={() => setShowHistory(true)} aria-label={t("header.history")} title={t("header.historyTitle")}>
        <HistoryIcon size={16} /><span className="mn-hide-md">{t("header.history")}</span>
      </button>
      <button className="mn-btn" onClick={() => setPage("progress")} aria-label={t("header.progress")} title={t("header.progress")}>
        <BarChart3 size={16} /><span className="mn-hide-md">{t("header.progress")}</span>
      </button>
      {account && (
        <button onClick={() => setPage("account")} className="mn-pill mn-hide-sm" title={t("header.planPillTitle")}>
          {t("header.planPill", { plan: planName, n: daysLeft })}
        </button>
      )}
      <span className="mn-menu">
        <button className="mn-btn icon" onClick={() => setMenuOpen(o => !o)} aria-expanded={menuOpen} aria-haspopup="menu" aria-label={t("header.menu")}><Menu size={17} /></button>
        {menuOpen && (
          <>
            <div className="mn-menu-scrim" onClick={() => setMenuOpen(false)} />
            <div role="menu" className="mn-menu-list">
              {account && <div className="mn-menu-note">{t("menu.note", { plan: planName, n: daysLeft })}</div>}
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
            {t(banner.key)} <button onClick={() => setBanner(null)} className="mn-link">{t("banner.dismiss")}</button>
          </Notice>
        </div>
      )}
      {/* The tutor stays mounted so a conversation survives visiting other pages. */}
      <div style={{ display: page === "tutor" ? "block" : "none" }}>
        <AITutor client={client} headerExtras={nav} onUsage={onUsage} account={account} onNavigate={setPage} resume={resume}
          onSessionChange={onSessionChange} newChatKey={newChatKey} reviewRequest={reviewRequest} userName={firstName(session.user)}
          sidebar={<HistorySidebar {...historyProps} onNew={() => setNewChatKey(k => k + 1)} />} />
      </div>
      {showHistory && <HistoryDrawer onClose={() => setShowHistory(false)} {...historyProps} />}
      {page !== "tutor" && (
        <ErrorBoundary key={page} onReset={back}>
          {page === "pricing" && <PricingPage account={account} onBack={back} />}
          {page === "progress" && <ProgressPage onBack={back} onReview={objective => { setReviewRequest({ objective, key: Date.now() }); back(); }} />}
          {page === "study" && <StudyPage onBack={back} onStart={req => { setReviewRequest({ ...req, key: Date.now() }); back(); }}
            onExam={(id, count) => { setExamFor({ id, count, key: Date.now() }); setPage("exam"); }}
            onReview={() => { setExamFor({ review: true, key: Date.now() }); setPage("exam"); }} />}
          {page === "exam" && <ExamPage key={examFor?.key ?? "new"} examId={examFor?.id ?? null} count={examFor?.count ?? 10} review={Boolean(examFor?.review)} onBack={back} onStart={req => { setReviewRequest({ ...req, key: Date.now() }); back(); }} />}
          {page === "notes" && <MaterialsPage onBack={back} onAsk={draft => { setReviewRequest({ draft, key: Date.now() }); back(); }} />}
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
