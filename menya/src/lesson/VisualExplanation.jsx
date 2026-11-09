import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Maximize2, Minus, Plus, X } from "lucide-react";
import { isSafeSvg } from "../../../supabase/functions/_shared/svgKit.ts";
import { useT } from "../i18n.js";

// Pictures are drawn by the server and shown through <img>, where a browser runs no scripts at all.
// Each one is checked again here, because stored conversations outlive the code that wrote them.
const dataUri = svg => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

// A larger view for phones and for detailed diagrams.
function Expanded({ svg, alt, title, onClose }) {
  const { t } = useT();
  const [zoom, setZoom] = useState(1);
  const closeRef = useRef(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = e => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  // Rendered at page level: inside the chat column it would be trapped in the column's scrolling area.
  return createPortal(
    <div className="mn-visual-full" role="dialog" aria-modal="true" aria-label={title || t("picture.alt")}>
      <div className="mn-visual-full-bar">
        <button className="mn-btn icon" onClick={() => setZoom(z => Math.max(1, z - 0.5))} disabled={zoom <= 1} aria-label={t("visual.zoomOut")}><Minus size={18} /></button>
        <button className="mn-btn icon" onClick={() => setZoom(z => Math.min(4, z + 0.5))} disabled={zoom >= 4} aria-label={t("visual.zoomIn")}><Plus size={18} /></button>
        <span className="spacer" />
        <button ref={closeRef} className="mn-btn icon" onClick={onClose} aria-label={t("visual.close")}><X size={18} /></button>
      </div>
      <div className="mn-visual-full-body">
        <img src={dataUri(svg)} alt={alt} style={{ width: `${zoom * 100}%` }} />
      </div>
    </div>,
    document.body,
  );
}

function VisualTable({ table, title }) {
  return (
    <div className="mn-visual-table-wrap" tabIndex={0}>
      <table className="mn-visual-table">
        {title && <caption>{title}</caption>}
        <thead><tr>{table.headers.map((h, i) => <th key={i} scope="col" className={i === table.emphasise ? "em" : ""}>{h}</th>)}</tr></thead>
        <tbody>
          {table.rows.map((row, r) => (
            <tr key={r}>{row.map((c, i) => i === 0 && !table.headers[0]
              ? <th key={i} scope="row">{c}</th>
              : <td key={i} className={i === table.emphasise ? "em" : ""}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// One server-drawn picture for each position. The browser only chooses which to show.
function InteractiveLearningVisual({ frames, alt, onExpand }) {
  const { t } = useT();
  const [index, setIndex] = useState(frames.length - 1);
  const safe = frames.filter(f => isSafeSvg(f.svg));
  if (safe.length < 2) return null;
  const at = Math.min(index, safe.length - 1), frame = safe[at];
  return (
    <>
      <button type="button" className="mn-visual-img" onClick={() => onExpand(frame.svg)} aria-label={t("visual.expand")}>
        <img src={dataUri(frame.svg)} alt={`${alt} ${frame.label}`} />
        <span className="mn-visual-zoom" aria-hidden="true"><Maximize2 size={14} /></span>
      </button>
      <div className="mn-visual-slider">
        <input type="range" min={0} max={safe.length - 1} step={1} value={at} onChange={e => setIndex(Number(e.target.value))} aria-label={t("visual.step")} aria-valuetext={frame.label} />
        <output>{frame.label}</output>
      </div>
    </>
  );
}

// Every visual comes with its title and a description: a picture is never left to speak for itself.
export default function VisualExplanation({ diagram }) {
  const { t } = useT();
  const [full, setFull] = useState(null);
  const [broken, setBroken] = useState(false);
  if (!diagram) return null;
  const { svg, alt, title, table, frames } = diagram;
  const description = alt || t("picture.alt");
  const canDraw = svg && isSafeSvg(svg) && !broken;
  return (
    <figure className="mn-visual">
      {table && !svg && <VisualTable table={table} title={title} />}
      {frames?.length > 1 && canDraw
        ? <InteractiveLearningVisual frames={frames} alt={description} onExpand={setFull} />
        : canDraw && (
          <button type="button" className="mn-visual-img" onClick={() => setFull(svg)} aria-label={t("visual.expand")}>
            <img src={dataUri(svg)} alt={description} loading="lazy" onError={() => setBroken(true)} />
            <span className="mn-visual-zoom" aria-hidden="true"><Maximize2 size={14} /></span>
          </button>
        )}
      {svg && !canDraw && <p className="mn-visual-fallback">{t("visual.unavailable")} {description}</p>}
      {table && svg && canDraw && <VisualTable table={table} />}
      {(alt || svg) && canDraw && (
        <figcaption>
          <details><summary>{t("visual.describe")}</summary><p>{description}</p></details>
          <span>{t("picture.caption")}</span>
        </figcaption>
      )}
      {full && <Expanded svg={full} alt={description} title={title} onClose={() => setFull(null)} />}
    </figure>
  );
}
