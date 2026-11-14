import { useState } from "react";
import { useT } from "../i18n.js";
import Markdown from "../Markdown.jsx";
import MathLine from "./MathLine.jsx";

// "Test your understanding": a new problem of the same kind with options. The browser never knows which
// option is right: "Check answer" sends the choice to the server, which marks it with the question's own
// template, and the next reply explains. A wrong choice can be changed and checked again.
export default function QuizCard({ quiz, onAnswer, result, busy }) {
  const { t } = useT();
  const [choice, setChoice] = useState(null);
  const closed = result?.verdict === "correct";
  const name = `quiz-${quiz.question.length}-${quiz.options.join("|").length}`;
  return (
    <section className="mn-quiz" aria-label={t("quiz.title")}>
      <h3>{t("quiz.title")}</h3>
      <p className="mn-quiz-lead">{t("quiz.lead")}</p>
      <div className="mn-quiz-q"><Markdown>{quiz.question}</Markdown></div>
      <div className="mn-quiz-options" role="radiogroup" aria-label={t("quiz.options")}>
        {quiz.options.map(o => {
          const mark = result?.choice === o ? (result.verdict === "correct" ? "right" : "wrong") : "";
          return (
            <label key={o} className={`mn-quiz-opt ${mark} ${choice === o ? "chosen" : ""}`}>
              <input type="radio" name={name} value={o} checked={choice === o} disabled={closed || busy} onChange={() => setChoice(o)} />
              <MathLine text={o} display={false} />
              {mark && <span className="mn-quiz-mark">{t(mark === "right" ? "quiz.right" : "quiz.wrong")}</span>}
            </label>
          );
        })}
      </div>
      <button type="button" className="mn-btn primary block" disabled={!choice || closed || busy || (result && result.choice === choice)} onClick={() => onAnswer(choice)}>
        {t("quiz.check")}
      </button>
    </section>
  );
}
