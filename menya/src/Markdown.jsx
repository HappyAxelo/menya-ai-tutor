import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { repairLatex } from "./latexRepair.js";

// Tutor replies: Markdown plus LaTeX ($…$ inline, $$…$$ display). Raw HTML is
// not rendered (react-markdown's default), so replies can't inject markup.
const components = {
  a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
};

function Markdown({ children }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: "ignore" }]]} components={components}>
      {repairLatex(children)}
    </ReactMarkdown>
  );
}

export default memo(Markdown);
