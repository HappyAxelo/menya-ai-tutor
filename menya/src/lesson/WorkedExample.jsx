import { splitSteps } from "../../../supabase/functions/_shared/lessonFormat.ts";
import { splitStep } from "../lib/mathTex.js";
import Markdown from "../Markdown.jsx";
import MathLine from "./MathLine.jsx";

// A worked example laid out like a textbook: "1. Identify what we know", the sentence that explains the
// step, then each equation centred on a line of its own. Loaded with the maths renderer, after the reply.
export default function WorkedExample({ body }) {
  const parts = splitSteps(body);
  if (!parts) return <Markdown>{body}</Markdown>;
  const { lead, steps, tail } = parts;
  return (
    <div className="mn-worked">
      {lead && <Markdown>{lead}</Markdown>}
      <ol>
        {steps.map((s, i) => {
          const { title, parts: lines } = splitStep(s);
          return (
            <li key={i}>
              <h4><span className="n">{i + 1}.</span>{title ? <Markdown>{title}</Markdown> : null}</h4>
              {lines.map((p, k) => (p.type === "math" ? <MathLine key={k} text={p.value} /> : <Markdown key={k}>{p.value}</Markdown>))}
            </li>
          );
        })}
      </ol>
      {tail && <Markdown>{tail}</Markdown>}
    </div>
  );
}
