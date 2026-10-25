import { useEffect, useState } from "react";
import { listLearningEvents } from "../lib/backend.js";
import { summarizeProgress, topicStatus } from "../lib/chat.js";
import { Page, Card, Notice, Loading, Table, Button } from "./ui.jsx";

const STATUS = {
  shown: { label: "Shown on your own", cls: "ok", help: "You solved a practice question on this without hints or examples." },
  solved: { label: "Solved without help", cls: "info", help: "Try a practice question to check it sticks." },
  with_help: { label: "Solved with help", cls: "hint", help: "Try a similar question without hints or examples." },
};

// Built only from server-verified solves (learning_events). Messages, hints
// and explanations never count, so a new account starts empty.
export default function ProgressPage({ onBack }) {
  const [events, setEvents] = useState(null);
  const [error, setError] = useState(false);

  const load = () => { setError(false); setEvents(null); listLearningEvents().then(setEvents).catch(() => setError(true)); };
  useEffect(load, []);

  const p = events ? summarizeProgress(events) : null;

  return (
    <Page title="Your progress" onBack={onBack}
      subtitle="Only problems you actually solved appear here: your own answer, checked against the tutor's worked solution. Messages, hints and explanations don't count. Solving with hints or a worked example is counted as solved with help.">
      {error && <Notice kind="error">Couldn't load your progress. <Button variant="ghost" onClick={load}>Try again</Button></Notice>}
      {!events && !error && <Loading />}
      {p && p.solved === 0 && (
        <Card>
          <p className="mn-panel-text"><b>Nothing here yet.</b> When you solve a problem, it's recorded here with the topics it covered.</p>
          <p className="mn-panel-text">After you solve one, try <b>Try a similar question</b> under the tutor's reply. Solving that one without hints or worked examples is how a topic gets marked as shown on your own.</p>
          <Button onClick={onBack}>Start a problem</Button>
        </Card>
      )}
      {p && p.solved > 0 && (
        <>
          <div className="mn-stat-row">
            <div className="mn-stat"><div className="v">{p.solved}</div><div className="l">Problems solved</div></div>
            <div className="mn-stat"><div className="v">{p.independent}</div><div className="l">Solved without help</div></div>
            <div className="mn-stat"><div className="v">{p.practiceIndependent}</div><div className="l">Practice questions solved on your own</div></div>
          </div>
          <Card title="Topics">
            <Table rows={p.topics} empty="The tutor didn't tag topics on these problems."
              columns={[
                { key: "name", label: "Topic", wrap: true },
                { key: "solved", label: "Solved", align: "right" },
                { key: "status", label: "Status", wrap: true, render: t => {
                  const st = STATUS[topicStatus(t)];
                  return <span className={`mn-status ${st.cls}`} title={st.help}>{st.label}</span>;
                } },
                { key: "last", label: "Last solved", render: t => t.last ? new Date(t.last).toLocaleDateString() : "—" },
              ]} />
          </Card>
          <p className="mn-fine left">
            The check compares your answer with the tutor's own solution, which can occasionally be wrong. Topic names come from the tutor and may vary in wording.
          </p>
        </>
      )}
    </Page>
  );
}
