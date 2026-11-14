import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/backend.js";
import { useT, topicName } from "../i18n.js";
import { Page, Card, Button, Notice, Loading } from "./ui.jsx";
import StageSteps from "../lesson/StageSteps.jsx";
import ProjectileLab from "../lesson/ProjectileLab.jsx";

// The revision notebook: one card per topic the learner has met. Everything on it comes from
// GET /learn/notebook, which is built from answers the server marked. A card is turned only after
// its recall question has been shown, and turning it changes nothing in the learner's record:
// "Test me" starts an unseen checked problem, which is what counts.
const LABS = { "phys.projectile_motion": ProjectileLab };

export default function NotebookPage({ onBack, onStart, onStudy }) {
  const { t } = useT();
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState("all");

  const load = useCallback(async () => {
    setError(false);
    const r = await api("/learn/notebook");
    if (r.ok) setEntries(r.data.entries); else setError(true);
  }, []);
  useEffect(() => { load(); }, [load]);

  if (error) return <Page title={t("notebook.title")} onBack={onBack}><Notice kind="error">{t("study.error")} <Button variant="ghost" onClick={load}>{t("progress.tryAgain")}</Button></Notice></Page>;
  if (!entries) return <Page title={t("notebook.title")} onBack={onBack}><Loading /></Page>;

  const due = entries.filter(e => e.due), slipped = entries.filter(e => e.forgotten);
  const shown = filter === "due" ? due : filter === "slipped" ? slipped : entries;
  const filters = [["all", t("notebook.filterAll"), entries.length], ["due", t("notebook.filterDue"), due.length], ["slipped", t("notebook.filterSlipped"), slipped.length]];

  return (
    <Page title={t("notebook.title")} subtitle={t("notebook.sub")} onBack={onBack}>
      {entries.length === 0 ? (
        <Card><p className="mn-panel-text">{t("notebook.empty")}</p><Button onClick={onStudy}>{t("notebook.start")}</Button></Card>
      ) : (
        <>
          <div className="mn-filter-row" role="group" aria-label={t("notebook.title")}>
            {filters.map(([id, label, n]) => (
              <button key={id} className="mn-subject" aria-pressed={filter === id} disabled={n === 0 && id !== "all"} onClick={() => setFilter(id)}>{label} · {n}</button>
            ))}
          </div>
          {shown.map(e => <Entry key={e.objective} entry={e} onStart={onStart} />)}
          <p className="mn-fine left">{t("notebook.note")}</p>
        </>
      )}
    </Page>
  );
}

function Entry({ entry: e, onStart }) {
  const { t, lang } = useT();
  const [open, setOpen] = useState(false);
  const Lab = LABS[e.objective];
  const c = e.card;
  return (
    <Card className="mn-note">
      <div className="mn-note-head">
        <div>
          <h2 className="mn-panel-title">{topicName(t, e.objective, e.title)}</h2>
          <div className="mn-fine left">
            {t(`bank.subject.${e.subject}`)}
            {e.due && <> · <span className="mn-status hint">{t("notebook.due")}</span></>}
            {!e.due && e.nextReview && <> · {t("notebook.dueOn", { date: new Date(e.nextReview).toLocaleDateString([lang], { day: "numeric", month: "short" }) })}</>}
            {e.forgotten && <> · <span className="mn-status warn">{t("notebook.slipped")}</span></>}
          </div>
        </div>
        <Button variant="ghost" onClick={() => onStart({ objective: e.objective })}>{t("notebook.test")}</Button>
      </div>
      <StageSteps stage={e.stage} next={e.next} />

      {e.mistakes.length > 0 && (
        <div className="mn-note-mistakes">
          <div className="mn-section-label">{t("notebook.mistakes")}</div>
          <ul>{e.mistakes.map(m => <li key={m.text}>{m.text} <span className="mn-fine">{t("notebook.times", { n: m.times })}</span></li>)}</ul>
        </div>
      )}

      {c ? (
        <div className="mn-formula">
          <div className="mn-section-label">{c.name}</div>
          <p className="mn-fine left">{t("notebook.recallFirst")}</p>
          <p className="mn-formula-recall">{c.recall}</p>
          <button className="mn-btn outline" aria-expanded={open} onClick={() => setOpen(o => !o)}>{t(open ? "notebook.hide" : "notebook.show")}</button>
          {open && (
            <div className="mn-formula-body">
              <p className="mn-formula-line">{c.formula}</p>
              <dl>
                <dt>{t("notebook.symbols")}</dt>
                <dd><ul className="mn-symbols">{c.symbols.map(s => <li key={s.symbol}><b>{s.symbol}</b> {s.meaning}{s.unit && <span className="mn-unit"> ({s.unit})</span>}</li>)}</ul></dd>
                <dt>{t("notebook.use")}</dt><dd>{c.use}</dd>
                <dt>{t("notebook.conditions")}</dt><dd>{c.conditions}</dd>
                <dt>{t("notebook.origin")}</dt><dd>{c.origin}</dd>
                <dt>{t("notebook.mistake")}</dt><dd>{c.mistake}</dd>
              </dl>
              {Lab && <><div className="mn-section-label">{t("notebook.lab")}</div><Lab /></>}
            </div>
          )}
        </div>
      ) : <p className="mn-fine left">{t("notebook.noCard")}</p>}
    </Card>
  );
}
