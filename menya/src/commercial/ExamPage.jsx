import { useEffect, useRef, useState } from "react";
import { api } from "../lib/backend.js";
import { useT } from "../i18n.js";
import { Page, Card, Button, Notice, Loading } from "./ui.jsx";
import Markdown from "../Markdown.jsx";

// Timed practice exams from the verified question bank. The browser never receives the
// answer keys: questions come from POST /exam/start and are marked by POST /exam/submit.
const TOPICS = ["math.linear_equations", "calc.basic_derivatives", "calc.product_rule", "calc.chain_rule", "ee.ohms_law",
  "ee.series_circuits", "ee.voltage_divider", "logic.binary_to_decimal", "logic.decimal_to_binary", "logic.boolean_algebra",
  "prog.loop_tracing", "prog.complexity"];
const VERDICT_CLASS = { correct: "ok", incorrect: "warn", unanswered: "hint" };
const clock = s => `${Math.floor(s / 60)}:${String(Math.max(0, s) % 60).padStart(2, "0")}`;

export default function ExamPage({ onBack, examId = null, count = 10, review = false, onStart }) {
  const { t } = useT();
  const [exam, setExam] = useState(null);         // { id, title, timeLimitSeconds, questions }
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const begin = async (body) => {
    setBusy(true); setError(null);
    const r = await api(review ? "/review/start" : "/exam/start", { method: "POST", body });
    setBusy(false);
    if (r.ok) { setExam(r.data); setResults(null); }
    else setError(t(r.data?.error === "choose_topics" ? "exam.chooseTopics" : r.data?.error === "exam_daily_limit" ? "exam.dailyLimit"
      : r.data?.error === "nothing_to_review" ? "exam.nothingToReview" : "exam.error"));
  };
  // Opened from an exam in the plan: start straight away.
  useEffect(() => { if (review) begin({}); else if (examId != null) begin({ examId, count }); }, [examId, review]); // eslint-disable-line react-hooks/exhaustive-deps

  const title = review ? t("exam.reviewTitle") : exam?.title ?? t("exam.title");
  return (
    <Page title={results ? t("exam.results") : title} subtitle={!exam && !results ? t("exam.sub") : null} onBack={onBack}>
      {error && <Notice kind="error">{error}</Notice>}
      {results ? <Results results={results} onStart={onStart} onAgain={() => { setExam(null); setResults(null); }} />
        : exam ? <Runner exam={exam} onDone={setResults} />
        : busy ? <Loading /> : review ? null : <Setup onBegin={begin} />}
    </Page>
  );
}

function Setup({ onBegin }) {
  const { t } = useT();
  const [topics, setTopics] = useState([]);
  const [count, setCount] = useState(8);
  const [history, setHistory] = useState(null);
  const [exams, setExams] = useState([]);
  useEffect(() => {
    api("/exam/history").then(r => setHistory(r.ok ? r.data.exams : []));
    api("/learn/state").then(r => setExams(r.ok ? r.data.exams.filter(e => e.objectives.length) : []));
  }, []);
  return (
    <>
      {exams.length > 0 && (
        <Card title={t("exam.forExam")}>
          <div className="mn-row wrap">{exams.map(e => <Button key={e.id} variant="ghost" onClick={() => onBegin({ examId: e.id, count: 10 })}>{e.title}</Button>)}</div>
        </Card>
      )}
      <Card title={t("exam.pickTopics")}>
        <fieldset className="mn-checks">
          <legend className="mn-fine left">{t("exam.pickNote")}</legend>
          {TOPICS.map(id => (
            <label key={id}><input type="checkbox" checked={topics.includes(id)}
              onChange={e => setTopics(e.target.checked ? [...topics, id] : topics.filter(x => x !== id))} /> {t(`obj.${id}`)}</label>
          ))}
        </fieldset>
        <div className="mn-row wrap">
          <label className="mn-fine left">{t("exam.count")}{" "}
            <select value={count} onChange={e => setCount(Number(e.target.value))}>{[5, 8, 12, 20].map(n => <option key={n} value={n}>{n}</option>)}</select>
          </label>
          <span className="mn-fine left">{t("exam.timeNote", { min: count * 3 })}</span>
        </div>
        <Button disabled={!topics.length} onClick={() => onBegin({ objectives: topics, count, title: t("exam.title") })}>{t("exam.begin")}</Button>
        <p className="mn-fine left">{t("exam.sourceNote")}</p>
      </Card>
      {history?.length > 0 && (
        <Card title={t("exam.history")}>
          <ul className="mn-plan-list compact">
            {history.map(h => <li key={h.id}><span>{h.title} · {new Date(h.started_at).toLocaleDateString()}</span>
              <b>{h.score ? `${h.score.correct}/${h.score.total}` : t("exam.notSubmitted")}</b></li>)}
          </ul>
        </Card>
      )}
    </>
  );
}

function Runner({ exam, onDone }) {
  const { t } = useT();
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState({});
  const timed = exam.timeLimitSeconds != null;   // review sets are untimed
  const [left, setLeft] = useState(exam.timeLimitSeconds ?? 0);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const seconds = useRef({});
  const since = useRef(Date.now());
  const q = exam.questions[i];

  // Time on each question (for the results), and the countdown.
  const note = () => { const n = exam.questions[i].n; seconds.current[n] = (seconds.current[n] ?? 0) + (Date.now() - since.current) / 1000; since.current = Date.now(); };
  useEffect(() => { if (!timed) return; const id = setInterval(() => setLeft(l => l - 1), 1000); return () => clearInterval(id); }, [timed]);
  const go = (to) => { note(); setI(to); };

  const submit = async () => {
    note();
    const blank = exam.questions.filter(x => !String(answers[x.n] ?? "").trim()).length;
    if (blank && (!timed || left > 0) && !confirm(t("exam.blankConfirm", { n: blank }))) return;
    setSending(true); setError(null);
    const r = await api("/exam/submit", { method: "POST", body: { id: exam.id, answers, seconds: seconds.current } });
    setSending(false);
    if (r.ok) onDone(r.data);
    else if (r.status === 409) setError(t("exam.already"));
    else setError(t("exam.error"));
  };

  return (
    <Card>
      <div className="mn-exam-bar">
        <span>{t("exam.questionOf", { n: i + 1, total: exam.questions.length })}</span>
        {timed && <span className={left < 60 ? "mn-status warn" : "mn-status"} aria-live="off">{left > 0 ? clock(left) : t("exam.timeUp")}</span>}
      </div>
      <div className="mn-fine left">{t(`obj.${q.objective}`)}{q.retry && <> · <span className="mn-status hint">{t("exam.retry")}</span></>}</div>
      <div className="mn-exam-q"><Markdown>{q.question}</Markdown></div>
      <label className="mn-fine left" htmlFor="mn-exam-answer">{t("exam.yourAnswer")}</label>
      <textarea id="mn-exam-answer" className="mn-exam-answer" value={answers[q.n] ?? ""} maxLength={2000}
        onChange={e => setAnswers({ ...answers, [q.n]: e.target.value })} placeholder={t("exam.answerPh")} />
      <div className="mn-exam-dots" role="group" aria-label={t("exam.jump")}>
        {exam.questions.map((x, k) => (
          <button key={x.n} className={`${k === i ? "current " : ""}${String(answers[x.n] ?? "").trim() ? "answered" : ""}`}
            onClick={() => go(k)} aria-label={t("exam.questionOf", { n: k + 1, total: exam.questions.length })}>{k + 1}</button>
        ))}
      </div>
      {error && <Notice kind="error">{error}</Notice>}
      <div className="mn-row">
        <Button variant="ghost" disabled={i === 0} onClick={() => go(i - 1)}>{t("exam.prev")}</Button>
        {i < exam.questions.length - 1
          ? <Button variant="ghost" onClick={() => go(i + 1)}>{t("exam.next")}</Button>
          : null}
        <Button disabled={sending} onClick={submit}>{sending ? t("exam.marking") : t("exam.submit")}</Button>
      </div>
    </Card>
  );
}

function Results({ results, onStart, onAgain }) {
  const { t } = useT();
  const { score, results: items, byObjective } = results;
  const avg = items.filter(r => r.seconds != null);
  return (
    <>
      <Card>
        <div className="mn-stat-row">
          <div className="mn-stat"><div className="v">{score.correct}/{score.total}</div><div className="l">{t("exam.correct")}</div></div>
          <div className="mn-stat"><div className="v">{score.unanswered}</div><div className="l">{t("exam.unanswered")}</div></div>
          <div className="mn-stat"><div className="v">{clock(results.elapsedSeconds)}</div><div className="l">{t("exam.timeTaken")}</div></div>
        </div>
        {results.late && <Notice kind="info">{t("exam.late")}</Notice>}
        <p className="mn-fine left">{t(results.mode === "review" ? "exam.reviewCountsNote" : "exam.countsNote")}</p>
      </Card>
      <Card title={t("exam.revise")}>
        <ul className="mn-plan-list">
          {byObjective.map(o => (
            <li key={o.objective}>
              <div><b>{t(`obj.${o.objective}`)}</b>: {o.correct}/{o.total}
                {o.misconceptions.length > 0 && <div className="mn-fine left">{t("exam.likelyCause")}: {o.misconceptions.join("; ")}</div>}</div>
              {o.revise ? <Button variant="ghost" onClick={() => onStart({ objective: o.objective })}>{t("exam.practise")}</Button>
                : <span className="mn-status ok">{t("exam.allRight")}</span>}
            </li>
          ))}
        </ul>
      </Card>
      <Card title={t("exam.answers")}>
        <ol className="mn-exam-review">
          {items.map(r => (
            <li key={r.n}>
              <Markdown>{r.question}</Markdown>
              <div><span className={`mn-status ${VERDICT_CLASS[r.verdict]}`}>{t(`exam.v.${r.verdict}`)}</span>
                {r.seconds != null && avg.length > 0 && <span className="mn-fine"> · {clock(r.seconds)}</span>}</div>
              {r.given && <div className="mn-fine left">{t("exam.youWrote")}: {r.given}</div>}
              {r.verdict !== "correct" && <div className="mn-fine left">{t("exam.expected")}: <b>{r.correctAnswer}</b></div>}
              {r.misconception && <div className="mn-fine left">{t("exam.likelyCause")}: {r.misconception}</div>}
            </li>
          ))}
        </ol>
        <Button onClick={onAgain}>{t("exam.another")}</Button>
      </Card>
    </>
  );
}
