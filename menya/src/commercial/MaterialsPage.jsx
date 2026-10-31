import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/backend.js";
import { readPages } from "../lib/attachments.js";
import { useT } from "../i18n.js";
import { Page, Card, Button, Notice, Loading } from "./ui.jsx";

// "My notes": lecture notes and slides the tutor can quote from, with page numbers.
// Files are read in the browser; only their text is sent and stored (privately).
const MAX_CHARS = 300_000;   // the server's limit per file

export default function MaterialsPage({ onBack, onAsk }) {
  const { t, lang } = useT();
  const [items, setItems] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    const r = await api("/materials");
    setItems(r.ok ? r.data.materials : []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const upload = async (file) => {
    if (!file) return;
    setBusy(true); setMsg(null);
    try {
      const { kind, pages } = await readPages(file);
      // Keep whole pages up to the size limit, and say so if the file was longer.
      const kept = [];
      let chars = 0;
      for (const p of pages) { if (chars + p.text.length > MAX_CHARS) break; kept.push(p); chars += p.text.length; }
      const r = await api("/materials", { method: "POST", body: { title: file.name.replace(/\.[^.]+$/, "").slice(0, 200), kind, pages: kept }, timeoutMs: 120000 });
      if (!r.ok) {
        setMsg({ kind: "error", text: t(r.data?.error === "material_limit" ? "notes.limit" : "notes.error") });
      } else {
        setMsg({ kind: "ok", text: kept.length < pages.length ? t("notes.partly", { n: kept.length, total: pages.length }) : t("notes.added") });
        load();
      }
    } catch (err) {
      setMsg({ kind: "error", text: t(["scanned", "too_large", "unsupported", "empty"].includes(err.code) ? `notes.err.${err.code}` : "notes.error") });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const remove = async (m) => {
    if (!confirm(t("notes.deleteConfirm", { title: m.title }))) return;
    await api(`/materials?id=${m.id}`, { method: "DELETE" });
    load();
  };

  return (
    <Page title={t("notes.title")} subtitle={t("notes.sub")} onBack={onBack}>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      <Card title={t("notes.add")}>
        <p className="mn-panel-text small">{t("notes.how")}</p>
        <input ref={fileRef} type="file" accept=".pdf,.pptx,.docx,.xlsx,.txt,.md,.csv,.tex,.ipynb" disabled={busy}
          onChange={e => upload(e.target.files?.[0])} aria-label={t("notes.choose")} />
        {busy && <Loading label={t("notes.reading")} />}
        <p className="mn-fine left">{t("notes.rules")}</p>
      </Card>
      <Card title={t("notes.yours")}>
        {!items ? <Loading /> : items.length === 0 ? <p className="mn-panel-text">{t("notes.none")}</p> : (
          <ul className="mn-plan-list">
            {items.map(m => (
              <li key={m.id}>
                <div><b>{m.title}</b><div className="mn-fine left">{t(`notes.unit.${m.kind === "pdf" ? "pdf" : m.kind === "slides" ? "slides" : "other"}`, { n: m.pages })} · {new Date(m.created_at).toLocaleDateString([lang])}</div></div>
                <span className="acts">
                  <Button variant="ghost" onClick={() => onAsk(t("notes.askPrefix", { title: m.title }))}>{t("notes.ask")}</Button>
                  <button className="mn-link" onClick={() => remove(m)}>{t("notes.delete")}</button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </Page>
  );
}
