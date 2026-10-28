import { useEffect, useState } from "react";
import { listLearningEvents } from "../lib/backend.js";
import { summarizeProgress, topicStatus } from "../lib/chat.js";
import { useT } from "../i18n.js";
import { Page, Card, Notice, Loading, Table, Button } from "./ui.jsx";

const STATUS_CLASS = { shown: "ok", solved: "info", with_help: "hint" };

// Built only from server-verified solves (learning_events). Messages, hints
// and explanations never count, so a new account starts empty.
export default function ProgressPage({ onBack }) {
  const { t, lang } = useT();
  const [events, setEvents] = useState(null);
  const [error, setError] = useState(false);

  const load = () => { setError(false); setEvents(null); listLearningEvents().then(setEvents).catch(() => setError(true)); };
  useEffect(load, []);

  const p = events ? summarizeProgress(events) : null;

  return (
    <Page title={t("progress.title")} onBack={onBack} subtitle={t("progress.sub")}>
      {error && <Notice kind="error">{t("progress.loadError")} <Button variant="ghost" onClick={load}>{t("progress.tryAgain")}</Button></Notice>}
      {!events && !error && <Loading />}
      {p && p.solved === 0 && (
        <Card>
          <p className="mn-panel-text"><b>{t("progress.emptyB")}</b> {t("progress.empty")}</p>
          <p className="mn-panel-text">{t("progress.empty2")}</p>
          <Button onClick={onBack}>{t("progress.start")}</Button>
        </Card>
      )}
      {p && p.solved > 0 && (
        <>
          <div className="mn-stat-row">
            <div className="mn-stat"><div className="v">{p.solved}</div><div className="l">{t("progress.solved")}</div></div>
            <div className="mn-stat"><div className="v">{p.independent}</div><div className="l">{t("progress.independent")}</div></div>
            <div className="mn-stat"><div className="v">{p.practiceIndependent}</div><div className="l">{t("progress.practice")}</div></div>
          </div>
          <Card title={t("progress.topics")}>
            <Table rows={p.topics} empty={t("progress.noTopics")}
              columns={[
                { key: "name", label: t("progress.col.topic"), wrap: true },
                { key: "solved", label: t("progress.col.solved"), align: "right" },
                { key: "status", label: t("progress.col.status"), wrap: true, render: row => {
                  const st = topicStatus(row);
                  return <span className={`mn-status ${STATUS_CLASS[st]}`} title={t(`progress.status.${st}Help`)}>{t(`progress.status.${st}`)}</span>;
                } },
                { key: "last", label: t("progress.col.last"), render: row => row.last ? new Date(row.last).toLocaleDateString([lang]) : "—" },
              ]} />
          </Card>
          <p className="mn-fine left">{t("progress.footnote")}</p>
        </>
      )}
    </Page>
  );
}
