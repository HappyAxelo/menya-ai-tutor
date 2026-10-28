import { useEffect, useState } from "react";
import { CheckCircle2, SquarePen, Trash2, X } from "lucide-react";
import { listSessions, deleteSession } from "../lib/backend.js";
import { groupByDay } from "../lib/chat.js";
import { useT } from "../i18n.js";

const GROUP_KEYS = { Today: "history.today", Yesterday: "history.yesterday", "Previous 7 days": "history.week", Older: "history.older" };

// Times and dates in the interface language (browsers without that locale fall back).
const time = (iso, lang) => {
  const d = new Date(iso), days = Math.floor((Date.now() - d.getTime()) / 864e5);
  if (days < 1) return d.toLocaleTimeString([lang], { hour: "2-digit", minute: "2-digit" });
  if (days < 7) return d.toLocaleDateString([lang], { weekday: "short" });
  return d.toLocaleDateString([lang]);
};

// Saved conversations (server-side, owner only), newest first. Opening one
// continues it where it stopped. refreshKey reloads the list (after each reply).
export function HistoryList({ onOpen, opening, currentId, refreshKey, onDeleted }) {
  const { t, lang } = useT();
  const [sessions, setSessions] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let live = true;
    listSessions(100).then(s => { if (live) { setSessions(s); setError(null); } })
      .catch(() => live && setError("history.loadError"));
    return () => { live = false; };
  }, [refreshKey]);

  const remove = async (s) => {
    if (!confirm(t("history.deleteConfirm", { title: s.title || t("history.untitled") }))) return;
    try { await deleteSession(s.id); setSessions(list => list.filter(x => x.id !== s.id)); onDeleted?.(s.id); }
    catch { setError("history.deleteError"); }
  };

  if (error && !sessions) return <div className="mn-notice error" role="alert">{t(error)}</div>;
  if (!sessions) return <div className="mn-loading" role="status">{t("history.loading")}</div>;
  if (sessions.length === 0) return <div className="mn-empty">{t("history.empty")}</div>;

  return (
    <>
      {error && <div className="mn-notice error" role="alert">{t(error)}</div>}
      {groupByDay(sessions).map(([label, items]) => (
        <section key={label} className="mn-history-group">
          <h3 className="mn-section-label">{t(GROUP_KEYS[label] ?? label)}</h3>
          <ul className="mn-history">
            {items.map(s => (
              <li key={s.id} className={s.id === currentId ? "current" : ""}>
                <button className="mn-history-open" onClick={() => onOpen(s.id)} disabled={opening === s.id}
                  aria-current={s.id === currentId ? "true" : undefined}>
                  <span className="t">{s.title || t("history.untitled")}</span>
                  <span className="m">
                    {time(s.updated_at, lang)} · {s.turn_count === 1 ? t("history.exchange") : t("history.exchanges", { n: s.turn_count })}
                    {s.problems_solved > 0 && <span className="mn-solved"><CheckCircle2 size={12} aria-hidden="true" />{s.problems_solved === 1 ? t("history.solved") : t("history.solvedN", { n: s.problems_solved })}</span>}
                    {opening === s.id && ` · ${t("history.opening")}`}
                  </span>
                </button>
                <button className="mn-btn icon mn-history-del" onClick={() => remove(s)} aria-label={t("history.deleteAria", { title: s.title || t("history.untitled") })}><Trash2 size={15} /></button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

// Always-visible list beside the chat on wide screens.
export function HistorySidebar({ onNew, ...props }) {
  const { t } = useT();
  return (
    <nav className="mn-sidebar" aria-label={t("header.historyTitle")}>
      <button className="mn-btn outline mn-sidebar-new" onClick={onNew}><SquarePen size={16} />{t("history.new")}</button>
      <div className="mn-sidebar-list"><HistoryList {...props} /></div>
      <p className="mn-fine left">{t("history.footer")}</p>
    </nav>
  );
}

// The same list as a drawer, for phones and narrow windows.
export default function HistoryDrawer({ onClose, ...props }) {
  const { t } = useT();
  useEffect(() => {
    const onKey = e => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="mn-overlay">
      <div className="mn-scrim" onClick={onClose} />
      <aside className="mn-drawer" role="dialog" aria-modal="true" aria-label={t("header.historyTitle")}>
        <div className="mn-drawer-head">
          <h2>{t("header.historyTitle")}</h2>
          <button className="mn-btn icon" onClick={onClose} aria-label={t("history.close")} autoFocus><X size={18} /></button>
        </div>
        <div className="mn-drawer-body">
          <HistoryList {...props} />
          <p className="mn-fine">{t("history.footer")}</p>
        </div>
      </aside>
    </div>
  );
}
