import { Suspense, lazy, useState } from "react";
import { Lightbulb, Eye, ListOrdered, PencilLine, MessageSquareText, ClipboardCheck, ChevronRight } from "lucide-react";
import { parseLesson, splitSteps, unfoldSteps } from "../../../supabase/functions/_shared/lessonFormat.ts";
import { useT } from "../i18n.js";
import VisualExplanation from "./VisualExplanation.jsx";

const Markdown = lazy(() => import("../Markdown.jsx"));
const Text = ({ children }) => <Suspense fallback={<p style={{ whiteSpace: "pre-wrap" }}>{children}</p>}><Markdown>{children}</Markdown></Suspense>;

const ICONS = { idea: Lightbulb, see: Eye, example: ListOrdered, try: PencilLine, feedback: MessageSquareText, check: ClipboardCheck };

// A worked example as a numbered list: every step on its own line, all visible at once (the owner's choice,
// 14 November 2026). Starting `shown` at 1 instead brings back one-step-at-a-time reveal with its buttons.
function StepByStepExample({ body }) {
  const { t } = useT();
  const parts = splitSteps(body);
  const [shown, setShown] = useState(Number.MAX_SAFE_INTEGER);
  if (!parts) return <Text>{body}</Text>;
  const { lead, steps, tail } = parts;
  const finished = shown >= steps.length;
  return (
    <div className="mn-steps">
      {lead && <Text>{lead}</Text>}
      <ol>
        {steps.slice(0, shown).map((s, i) => <li key={i}><span className="mn-step-n" aria-hidden="true">{i + 1}</span><div><Text>{s}</Text></div></li>)}
      </ol>
      {!finished && (
        <div className="mn-step-actions">
          <button type="button" className="mn-btn outline" onClick={() => setShown(n => n + 1)}><ChevronRight size={15} aria-hidden="true" />{t("lesson.nextStep", { n: shown + 1, total: steps.length })}</button>
          <button type="button" className="mn-link" onClick={() => setShown(steps.length)}>{t("lesson.showAll")}</button>
        </div>
      )}
      {finished && tail && <Text>{tail}</Text>}
    </div>
  );
}

// The student's part of the lesson stands apart from the explanation.
const QUESTION_SECTIONS = new Set(["try", "check"]);

export function LessonSections({ lesson, diagram, settled }) {
  const { t } = useT();
  const hasSee = lesson.sections.some(s => s.id === "see");
  const picture = settled && diagram ? <VisualExplanation diagram={diagram} /> : null;
  // Numbers follow the sections actually present, because not every lesson needs all of them.
  let number = 0;
  return (
    <div className="mn-lesson">
      {lesson.intro && <Text>{lesson.intro}</Text>}
      {lesson.sections.map((s, i) => {
        const Icon = ICONS[s.id];
        const asks = QUESTION_SECTIONS.has(s.id);
        // With no explanation section to sit in, the picture goes before the first question.
        const pictureHere = s.id === "see" || (!hasSee && asks && !lesson.sections.slice(0, i).some(x => QUESTION_SECTIONS.has(x.id)));
        number += 1;
        return (
          <div key={`${s.id}-${i}`}>
            {pictureHere && s.id !== "see" && picture}
            <section className={`mn-lesson-part ${asks ? "ask" : ""} part-${s.id}`}>
              <h3><span className="mn-lesson-n" aria-hidden="true">{number}</span><Icon size={15} aria-hidden="true" />{t(`lesson.${s.id}`)}</h3>
              {s.id === "see" && picture}
              {/* Every step of a worked example sits on its own line, also while the reply is still appearing. */}
              {s.id === "example" ? (settled ? <StepByStepExample body={s.body} /> : <Text>{unfoldSteps(s.body)}</Text>) : <Text>{s.body}</Text>}
            </section>
          </div>
        );
      })}
      {!lesson.sections.some(s => s.id === "see" || QUESTION_SECTIONS.has(s.id)) && picture}
    </div>
  );
}

export { parseLesson };
