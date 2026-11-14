import { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { plainToTex } from "../lib/mathTex.js";

// One equation, typeset. The text is plain (never TeX from a model: plainToTex refuses backslashes and
// braces), and KaTeX escapes everything it prints, so the HTML can be inserted. Anything that doesn't
// convert cleanly is shown as the plain text it was.
export default function MathLine({ text, display = true }) {
  const html = useMemo(() => {
    const tex = plainToTex(text);
    if (!tex) return null;
    try { return katex.renderToString(tex, { displayMode: display, throwOnError: true, strict: "ignore", output: "html" }); } catch { return null; }
  }, [text, display]);
  if (!html) return display ? <p className="mn-eq plain">{text}</p> : <span>{text}</span>;
  return display
    ? <div className="mn-eq" role="math" aria-label={text} dangerouslySetInnerHTML={{ __html: html }} />
    : <span role="math" aria-label={text} dangerouslySetInnerHTML={{ __html: html }} />;
}
