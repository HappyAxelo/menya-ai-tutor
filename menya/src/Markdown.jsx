import { memo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Check, Copy } from "lucide-react";
import "katex/dist/katex.min.css";
import { repairLatex } from "./latexRepair.js";

// Code blocks get a copy button that copies the code only.
function CodeBlock({ node: _node, children, ...props }) {
  const ref = useRef(null);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(ref.current?.innerText ?? ""); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  };
  return (
    <div className="mn-code">
      <button type="button" className="mn-code-copy" onClick={copy} aria-label="Copy code">
        {copied ? <Check size={13} /> : <Copy size={13} />}{copied ? "Copied" : "Copy"}
      </button>
      <pre ref={ref} {...props}>{children}</pre>
    </div>
  );
}

// Tutor replies: Markdown plus LaTeX ($…$ inline, $$…$$ display). Raw HTML is
// not rendered (react-markdown's default), so replies can't inject markup.
const components = {
  a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
  pre: CodeBlock,
};

function Markdown({ children }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: "ignore" }]]} components={components}>
      {repairLatex(children)}
    </ReactMarkdown>
  );
}

export default memo(Markdown);
