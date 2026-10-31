import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/backend.js";
import { useT } from "../i18n.js";
import { Page, Card, Button, Notice, Loading, Field, inputStyle } from "./ui.jsx";

// "My study": what to do today, the week's plan, the knowledge map, exams and the
// learner's profile. Everything comes from GET /learn/state, which is computed from
// answers the server marked itself (no engagement counts, no streaks).
const LEVEL_CLASS = { strong: "ok", developing: "info", started: "hint", needs_work: "warn", not_assessed: "" };
const DAYS = [0, 1, 2, 3, 4, 5, 6];

export default function StudyPage({ onBack, onStart, onExam }) {
  const { t, lang } = useT();
  const [state, setState] = useState(null);
  const [error, setError] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    setError(false);
    const r = await api("/learn/state");
    if (r.ok) setState(r.data); else setError(true);
  }, []);
  useEffect(() => { load(); }, [load]);

  const objName = id => t(`obj.${id}`);
  const fmtDate = d => new Date(`${d}T12:00:00Z`).toLocaleDateString([lang], { weekday: "short", day: "numeric", month: "short" });

  // Each plan item starts real work: an unseen verified problem, a lesson, or a mock exam.
  const start = (item) => {
    if (item.activity === "mock") return onExam(item.examId, Math.max(3, Math.floor(item.minutes / 3)));
    if (item.activity === "learn") return onStart({ text: t("study.teachMe", { topic: objName(item.objective) }) });
    return onStart({ objective: item.objective });
  };

  const reset = async (objective) => {
    if (!confirm(t("study.resetConfirm", { topic: objName(objective) }))) return;
    const r = await api("/learn/reset", { method: "POST", body: { objective } });
    setMsg(r.ok ? { kind: "ok", text: t("study.resetDone") } : { kind: "error", text: t("study.error") });
    load();
  };

  if (error) return <Page title={t("study.title")} onBack={onBack}><Notice kind="error">{t("study.error")} <Button variant="ghost" onClick={load}>{t("progress.tryAgain")}</Button></Notice></Page>;
  if (!state) return <Page title={t("study.title")} onBack={onBack}><Loading /></Page>;

  const { today, plan, map, exams, profile } = state;
  const todayItems = today.plan;
  const later = plan.filter(p => p.date !== todayItems[0]?.date);
  const trend = today.progress.trend;

  return (
    <Page title={t("study.title")} subtitle={t("study.sub")} onBack={onBack}>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      {!today.hasProfile && <Notice kind="info">{t("study.noProfile")}</Notice>}

      <Card title={t("study.today")}>
        {todayItems.length === 0
          ? <p className="mn-panel-text">{t(exams.length || map.some(s => s.topics.some(x => x.level !== "not_assessed")) ? "study.todayFree" : "study.todayEmpty")}</p>
          : <ul className="mn-plan-list">
              {todayItems.map((p, i) => (
                <li key={i} className={p.done ? "done" : ""}>
                  <div>
                    <b>{t(`study.act.${p.activity}`)}</b>{p.objective && <>: {objName(p.objective)}</>}
                    <div className="mn-fine left">{t(`study.why.${p.reason.startsWith("exam:") ? "exam" : p.reason}`, { exam: p.reason.slice(5) })} · {t("study.minutes", { n: p.minutes })}</div>
                  </div>
                  {p.done ? <span className="mn-status ok">{t("study.done")}</span> : <Button variant={i === 0 ? undefined : "ghost"} onClick={() => start(p)}>{t("study.start")}</Button>}
                </li>
              ))}
            </ul>}
        {today.nextExam && <p className="mn-panel-text small"><b>{today.nextExam.title}</b>: {t("study.daysLeft", { n: today.nextExam.daysLeft })}</p>}
      </Card>

      <Card title={t("study.week")}>
        <div className="mn-stat-row">
          <div className="mn-stat"><div className="v">{today.progress.thisWeek.independentCorrect}/{today.progress.thisWeek.independentTotal}</div><div className="l">{t("study.alone")}</div></div>
          <div className="mn-stat"><div className="v">{today.progress.thisWeek.topics}</div><div className="l">{t("study.topicsWorked")}</div></div>
          <div className="mn-stat"><div className="v">{today.strong.length}</div><div className="l">{t("study.strongCount")}</div></div>
        </div>
        <p className="mn-panel-text small">{t(`study.trend.${trend}`, { last: `${today.progress.lastWeek.independentCorrect}/${today.progress.lastWeek.independentTotal}` })}</p>
        {today.struggling.length > 0 && (
          <p className="mn-panel-text small"><b>{t("study.struggling")}:</b> {today.struggling.map(s => objName(s.objective)).join(", ")}</p>
        )}
      </Card>

      <Card title={t("study.map")}>
        <p className="mn-fine left">{t("study.mapNote")}</p>
        {map.map(s => (
          <div key={s.subject} className="mn-map-subject">
            <div className="mn-section-label">{t(`bank.subject.${s.subject}`)}</div>
            <ul className="mn-map">
              {s.topics.map(x => (
                <li key={x.objective}>
                  <span className="name">{objName(x.objective)}</span>
                  <span className={`mn-status ${LEVEL_CLASS[x.level]}`}>{t(`study.level.${x.level}`)}</span>
                  <span className="acts">
                    <button className="mn-link" onClick={() => onStart({ objective: x.objective })}>{t("study.testMe")}</button>
                    {x.level !== "not_assessed" && <button className="mn-link" onClick={() => reset(x.objective)}>{t("study.reset")}</button>}
                  </span>
                  {x.misconceptions.length > 0 && <div className="mn-fine left">{t("study.watch")}: {x.misconceptions.map(m => m.replace(/_/g, " ")).join(", ")}</div>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Card>

      {later.length > 0 && (
        <Card title={t("study.nextDays")}>
          <ul className="mn-plan-list compact">
            {later.map((p, i) => (
              <li key={i}><span className="mn-fine left">{fmtDate(p.date)}</span> <b>{t(`study.act.${p.activity}`)}</b>{p.objective && <>: {objName(p.objective)}</>} <span className="mn-fine left">({t("study.minutes", { n: p.minutes })})</span></li>
            ))}
          </ul>
          <p className="mn-fine left">{t("study.planNote")}</p>
        </Card>
      )}

      <ExamsCard exams={exams} onChanged={load} onExam={onExam} fmtDate={fmtDate} />
      <ProfileCard profile={profile} onSaved={load} />
    </Page>
  );
}

function ExamsCard({ exams, onChanged, onExam, fmtDate }) {
  const { t } = useT();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [topics, setTopics] = useState([]);
  const [msg, setMsg] = useState(null);
  const allTopics = ["math.linear_equations", "calc.basic_derivatives", "calc.product_rule", "calc.chain_rule", "ee.ohms_law",
    "ee.series_circuits", "ee.voltage_divider", "logic.binary_to_decimal", "logic.decimal_to_binary", "logic.boolean_algebra",
    "prog.loop_tracing", "prog.complexity"];

  const add = async (e) => {
    e.preventDefault();
    const r = await api("/learn/exams", { method: "POST", body: { title, exam_date: date, objectives: topics } });
    if (!r.ok) { setMsg(t(r.data?.error === "exam_in_past" ? "study.examPast" : "study.examInvalid")); return; }
    setTitle(""); setDate(""); setTopics([]); setMsg(null); onChanged();
  };
  const remove = async (id) => { if (confirm(t("study.examDeleteConfirm"))) { await api(`/learn/exams?id=${id}`, { method: "DELETE" }); onChanged(); } };

  return (
    <Card title={t("study.exams")}>
      {exams.length > 0 && (
        <ul className="mn-plan-list compact">
          {exams.map(e => (
            <li key={e.id}>
              <div><b>{e.title}</b> · {fmtDate(e.exam_date)}{e.objectives.length > 0 && <div className="mn-fine left">{e.objectives.map(o => t(`obj.${o}`)).join(", ")}</div>}</div>
              <span className="acts">
                {e.objectives.length > 0 && <Button variant="ghost" onClick={() => onExam(e.id)}>{t("study.mock")}</Button>}
                <button className="mn-link" onClick={() => remove(e.id)}>{t("study.delete")}</button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="mn-form">
        <Field label={t("study.examTitle")}><input style={inputStyle} value={title} maxLength={120} required onChange={e => setTitle(e.target.value)} placeholder={t("study.examTitlePh")} /></Field>
        <Field label={t("study.examDate")}><input style={inputStyle} type="date" value={date} required onChange={e => setDate(e.target.value)} /></Field>
        <fieldset className="mn-checks">
          <legend>{t("study.examTopics")}</legend>
          {allTopics.map(id => (
            <label key={id}><input type="checkbox" checked={topics.includes(id)}
              onChange={e => setTopics(e.target.checked ? [...topics, id] : topics.filter(x => x !== id))} /> {t(`obj.${id}`)}</label>
          ))}
        </fieldset>
        {msg && <Notice kind="error">{msg}</Notice>}
        <Button type="submit">{t("study.examAdd")}</Button>
      </form>
    </Card>
  );
}

function ProfileCard({ profile, onSaved }) {
  const { t } = useT();
  const empty = { education_level: "", year_of_study: "", institution: "", programme: "", curriculum: "", goals: "", subjects: "", study_minutes: [30, 30, 30, 30, 30, 0, 0] };
  const fromProfile = p => p ? { ...empty, ...Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v ?? ""])),
    subjects: (p.subjects ?? []).join(", "), study_minutes: p.study_minutes ?? empty.study_minutes } : empty;
  const [f, setF] = useState(fromProfile(profile));
  const [msg, setMsg] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    const body = {
      education_level: f.education_level || null, year_of_study: f.year_of_study ? Number(f.year_of_study) : null,
      institution: f.institution || null, programme: f.programme || null, curriculum: f.curriculum || null, goals: f.goals || null,
      subjects: f.subjects.split(",").map(s => s.trim()).filter(Boolean).slice(0, 15),
      study_minutes: f.study_minutes.map(m => Math.max(0, Math.min(600, Number(m) || 0))),
    };
    const r = await api("/learn/profile", { method: "POST", body });
    setMsg(r.ok ? { kind: "ok", text: t("study.saved") } : { kind: "error", text: t("study.error") });
    if (r.ok) onSaved();
  };
  const clear = async () => {
    if (!confirm(t("study.clearConfirm"))) return;
    await api("/learn/profile", { method: "POST", body: { education_level: null, year_of_study: null, institution: null, programme: null,
      curriculum: null, goals: null, subjects: [] } });
    setF(empty); onSaved();
  };

  return (
    <Card title={t("study.profile")}>
      <p className="mn-fine left">{t("study.profileNote")}</p>
      <form onSubmit={save} className="mn-form">
        <Field label={t("study.level")}>
          <select style={inputStyle} value={f.education_level} onChange={set("education_level")}>
            <option value="">—</option>
            {["secondary", "university", "professional", "other"].map(l => <option key={l} value={l}>{t(`study.levelOpt.${l}`)}</option>)}
          </select>
        </Field>
        <Field label={t("study.year")}><input style={inputStyle} type="number" min="1" max="12" value={f.year_of_study} onChange={set("year_of_study")} /></Field>
        <Field label={t("study.programme")}><input style={inputStyle} maxLength={120} value={f.programme} onChange={set("programme")} placeholder={t("study.programmePh")} /></Field>
        <Field label={t("study.institution")}><input style={inputStyle} maxLength={120} value={f.institution} onChange={set("institution")} /></Field>
        <Field label={t("study.curriculum")}><input style={inputStyle} maxLength={120} value={f.curriculum} onChange={set("curriculum")} placeholder={t("study.curriculumPh")} /></Field>
        <Field label={t("study.subjects")}><input style={inputStyle} value={f.subjects} onChange={set("subjects")} placeholder={t("study.subjectsPh")} /></Field>
        <Field label={t("study.goals")}><textarea style={{ ...inputStyle, minHeight: 60 }} maxLength={500} value={f.goals} onChange={set("goals")} /></Field>
        <fieldset className="mn-checks days">
          <legend>{t("study.minutesPerDay")}</legend>
          {DAYS.map(d => (
            <label key={d}>{t(`study.day.${d}`)}
              <input type="number" min="0" max="600" step="5" value={f.study_minutes[d]}
                onChange={e => setF({ ...f, study_minutes: f.study_minutes.map((m, i) => (i === d ? e.target.value : m)) })} />
            </label>
          ))}
        </fieldset>
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        <div className="mn-row">
          <Button type="submit">{t("study.save")}</Button>
          {profile && <Button variant="ghost" onClick={clear}>{t("study.clear")}</Button>}
        </div>
      </form>
    </Card>
  );
}
