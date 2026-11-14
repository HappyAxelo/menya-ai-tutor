import { useT } from "../i18n.js";
import { STAGES, stageIndex } from "../lib/learning.js";

// Where a learner stands on one topic: five steps, filled up to the stage their marked answers
// support, and the evidence the next step needs. Never a percentage.
export default function StageSteps({ stage, next, compact = false }) {
  const { t } = useT();
  const at = stageIndex(stage);
  return (
    <div className={`mn-stages${compact ? " compact" : ""}`}>
      <ol aria-label={`${t("stage.label")}: ${t(`stage.${stage}`)}`}>
        {STAGES.map((s, i) => (
          <li key={s} className={i <= at ? "reached" : ""} aria-current={i === at ? "step" : undefined}>
            <span className="dot" aria-hidden="true" />
            <span className="name">{t(`stage.short.${s}`)}</span>
          </li>
        ))}
      </ol>
      {next && <p className="mn-fine left">{t(`evidence.${next}`)}</p>}
    </div>
  );
}
