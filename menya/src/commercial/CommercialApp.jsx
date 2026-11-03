import { useCallback, useEffect, useMemo, useState } from "react";
import AITutor from "../App.jsx";
import { BarChart3, History as HistoryIcon } from "lucide-react";
import { supabase, api, getAccount, backendTutorClient, store, loadSession } from "../lib/backend.js";
import { historyToMessages } from "../lib/chat.js";
import AuthScreen, { guestTicket } from "./AuthScreen.jsx";
import Onboarding from "./Onboarding.jsx";
import PricingPage from "./PricingPage.jsx";
import AccountPage from "./AccountPage.jsx";
import OrgPage from "./OrgPage.jsx";
import AdminPage from "./AdminPage.jsx";
import HistoryDrawer, { HistorySidebar } from "./HistoryDrawer.jsx";
import ProgressPage from "./ProgressPage.jsx";
import StudyPage from "./StudyPage.jsx";
import ExamPage from "./ExamPage.jsx";
import MaterialsPage from "./MaterialsPage.jsx";
import ProfilePage, { Avatar, displayName } from "./ProfilePage.jsx";
import CoursesPage from "./CoursesPage.jsx";
import HelpPage from "./HelpPage.jsx";
import { endSession } from "../lib/signout.js";
import { Notice, ErrorBoundary } from "./ui.jsx";
import { useT } from "../i18n.js";

// First name for the greeting, from the Google profile (or nothing).
function firstName(user) {
  const full = user?.user_metadata?.display_name || user?.user_metadata?.given_name || user?.user_metadata?.full_name || user?.user_metadata?.name || "";
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
  const [noteDismissed, setNoteDismissed] = useState(false);
  const [mergeAsk, setMergeAsk] = useState(null);     // { ticket, conversations }: an existing account is asked first
  const [onboarded, setOnboarded] = useState(() => { try { return Boolean(localStorage.getItem("menya_onboarded")); } catch { return true; } });
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
    // Coming back from Google without signing in: the student just carries on as they were.
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    if (params.get("error") === "access_denied" || hash.get("error") === "access_denied") setBanner({ kind: "info", key: "auth.cancelled" });
    const claim = params.get("claim");
    if (claim) guestTicket.set(claim);
    if (params.has("invite") || params.has("checkout") || params.has("claim") || params.has("error") || hash.has("error")) window.history.replaceState({}, "", window.location.pathname);
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
    // Signed out, here or in another tab: reload, so nothing of that account stays in memory for the next person.
    const { data: sub } = supabase.auth.onAuthStateChange((e, s) => {
      if (e === "SIGNED_OUT") { window.location.replace(window.location.pathname); return; }
      setSession(s);
    });
    // Pressing Back after signing out mustn't show a stored copy of the last page.
    const onShow = (e) => { if (e.persisted) window.location.reload(); };
    window.addEventListener("pageshow", onShow);
    return () => { sub.subscription.unsubscribe(); window.removeEventListener("pageshow", onShow); };
  }, []);

  const refresh = useCallback(async () => {
    try { setAccount(await getAccount()); }
    catch { setBanner({ kind: "error", key: "banner.accountError" }); }
  }, []);

  // Signed in with a guest's ticket waiting: bring their conversation across (it's asked first if the account has its own).
  const claimGuest = useCallback(async (ticket, consent = false) => {
    const r = await api("/guest/claim", { method: "POST", body: { ticket, consent } });
    if (!r.ok) { if (r.status !== 0) guestTicket.clear(); return; }
    if (r.data.status === "needs_consent") { setMergeAsk({ ticket, conversations: r.data.conversations }); return; }
    guestTicket.clear(); setMergeAsk(null);
    setBanner(r.data.status === "claimed" ? { kind: "ok", key: "guest.saved" } : r.data.status === "expired" ? { kind: "info", key: "guest.expired" } : null);
    setListKey(k => k + 1);
    refresh();
  }, [refresh]);
  const isGuest = session?.user?.is_anonymous === true;
  useEffect(() => {
    if (!session || isGuest) return;
    const ticket = guestTicket.get();
    if (ticket) claimGuest(ticket);
  }, [session?.user?.id, isGuest, claimGuest]); // eslint-disable-line react-hooks/exhaustive-deps
  // Guests see what they have; a plan or sign-in link from anywhere leads to creating an account.
  const navigate = useCallback((p) => setPage(isGuest && p === "pricing" ? "signup" : p), [isGuest]);

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
  const onUsage = useCallback((quota, research) => {
    if (!quota) return;
    setAccount(a => a && ({ ...a, used: { ...a.used,
      research: (a.used.research ?? 0) + (research?.searched ? 1 : 0),
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
  const signOut = async ({ everywhere = false } = {}) => {
    const reached = await endSession(supabase.auth, [localStorage, sessionStorage], { everywhere });
    if (!reached) alert(t("menu.signOutOffline"));
    window.location.replace(window.location.pathname);
  };
  const leaveGuest = async () => {
    if (!confirm(t("guest.leaveConfirm"))) return;
    await api("/account", { method: "DELETE" });
    await signOut();
  };
  const openSettings = () => { setPage("tutor"); window.dispatchEvent(new Event("menya:settings")); };
  const links = isGuest ? [
    [t("guest.createAccount"), () => setPage("signup")],
    [t("menu.settings"), openSettings],
    [t("menu.help"), () => setPage("help")],
    [t("guest.leave"), leaveGuest],
  ] : [
    [t("menu.profile"), () => setPage("profile")],
    [t("menu.progress"), () => setPage("progress")],
    [t("menu.courses"), () => setPage("courses")],
    [t("menu.savedNotes"), () => setPage("notes")],
    [t("menu.study"), () => setPage("study")],
    [t("menu.exam"), () => { setExamFor(null); setPage("exam"); }],
    [t("menu.subscription"), () => setPage("pricing")],
    [t("menu.usage"), () => setPage("account")],
    ...(account?.org_admin_of?.length > 0 ? [[t("menu.institution"), () => setPage("org")]] : []),
    ...(account?.is_admin ? [[t("menu.admin"), () => setPage("admin")]] : []),
    [t("menu.settings"), openSettings],
    [t("menu.help"), () => setPage("help")],
    [t("menu.signOut"), () => signOut(), "danger"],
  ];
  const planName = account ? t(`plan.${account.plan}`) : "";
  const guestLeft = account ? Math.max(Math.min(account.limits.daily - account.used.daily, account.limits.monthly - account.used.monthly), 0) : 0;
  // One calm line, not a pop-up: daily messages nearly used, or a paid period about to end (nothing renews by itself).
  const NEXT = { free: "pro", pro: "professional", exam: "professional" };
  const nearLimit = account && account.limits.daily > 0 && account.used.daily >= Math.ceil(account.limits.daily * 0.9);
  const endsInDays = account?.period_end && account.source === "subscription" ? Math.ceil((Date.parse(account.period_end) - Date.now()) / 864e5) : null;
  const gentleNote = !account || noteDismissed || isGuest ? null
    : nearLimit ? `${t("limit.near", { used: account.used.daily, limit: account.limits.daily })}${account.source !== "organization" && NEXT[account.plan] ? ` ${t("limit.upgrade", { plan: t(`plan.${NEXT[account.plan]}`) })}` : ""}`
    : endsInDays != null && endsInDays <= 3 && endsInDays >= 0 ? t("limit.ending", { plan: planName, n: endsInDays }) : null;
  const daysLeft = account ? Math.max(account.limits.daily - account.used.daily, 0) : null;
  const nav = (
    <>
      <button className="mn-btn mn-hide-lg" onClick={() => setShowHistory(true)} aria-label={t("header.history")} title={t("header.historyTitle")}>
        <HistoryIcon size={16} /><span className="mn-hide-md">{t("header.history")}</span>
      </button>
      {!isGuest && (
        <button className="mn-btn" onClick={() => setPage("progress")} aria-label={t("header.progress")} title={t("header.progress")}>
          <BarChart3 size={16} /><span className="mn-hide-md">{t("header.progress")}</span>
        </button>
      )}
      {account && !isGuest && (
        <button onClick={() => setPage("account")} className="mn-pill mn-hide-sm" title={t("header.planPillTitle")}>
          {t("header.planPill", { plan: planName, n: daysLeft })}
        </button>
      )}
      <span className="mn-account-menu">
        <button className="mn-avatar-btn" onClick={() => setMenuOpen(o => !o)} aria-expanded={menuOpen} aria-haspopup="menu" aria-label={t("menu.open")} title={t("menu.open")}><Avatar user={session.user} /></button>
        {menuOpen && (
          <>
            <div className="mn-menu-scrim" onClick={() => setMenuOpen(false)} />
            <div role="menu" className="mn-menu-list">
              {!isGuest && <div className="mn-menu-who"><b>{displayName(session.user) || session.user.email}</b>{displayName(session.user) && session.user.email && <span>{session.user.email}</span>}</div>}
              {isGuest && <div className="mn-menu-who"><b>{t("menu.guest")}</b>{account && <span>{guestLeft === 1 ? t("guest.remainingOne") : t("guest.remaining", { n: guestLeft })}</span>}</div>}
              {account && !isGuest && <div className="mn-menu-note">{t("menu.note", { plan: planName, n: daysLeft })}</div>}
              {links.map(([label, act, tone]) => (
                <button key={label} role="menuitem" className={tone ?? undefined} onClick={() => { setMenuOpen(false); act(); }}>{label}</button>
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
      {isGuest && account && page === "tutor" && (
        <div className="mn-guest-bar" role="status">
          <span>{guestLeft === 1 ? t("guest.remainingOne") : t("guest.remaining", { n: guestLeft })}</span>
          <button className="mn-link" onClick={() => setPage("signup")}>{t("guest.createAccount")}</button>
        </div>
      )}
      {mergeAsk && (
        <div className="mn-banner">
          <Notice kind="info">
            {t("guest.mergeAsk", { n: mergeAsk.conversations })}{" "}
            <button className="mn-link" onClick={() => claimGuest(mergeAsk.ticket, true)}>{t("guest.mergeYes")}</button>
            {" · "}<button className="mn-link" onClick={() => { guestTicket.clear(); setMergeAsk(null); }}>{t("guest.mergeNo")}</button>
          </Notice>
        </div>
      )}
      {!isGuest && account && account.has_profile === false && !onboarded && page === "tutor" && (
        <Onboarding onDone={() => { try { localStorage.setItem("menya_onboarded", "1"); } catch { /* shows again next time */ } setOnboarded(true); refresh(); }} />
      )}
      {gentleNote && (
        <div className="mn-banner">
          <Notice kind="info">
            {gentleNote} <button onClick={() => setPage("pricing")} className="mn-link">{t("limit.seePlans")}</button>
            {" · "}<button onClick={() => setNoteDismissed(true)} className="mn-link">{t("banner.dismiss")}</button>
          </Notice>
        </div>
      )}
      {/* The tutor stays mounted so a conversation survives visiting other pages. */}
      <div style={{ display: page === "tutor" ? "block" : "none" }}>
        <AITutor client={client} guest={isGuest} headerExtras={nav} onUsage={onUsage} account={account} onNavigate={navigate} resume={resume}
          onSessionChange={onSessionChange} newChatKey={newChatKey} reviewRequest={reviewRequest} userName={firstName(session.user)}
          sidebar={<HistorySidebar {...historyProps} onNew={() => setNewChatKey(k => k + 1)} />} />
      </div>
      {showHistory && <HistoryDrawer onClose={() => setShowHistory(false)} {...historyProps} />}
      {page !== "tutor" && (
        <ErrorBoundary key={page} onReset={back}>
          {page === "signup" && <AuthScreen upgrade onBack={back} />}
          {page === "pricing" && <PricingPage account={account} onBack={back} refresh={refresh} />}
          {page === "progress" && <ProgressPage onBack={back} onReview={objective => { setReviewRequest({ objective, key: Date.now() }); back(); }} />}
          {page === "study" && <StudyPage onBack={back} onStart={req => { setReviewRequest({ ...req, key: Date.now() }); back(); }}
            onExam={(id, count) => { setExamFor({ id, count, key: Date.now() }); setPage("exam"); }}
            onReview={() => { setExamFor({ review: true, key: Date.now() }); setPage("exam"); }} />}
          {page === "exam" && <ExamPage key={examFor?.key ?? "new"} examId={examFor?.id ?? null} count={examFor?.count ?? 10} review={Boolean(examFor?.review)} onBack={back} onStart={req => { setReviewRequest({ ...req, key: Date.now() }); back(); }} />}
          {page === "notes" && <MaterialsPage onBack={back} onAsk={draft => { setReviewRequest({ draft, key: Date.now() }); back(); }} />}
          {page === "account" && <AccountPage account={account} email={session.user.email} onBack={back} onPricing={() => setPage("pricing")} refresh={refresh} />}
          {page === "profile" && <ProfilePage user={session.user} account={account} onBack={back} onSubscription={() => setPage("account")} onSignOutEverywhere={() => signOut({ everywhere: true })} />}
          {page === "courses" && <CoursesPage onBack={back} onStudy={() => setPage("study")} onNotes={() => setPage("notes")} />}
          {page === "help" && <HelpPage onBack={back} />}
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
