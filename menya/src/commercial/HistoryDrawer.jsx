import { useEffect, useState } from "react";
import { CheckCircle2, Trash2, X } from "lucide-react";
import { listSessions, deleteSession } from "../lib/backend.js";

const when = (iso) => {
  const d = new Date(iso), days = Math.floor((Date.now() - d.getTime()) / 864e5);
  if (days < 1) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (days < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString();
};

// Saved conversations (server-side, owner only). Opening one continues it.
export default function HistoryDrawer({ onClose, onOpen, opening }) {
  const [sessions, setSessions] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    listSessions(50).then(setSessions).catch(() => setError("Couldn't load your conversations. Check your connection and try again."));
  }, []);
  useEffect(() => {
    const onKey = e => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const remove = async (s) => {
    if (!confirm(`Delete "${s.title || "Untitled"}"? This can't be undone. Problems you solved stay in your progress.`)) return;
    try { await deleteSession(s.id); setSessions(list => list.filter(x => x.id !== s.id)); }
    catch { setError("Couldn't delete that conversation. Please try again."); }
  };

  return (
    <div className="mn-overlay">
      <div className="mn-scrim" onClick={onClose} />
      <aside className="mn-drawer" role="dialog" aria-modal="true" aria-label="History">
        <div className="mn-drawer-head">
          <h2>History</h2>
          <button className="mn-btn icon" onClick={onClose} aria-label="Close history" autoFocus><X size={18} /></button>
        </div>
        <div className="mn-drawer-body">
          {error && <div className="mn-notice error" role="alert">{error}</div>}
          {!sessions && !error && <div className="mn-loading" role="status">Loading…</div>}
          {sessions?.length === 0 && <div className="mn-empty">No saved conversations yet. Each problem you start is saved here, so you can come back to it on any device.</div>}
          {sessions?.length > 0 && (
            <ul className="mn-history">
              {sessions.map(s => (
                <li key={s.id}>
                  <button className="mn-history-open" onClick={() => onOpen(s.id)} disabled={opening === s.id}>
                    <span className="t">{s.title || "Untitled"}</span>
                    <span className="m">
                      {when(s.updated_at)} · {s.turn_count} {s.turn_count === 1 ? "exchange" : "exchanges"}
                      {s.problems_solved > 0 && <span className="mn-solved"><CheckCircle2 size={12} aria-hidden="true" />{s.problems_solved === 1 ? "Solved" : `${s.problems_solved} solved`}</span>}
                      {opening === s.id && " · Opening…"}
                    </span>
                  </button>
                  <button className="mn-btn icon" onClick={() => remove(s)} aria-label={`Delete "${s.title || "Untitled"}"`}><Trash2 size={15} /></button>
                </li>
              ))}
            </ul>
          )}
          <p className="mn-fine">Conversations are deleted automatically after 180 days.</p>
        </div>
      </aside>
    </div>
  );
}
