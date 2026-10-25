import { useEffect, useState } from "react";
import { CheckCircle2, SquarePen, Trash2, X } from "lucide-react";
import { listSessions, deleteSession } from "../lib/backend.js";
import { groupByDay } from "../lib/chat.js";

const time = (iso) => {
  const d = new Date(iso), days = Math.floor((Date.now() - d.getTime()) / 864e5);
  if (days < 1) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (days < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString();
};

// Saved conversations (server-side, owner only), newest first. Opening one
// continues it where it stopped. refreshKey reloads the list (after each reply).
export function HistoryList({ onOpen, opening, currentId, refreshKey, onDeleted }) {
  const [sessions, setSessions] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let live = true;
    listSessions(100).then(s => { if (live) { setSessions(s); setError(null); } })
      .catch(() => live && setError("Couldn't load your conversations. Check your connection and try again."));
    return () => { live = false; };
  }, [refreshKey]);

  const remove = async (s) => {
    if (!confirm(`Delete "${s.title || "Untitled"}"? This can't be undone. Problems you solved stay in your progress.`)) return;
    try { await deleteSession(s.id); setSessions(list => list.filter(x => x.id !== s.id)); onDeleted?.(s.id); }
    catch { setError("Couldn't delete that conversation. Please try again."); }
  };

  if (error && !sessions) return <div className="mn-notice error" role="alert">{error}</div>;
  if (!sessions) return <div className="mn-loading" role="status">Loading…</div>;
  if (sessions.length === 0) return <div className="mn-empty">No conversations yet. Each one you start is saved here, so you can come back and continue it on any device.</div>;

  return (
    <>
      {error && <div className="mn-notice error" role="alert">{error}</div>}
      {groupByDay(sessions).map(([label, items]) => (
        <section key={label} className="mn-history-group">
          <h3 className="mn-section-label">{label}</h3>
          <ul className="mn-history">
            {items.map(s => (
              <li key={s.id} className={s.id === currentId ? "current" : ""}>
                <button className="mn-history-open" onClick={() => onOpen(s.id)} disabled={opening === s.id}
                  aria-current={s.id === currentId ? "true" : undefined}>
                  <span className="t">{s.title || "Untitled"}</span>
                  <span className="m">
                    {time(s.updated_at)} · {s.turn_count} {s.turn_count === 1 ? "exchange" : "exchanges"}
                    {s.problems_solved > 0 && <span className="mn-solved"><CheckCircle2 size={12} aria-hidden="true" />{s.problems_solved === 1 ? "Solved" : `${s.problems_solved} solved`}</span>}
                    {opening === s.id && " · Opening…"}
                  </span>
                </button>
                <button className="mn-btn icon mn-history-del" onClick={() => remove(s)} aria-label={`Delete "${s.title || "Untitled"}"`}><Trash2 size={15} /></button>
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
  return (
    <nav className="mn-sidebar" aria-label="Your conversations">
      <button className="mn-btn outline mn-sidebar-new" onClick={onNew}><SquarePen size={16} />New conversation</button>
      <div className="mn-sidebar-list"><HistoryList {...props} /></div>
      <p className="mn-fine left">Saved to your account. Deleted automatically after 180 days.</p>
    </nav>
  );
}

// The same list as a drawer, for phones and narrow windows.
export default function HistoryDrawer({ onClose, ...props }) {
  useEffect(() => {
    const onKey = e => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="mn-overlay">
      <div className="mn-scrim" onClick={onClose} />
      <aside className="mn-drawer" role="dialog" aria-modal="true" aria-label="Your conversations">
        <div className="mn-drawer-head">
          <h2>Your conversations</h2>
          <button className="mn-btn icon" onClick={onClose} aria-label="Close conversations" autoFocus><X size={18} /></button>
        </div>
        <div className="mn-drawer-body">
          <HistoryList {...props} />
          <p className="mn-fine">Conversations are deleted automatically after 180 days.</p>
        </div>
      </aside>
    </div>
  );
}
