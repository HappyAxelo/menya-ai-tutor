import { Suspense, lazy } from "react";
import { Lightbulb, Eye, ListOrdered, PencilLine, MessageSquareText, ClipboardCheck } from "lucide-react";
import { parseLesson, unfoldSteps } from "../../../supabase/functions/_shared/lessonFormat.ts";
import { useT } from "../i18n.js";
import VisualExplanation from "./VisualExplanation.jsx";

// The maths renderer, the worked-example layout, the interactive visuals and the multiple-choice card are
// separate downloads, fetched once a reply has arrived, so the first screen stays light.
const Markdown = lazy(() => import("../Markdown.jsx"));
const WorkedExample = lazy(() => import("./WorkedExample.jsx"));
const QuizCard = lazy(() => import("./QuizCard.jsx"));
const LabView = lazy(() => import("./LabView.jsx"));
const Text = ({ children }) => <Suspense fallback={<p style={{ whiteSpace: "pre-wrap" }}>{children}</p>}><Markdown>{children}</Markdown></Suspense>;

const ICONS = { idea: Lightbulb, see: Eye, example: ListOrdered, try: PencilLine, feedback: MessageSquareText, check: ClipboardCheck };

// The student's part of the lesson stands apart from the explanation.
const QUESTION_SECTIONS = new Set(["try", "check"]);

// lab: an interactive visual for "See how it works" (it replaces a drawn picture there).
// quiz: a checked multiple-choice question, shown after "Try it yourself"; onQuiz sends the choice.
export function LessonSections({ lesson, diagram, settled, lab = null, quiz = null, quizResult = null, onQuiz = null, busy = false }) {
  const { t } = useT();
  // A lesson with a lab always shows "See how it works", even if the reply left that section out.
  let sections = lesson.sections;
  if (lab && !sections.some(s => s.id === "see")) {
    const at = sections.findIndex(s => s.id === "example" || QUESTION_SECTIONS.has(s.id));
    sections = at < 0 ? [...sections, { id: "see", body: "" }] : [...sections.slice(0, at), { id: "see", body: "" }, ...sections.slice(at)];
  }
  const hasSee = sections.some(s => s.id === "see");
  const visual = !settled ? null
    : lab ? <Suspense fallback={null}><LabView lab={lab} /></Suspense>
    : diagram ? <VisualExplanation diagram={diagram} /> : null;
  const quizCard = settled && quiz && onQuiz
    ? <Suspense fallback={null}><QuizCard quiz={quiz} result={quizResult} busy={busy} onAnswer={onQuiz} /></Suspense> : null;
  const hasTry = sections.some(s => s.id === "try");
  // Numbers follow the sections actually present, because not every lesson needs all of them.
  let number = 0;
  return (
    <div className="mn-lesson">
      {lesson.intro && <Text>{lesson.intro}</Text>}
      {sections.map((s, i) => {
        const Icon = ICONS[s.id];
        const asks = QUESTION_SECTIONS.has(s.id);
        // With no explanation section to sit in, the picture goes before the first question.
        const visualHere = s.id === "see" || (!hasSee && asks && !sections.slice(0, i).some(x => QUESTION_SECTIONS.has(x.id)));
        number += 1;
        return (
          <div key={`${s.id}-${i}`}>
            {visualHere && s.id !== "see" && visual}
            <section className={`mn-lesson-part ${asks ? "ask" : ""} part-${s.id}`}>
              <h3><span className="mn-lesson-n" aria-hidden="true">{number}</span><Icon size={15} aria-hidden="true" />{t(`lesson.${s.id}`)}</h3>
              {s.id === "see" && visual}
              {/* Every step of a worked example sits on its own line, also while the reply is still appearing. */}
              {s.id === "example"
                ? (settled ? <Suspense fallback={<Text>{unfoldSteps(s.body)}</Text>}><WorkedExample body={s.body} /></Suspense> : <Text>{unfoldSteps(s.body)}</Text>)
                : s.body ? <Text>{s.body}</Text> : null}
              {s.id === "try" && quizCard}
            </section>
          </div>
        );
      })}
      {!sections.some(s => s.id === "see" || QUESTION_SECTIONS.has(s.id)) && visual}
      {!hasTry && quizCard}
    </div>
  );
}

export { parseLesson };
