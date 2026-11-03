import { useEffect, useState } from "react";
import { api } from "../lib/backend.js";
import { useT } from "../i18n.js";
import { Page, Card, Button, Notice, Loading } from "./ui.jsx";

// "My courses": what the student has told Menya they study, their exams and the notes they've added.
// Menya has no course catalogue or enrolment, so nothing is listed that the student didn't enter.
export default function CoursesPage({ onBack, onStudy, onNotes }) {
  const { t, lang } = useT();
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    Promise.all([api("/learn/state"), api("/materials")]).then(([s, m]) => {
      if (!s.ok) { setFailed(true); return; }
      setData({ profile: s.data.profile, exams: s.data.exams ?? [], materials: m.ok ? m.data.materials ?? [] : [] });
    });
  }, []);

  if (failed) return <Page title={t("courses.title")} onBack={onBack}><Notice kind="error">{t("study.error")}</Notice></Page>;
  if (!data) return <Page title={t("courses.title")} onBack={onBack}><Loading /></Page>;
  const subjects = data.profile?.subjects ?? [];
  const nothing = !data.profile?.programme && !subjects.length && !data.exams.length && !data.materials.length;

  return (
    <Page title={t("courses.title")} subtitle={data.profile?.programme ?? undefined} onBack={onBack}>
      {nothing && <Card><p className="mn-panel-text">{t("courses.empty")}</p><Button onClick={onStudy}>{t("courses.addStudies")}</Button></Card>}
      {subjects.length > 0 && (
        <Card title={t("courses.subjects")}>
          <div className="mn-tags">{subjects.map(s => <span key={s} className="mn-tag-chip">{s}</span>)}</div>
        </Card>
      )}
      {data.exams.length > 0 && (
        <Card title={t("courses.exams")}>
          <ul className="mn-plain-list">
            {data.exams.map(e => <li key={e.id}><b>{e.title}</b>{e.exam_date ? ` · ${new Date(`${e.exam_date}T12:00:00Z`).toLocaleDateString([lang], { day: "numeric", month: "long", year: "numeric" })}` : ""}</li>)}
          </ul>
          <Button variant="ghost" onClick={onStudy}>{t("courses.openStudy")}</Button>
        </Card>
      )}
      {data.materials.length > 0 && (
        <Card title={t("courses.notes")}>
          <ul className="mn-plain-list">{data.materials.map(m => <li key={m.id}>{m.title}</li>)}</ul>
          <Button variant="ghost" onClick={onNotes}>{t("courses.openNotes")}</Button>
        </Card>
      )}
    </Page>
  );
}
