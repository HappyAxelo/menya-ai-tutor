import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookmarkPlus, BookmarkCheck, Copy, Check, Download, ExternalLink, FolderPlus, Search, Sparkles, X } from "lucide-react";
import { api, downloadWithAuth } from "../lib/backend.js";
import { Page, Card, Button, Notice, Loading, Field, inputStyle } from "./ui.jsx";

// Menya Research: discovery, the evidence meter, paper analysis, synthesis and the workspace.
// Everything shown comes from the server: retrieved records, checked assessments, and counts it computed.
const CATS = ["supports", "contradicts", "mixed", "insufficient"];
const CAT_LABEL = { supports: "Supports", contradicts: "Contradicts", mixed: "Mixed", insufficient: "Insufficient", not_relevant: "Not relevant", no_text: "No text" };
const KIND = { journal_article: "Journal article", review: "Review", preprint: "Preprint: not peer reviewed", conference: "Conference paper", book: "Book or chapter", report: "Report", other: "Type not confirmed" };
const STRENGTH = { stronger: "Stronger design", moderate: "Moderate design", limited: "Limited design", very_limited: "Very limited design", unclear: "Design unclear" };
const STYLE_NAMES = { apa: "APA 7", ieee: "IEEE", harvard: "Harvard", vancouver: "Vancouver" };
const SUGGESTED = [
  "Does AI-assisted learning improve independent problem-solving among university students?",
  "Artificial intelligence AND higher education AND Africa",
  "\"drone-based larviciding\" AND malaria",
  "Earth observation AND mosquito breeding habitats",
];
const errorText = (r) => r.data?.message ?? ({ research_search_limit: "You've used this month's research searches.", research_not_included: "Research isn't included in your plan.", no_search_words: "Add the words to search for.", invalid_year: "Check the years." }[r.data?.error] ?? "Something went wrong. Please try again.");
const authorsShort = (a) => (a.length > 3 ? `${a.slice(0, 3).join(", ")} et al.` : a.join(", "));

export default function ResearchPage({ onBack }) {
  const [ws, setWs] = useState(null);
  const [view, setView] = useState(null);       // the open search
  const [msg, setMsg] = useState(null);
  const loadWs = useCallback(async () => { const r = await api("/research/workspace"); if (r.ok) setWs(r.data); else setMsg({ kind: "error", text: errorText(r) }); }, []);
  useEffect(() => { loadWs(); }, [loadWs]);
  const open = async (id) => { setMsg(null); const r = await api(`/research/search/${id}`); if (r.ok) setView(r.data); else setMsg({ kind: "error", text: errorText(r) }); };

  if (view) return <SearchView view={view} setView={setView} ws={ws} reloadWs={loadWs} onClose={() => { setView(null); loadWs(); }} />;
  return (
    <Page title="Research" subtitle="From a question to the papers behind the answer" onBack={onBack} className="mn-rs">
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      <SearchForm ws={ws} onDone={(v) => { setView(v); loadWs(); }} setMsg={setMsg} />
      {!ws ? <Loading /> : <Home ws={ws} open={open} reload={loadWs} setMsg={setMsg} />}
    </Page>
  );
}

function SearchForm({ ws, onDone, setMsg }) {
  const [q, setQ] = useState("");
  const [fromYear, setFrom] = useState(""), [toYear, setTo] = useState("");
  const [projectId, setProject] = useState("");
  const [busy, setBusy] = useState(false);
  const lim = ws?.limits;
  const left = lim ? Math.max(Number(lim.limits.searches_per_month ?? 0) - Number(lim.used.searches ?? 0), 0) : null;
  const go = async (e) => {
    e.preventDefault();
    if (q.trim().length < 3) return;
    setBusy(true); setMsg(null);
    const r = await api("/research/search", { method: "POST", timeoutMs: 45000, body: { question: q.trim(), filters: { fromYear: fromYear || null, toYear: toYear || null }, projectId: projectId || null } });
    setBusy(false);
    if (r.ok) onDone(r.data); else setMsg({ kind: "error", text: errorText(r) });
  };
  return (
    <Card>
      <form onSubmit={go} className="mn-form">
        <Field label="Research question or search">
          <textarea style={{ ...inputStyle, minHeight: 72 }} value={q} onChange={e => setQ(e.target.value)} maxLength={1000}
            placeholder={'A question, or keywords with AND, OR, NOT and "exact phrases"'} />
        </Field>
        <div className="mn-rs-row">
          <Field label="From year"><input style={inputStyle} type="number" min="1900" max="2100" value={fromYear} onChange={e => setFrom(e.target.value)} /></Field>
          <Field label="To year"><input style={inputStyle} type="number" min="1900" max="2100" value={toYear} onChange={e => setTo(e.target.value)} /></Field>
          {ws?.projects?.length > 0 && (
            <Field label="Project"><select style={inputStyle} value={projectId} onChange={e => setProject(e.target.value)}>
              <option value="">None</option>{ws.projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select></Field>
          )}
        </div>
        <div className="mn-row wrap">
          <Button type="submit" disabled={busy || q.trim().length < 3}><Search size={15} aria-hidden="true" /> {busy ? "Searching the databases…" : "Search"}</Button>
          {left != null && <span className="mn-fine">{left} of {lim.limits.searches_per_month ?? 0} searches left this month</span>}
        </div>
      </form>
      {!q && <div className="mn-rs-suggest">{SUGGESTED.map(s => <button key={s} type="button" className="mn-tag-chip" onClick={() => setQ(s)}>{s}</button>)}</div>}
    </Card>
  );
}

function Home({ ws, open, reload, setMsg }) {
  const [title, setTitle] = useState("");
  const create = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    const r = await api("/research/projects", { method: "POST", body: { title: title.trim() } });
    if (r.ok) { setTitle(""); reload(); } else setMsg({ kind: "error", text: errorText(r) });
  };
  return (
    <>
      <Card title="Recent searches">
        {!ws.searches.length ? <p className="mn-panel-text">No searches yet.</p> : (
          <ul className="mn-rs-list">{ws.searches.map(s => (
            <li key={s.id}><button className="mn-link" onClick={() => open(s.id)}>{s.question}</button>
              <span className="mn-fine"> · {new Date(s.created_at).toLocaleDateString()} · {s.papers} papers · {s.assessed} assessed</span></li>))}</ul>
        )}
      </Card>
      <Card title="Projects">
        <form onSubmit={create} className="mn-row wrap">
          <input style={{ ...inputStyle, flex: "1 1 200px" }} value={title} onChange={e => setTitle(e.target.value)} placeholder="New project name" maxLength={200} aria-label="New project name" />
          <Button type="submit" variant="ghost"><FolderPlus size={15} aria-hidden="true" /> Create</Button>
        </form>
        <ul className="mn-rs-list">{ws.projects.map(p => (
          <li key={p.id}><b>{p.title}</b><span className="mn-fine"> · {p.searches} searches · {p.saved} saved papers</span>
            <button className="mn-link danger" onClick={async () => { if (confirm(`Delete the project "${p.title}"? Its saved papers go too; searches stay.`)) { await api("/research/projects", { method: "POST", body: { id: p.id, delete: true } }); reload(); } }}> Delete</button></li>))}</ul>
      </Card>
      <Card title="Saved papers">
        {!ws.saved.length ? <p className="mn-panel-text">Papers you save appear here, with your notes.</p> : (
          <ul className="mn-rs-list">{ws.saved.map(s => <SavedItem key={s.id} s={s} projects={ws.projects} reload={reload} />)}</ul>
        )}
      </Card>
      <p className="mn-fine left">Your searches, projects and notes are private to your account. Searches use public academic databases; only search words are sent to them.</p>
    </>
  );
}

function SavedItem({ s, projects, reload }) {
  const [note, setNote] = useState(s.note);
  const project = projects.find(p => p.id === s.project_id);
  const save = async () => { await api("/research/saved", { method: "POST", body: { paper_key: s.paper_key, project_id: s.project_id, note } }); reload(); };
  return (
    <li>
      <a href={s.data.url} target="_blank" rel="noopener noreferrer">{s.data.title}</a>
      <span className="mn-fine"> · {s.data.year ?? "n.d."}{project ? ` · ${project.title}` : ""}</span>
      <textarea style={{ ...inputStyle, minHeight: 44, marginTop: 6 }} value={note} onChange={e => setNote(e.target.value)} onBlur={() => note !== s.note && save()} placeholder="Your note" maxLength={5000} aria-label={`Note on ${s.data.title}`} />
      <button className="mn-link danger" onClick={async () => { await api("/research/saved", { method: "POST", body: { delete: true, id: s.id } }); reload(); }}>Remove</button>
    </li>
  );
}

// ---------- One search ----------
function SearchView({ view, setView, ws, reloadWs, onClose }) {
  const [tab, setTab] = useState("papers");
  const [detail, setDetail] = useState(null);
  const [msg, setMsg] = useState(null);
  const [compare, setCompare] = useState([]);
  const s = view.search;
  const refresh = async () => { const r = await api(`/research/search/${s.id}`); if (r.ok) setView(r.data); };
  const more = async () => {
    setMsg({ kind: "info", text: "Fetching the next page from each database…" });
    const r = await api(`/research/search/${s.id}/more`, { method: "POST", timeoutMs: 45000 });
    if (r.ok) { setView(r.data); setMsg(null); } else setMsg({ kind: "error", text: errorText(r) });
  };
  const saved = new Map(view.saved.map(x => [x.paper_key, x]));
  const toggleSave = async (key) => {
    const x = saved.get(key);
    await api("/research/saved", { method: "POST", body: x ? { delete: true, id: x.id } : { paper_key: key, project_id: s.project_id } });
    refresh(); reloadWs();
  };
  const exp = (format) => downloadWithAuth(`/research/search/${s.id}/export?format=${format}&style=apa`, `menya-research.${format}`).catch(() => setMsg({ kind: "error", text: "Export failed." }));
  const paperProps = { view, saved, toggleSave, openDetail: setDetail, compare, setCompare };
  return (
    <main className="mn-page mn-rs">
      <button onClick={onClose} className="mn-back">← All research</button>
      <h1 className="mn-rs-q">{s.question}</h1>
      <p className="mn-page-sub">{view.counts.total} papers · {view.counts.abstracts} with abstracts · {view.counts.open_access} open access · searched {new Date(s.created_at).toLocaleDateString()}</p>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      <div className="mn-rs-tabs" role="tablist">
        {[["papers", "Papers"], ["evidence", "Evidence meter"], ["synthesis", "Synthesis"], ["strategy", "Search details"]].map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>{label}</button>))}
        <span className="spacer" />
        <span className="mn-rs-export"><Download size={14} aria-hidden="true" /> Export:
          {[["ris", "RIS"], ["bib", "BibTeX"], ["csv", "CSV"], ["md", "Report"]].map(([f, l]) => <button key={f} className="mn-link" onClick={() => exp(f)}>{l}</button>)}</span>
      </div>
      {tab === "papers" && <Papers {...paperProps} more={more} />}
      {tab === "evidence" && <Evidence view={view} setView={setView} setMsg={setMsg} openDetail={setDetail} />}
      {tab === "synthesis" && <SynthesisTab view={view} setView={setView} setMsg={setMsg} openDetail={setDetail} />}
      {tab === "strategy" && <Strategy view={view} ws={ws} setView={setView} refresh={refresh} />}
      {compare.length >= 2 && <Compare view={view} keys={compare} onClose={() => setCompare([])} />}
      {detail && <Detail view={view} paperKey={detail} onClose={() => setDetail(null)} saved={saved} toggleSave={toggleSave} />}
    </main>
  );
}

function Papers({ view, saved, toggleSave, openDetail, compare, setCompare, more }) {
  const [f, setF] = useState({ from: "", to: "", kind: "", oa: false, source: "", venue: "", cat: "", sort: "relevance" });
  const [page, setPage] = useState(0);
  const catOf = useMemo(() => { const m = new Map(); for (const a of view.assessments) if (CATS.includes(a.category)) m.set(a.paper_key, [...(m.get(a.paper_key) ?? []), a.category]); return m; }, [view]);
  const sources = [...new Set(view.papers.flatMap(p => p.found_in))];
  let list = view.papers.filter(p => (!f.from || (p.data.year ?? 0) >= Number(f.from)) && (!f.to || (p.data.year ?? 9999) <= Number(f.to)) && (!f.kind || p.data.kind === f.kind)
    && (!f.oa || p.data.openAccessUrl) && (!f.source || p.found_in.includes(f.source)) && (!f.venue || (p.data.venue ?? "").toLowerCase().includes(f.venue.toLowerCase()))
    && (!f.cat || (catOf.get(p.key) ?? []).includes(f.cat)));
  if (f.sort === "date") list = [...list].sort((a, b) => (b.data.year ?? 0) - (a.data.year ?? 0));
  if (f.sort === "citations") list = [...list].sort((a, b) => (b.data.citedBy ?? -1) - (a.data.citedBy ?? -1));
  const per = 10, pages = Math.max(1, Math.ceil(list.length / per));
  const shown = list.slice(page * per, page * per + per);
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }); setPage(0); };
  return (
    <>
      <div className="mn-rs-filters">
        <input style={inputStyle} type="number" placeholder="From year" value={f.from} onChange={set("from")} aria-label="From year" />
        <input style={inputStyle} type="number" placeholder="To year" value={f.to} onChange={set("to")} aria-label="To year" />
        <select style={inputStyle} value={f.kind} onChange={set("kind")} aria-label="Publication type"><option value="">All types</option>{Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select style={inputStyle} value={f.source} onChange={set("source")} aria-label="Database"><option value="">All databases</option>{sources.map(x => <option key={x} value={x}>{x}</option>)}</select>
        <input style={inputStyle} placeholder="Journal or conference" value={f.venue} onChange={set("venue")} aria-label="Journal or conference" />
        <select style={inputStyle} value={f.cat} onChange={set("cat")} aria-label="Evidence"><option value="">Any evidence</option>{CATS.map(c => <option key={c} value={c}>{CAT_LABEL[c]}</option>)}</select>
        <select style={inputStyle} value={f.sort} onChange={set("sort")} aria-label="Sort"><option value="relevance">Relevance</option><option value="date">Newest</option><option value="citations">Most cited</option></select>
        <label className="mn-rs-check"><input type="checkbox" checked={f.oa} onChange={set("oa")} /> Open access</label>
      </div>
      <p className="mn-fine left">{list.length} of {view.papers.length} papers. Relevance ranks by how closely the title and abstract match your search, not by citations.</p>
      {shown.map(p => <PaperCard key={p.key} p={p} saved={saved.has(p.key)} toggleSave={toggleSave} openDetail={openDetail} cats={catOf.get(p.key)}
        compared={compare.includes(p.key)} toggleCompare={() => setCompare(c => (c.includes(p.key) ? c.filter(x => x !== p.key) : [...c, p.key].slice(-3)))} />)}
      <div className="mn-row wrap" style={{ marginTop: 12 }}>
        {pages > 1 && <>
          <Button variant="ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
          <span className="mn-fine">Page {page + 1} of {pages}</span>
          <Button variant="ghost" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Next</Button></>}
        <Button variant="ghost" onClick={more}>Find more papers</Button>
      </div>
    </>
  );
}

function PaperCard({ p, saved, toggleSave, openDetail, cats, compared, toggleCompare }) {
  const [open, setOpen] = useState(false);
  const d = p.data;
  return (
    <article className="mn-rs-paper">
      <h3><a href={d.url} target="_blank" rel="noopener noreferrer">{d.title}</a></h3>
      <div className="mn-fine left">{authorsShort(d.authors)}{d.authors.length ? " · " : ""}{d.year ?? "n.d."}{d.venue ? ` · ${d.venue}` : ""}{d.doi ? ` · doi:${d.doi}` : ""}</div>
      <div className="mn-source-tags">
        <span className={`mn-source-tag ${d.kind === "preprint" ? "warn" : ""}`}>{KIND[d.kind] ?? d.kind}</span>
        {p.found_in.map(x => <span key={x} className="mn-source-tag">{x}</span>)}
        {d.citedBy != null && <span className="mn-source-tag" title={`Count from ${d.connector}, retrieved ${new Date(p.retrieved_at).toLocaleDateString()}`}>{d.citedBy} citations ({d.connector})</span>}
        {d.openAccessUrl && <a className="mn-source-tag link" href={d.openAccessUrl} target="_blank" rel="noopener noreferrer">Open access <ExternalLink size={11} aria-hidden="true" /></a>}
        {(cats ?? []).map((c, i) => <span key={i} className={`mn-rs-cat ${c}`}>{CAT_LABEL[c]}</span>)}
      </div>
      {d.abstract ? <p className="mn-rs-abs">{open ? d.abstract : `${d.abstract.slice(0, 260)}${d.abstract.length > 260 ? "…" : ""}`}
        {d.abstract.length > 260 && <button className="mn-link" onClick={() => setOpen(!open)}>{open ? " Less" : " More"}</button>}</p>
        : <p className="mn-fine left">No abstract available from the databases.</p>}
      <div className="mn-row wrap">
        <button className="mn-btn outline" onClick={() => toggleSave(p.key)}>{saved ? <BookmarkCheck size={14} /> : <BookmarkPlus size={14} />}{saved ? "Saved" : "Save"}</button>
        <button className="mn-btn outline" onClick={() => openDetail(p.key)}>Details and citation</button>
        <label className="mn-rs-check"><input type="checkbox" checked={compared} onChange={toggleCompare} /> Compare</label>
      </div>
    </article>
  );
}

// ---------- Evidence ----------
function Meter({ meter, onPick, picked }) {
  if (!meter.relevant) return <p className="mn-fine left">No relevant papers assessed yet.</p>;
  return (
    <div>
      <div className="mn-rs-meter" role="group" aria-label="Evidence meter">
        {CATS.filter(c => meter.counts[c]).map(c => (
          <button key={c} className={`seg ${c}${picked === c ? " picked" : ""}`} style={{ flexGrow: meter.counts[c] }} onClick={() => onPick(picked === c ? null : c)}
            aria-label={`${CAT_LABEL[c]}: ${meter.counts[c]} of ${meter.relevant} papers (${meter.percent[c]}%)`}>{meter.percent[c]}%</button>))}
      </div>
      <div className="mn-rs-legend">{CATS.map(c => (
        <button key={c} className={`mn-rs-cat ${c}`} onClick={() => onPick(picked === c ? null : c)} aria-pressed={picked === c}>
          {CAT_LABEL[c]}: {meter.counts[c]} of {meter.relevant} papers ({meter.percent[c]}%)</button>))}</div>
      <p className="mn-fine left">{meter.assessed} assessed · {meter.excluded.not_relevant} not relevant · {meter.excluded.no_text} without text. These shares describe the papers retrieved and assessed in this search, not all research, and not the chance the claim is true.</p>
    </div>
  );
}

function Evidence({ view, setView, setMsg, openDetail }) {
  const [running, setRunning] = useState(null);   // claim id
  const [progress, setProgress] = useState("");
  const [picked, setPicked] = useState({});
  const [newClaim, setNewClaim] = useState("");
  const [suggested, setSuggested] = useState(null);
  const stop = useRef(false);
  const s = view.search;
  const titles = new Map(view.papers.map(p => [p.key, p.data]));
  const run = async (claimId) => {
    setRunning(claimId); stop.current = false; setMsg(null);
    for (let i = 0; i < 40 && !stop.current; i++) {
      const r = await api(`/research/search/${s.id}/assess`, { method: "POST", timeoutMs: 95000, body: { claimId } });
      if (r.status === 503 && r.data?.retry_after_seconds) {
        for (let w = r.data.retry_after_seconds; w > 0 && !stop.current; w--) { setProgress(`The AI is busy; continuing in ${w} s`); await new Promise(res => setTimeout(res, 1000)); }
        continue;
      }
      if (!r.ok) { setMsg({ kind: r.status === 429 ? "info" : "error", text: errorText(r) }); break; }
      setView(r.data);
      const a = r.data.assessments.filter(x => x.claim_id === claimId).length;
      setProgress(`${a} papers checked so far`);
      if (r.data.done) break;
    }
    setRunning(null); setProgress("");
  };
  const add = async (texts) => {
    const r = await api(`/research/search/${s.id}/claims`, { method: "POST", body: { claims: texts } });
    if (r.ok) { setView(r.data); setNewClaim(""); setSuggested(null); } else setMsg({ kind: "error", text: errorText(r) });
  };
  const suggest = async () => {
    setSuggested([]);
    const r = await api(`/research/search/${s.id}/claims/suggest`, { method: "POST", timeoutMs: 60000 });
    if (r.ok) setSuggested(r.data.claims); else { setSuggested(null); setMsg({ kind: "error", text: errorText(r) }); }
  };
  return (
    <>
      <Notice kind="info">Menya reads each paper's abstract (and open full text where it can) and classifies it against one claim at a time. A judgement of "supports", "contradicts" or "mixed" counts only if a quoted sentence is found word for word in the paper. Design strength is shown separately from the AI's confidence. {view.strength_note}</Notice>
      {view.claims.length === 0 && <Notice kind="info">Keyword searches have no claim to test yet. Write the statement you want the papers checked against below, for example "Drone-based larviciding reduces malaria transmission", or let Menya suggest some.</Notice>}
      {view.claims.length > 1 && <ClaimTable view={view} />}
      {view.claims.map(c => {
        const rows = view.assessments.filter(a => a.claim_id === c.id);
        const shown = picked[c.id] ? rows.filter(a => a.category === picked[c.id]) : rows.filter(a => CATS.includes(a.category));
        return (
          <Card key={c.id}>
            <div className="mn-rs-claimhead"><h2 className="mn-panel-title">{c.text}</h2>
              {(c.position > 0 || s.is_boolean) && <button className="mn-link danger" onClick={async () => { await api(`/research/claims/${c.id}`, { method: "DELETE" }); const r = await api(`/research/search/${s.id}`); if (r.ok) setView(r.data); }}>Remove</button>}</div>
            <Meter meter={view.meters[c.id]} picked={picked[c.id]} onPick={cat => setPicked({ ...picked, [c.id]: cat })} />
            <div className="mn-row wrap" style={{ margin: "10px 0" }}>
              {running === c.id ? <><span className="mn-fine">{progress || "Assessing…"}</span><Button variant="ghost" onClick={() => (stop.current = true)}>Stop</Button></>
                : <Button onClick={() => run(c.id)} disabled={Boolean(running)}>{rows.length ? "Assess more papers" : "Assess papers"}</Button>}
            </div>
            <ul className="mn-rs-list">{shown.map(a => (
              <li key={a.id}><span className={`mn-rs-cat ${a.category}`}>{CAT_LABEL[a.category]}</span>{" "}
                <button className="mn-link" onClick={() => openDetail(a.paper_key)}>{titles.get(a.paper_key)?.title}</button>
                <div className="mn-fine left">{STRENGTH[a.strength]} · confidence {a.confidence}{a.sample_size ? ` · n = ${a.sample_size}` : ""} · {a.evidence_level === "abstract" ? "abstract only" : a.evidence_level === "full_text_excerpt" ? "abstract and full-text excerpt" : "no text"}</div>
                {a.passages[0] && <blockquote className="mn-rs-quote">"{a.passages[0].text}" <span className="mn-fine">({a.passages[0].location}, direct quotation)</span></blockquote>}</li>))}</ul>
          </Card>
        );
      })}
      <Card title="Add a claim">
        <p className="mn-panel-text">Break the question into specific claims; each gets its own assessment, and one paper can support one claim and contradict another.</p>
        <div className="mn-row wrap">
          <input style={{ ...inputStyle, flex: "1 1 260px" }} value={newClaim} onChange={e => setNewClaim(e.target.value)} placeholder="For example: AI tutoring improves long-term retention" maxLength={500} aria-label="New claim" />
          <Button variant="ghost" disabled={newClaim.trim().length < 3} onClick={() => add([newClaim.trim()])}>Add</Button>
          <Button variant="ghost" onClick={suggest}><Sparkles size={14} aria-hidden="true" /> Suggest claims</Button>
        </div>
        {suggested && (suggested.length === 0 ? <Loading /> : <ul className="mn-rs-list">{suggested.map(x => <li key={x}>{x} <button className="mn-link" onClick={() => add([x])}>Add</button></li>)}</ul>)}
      </Card>
    </>
  );
}

function ClaimTable({ view }) {
  return (
    <Card title="Claims compared">
      <div className="mn-table-wrap"><table className="mn-table">
        <thead><tr><th>Claim</th>{CATS.map(c => <th key={c} style={{ textAlign: "right" }}>{CAT_LABEL[c]}</th>)}<th style={{ textAlign: "right" }}>Relevant</th></tr></thead>
        <tbody>{view.claims.map(c => { const m = view.meters[c.id]; return (
          <tr key={c.id}><td>{c.text}</td>{CATS.map(k => <td key={k} style={{ textAlign: "right" }}>{m.counts[k]}{m.relevant ? ` (${m.percent[k]}%)` : ""}</td>)}<td style={{ textAlign: "right" }}>{m.relevant}</td></tr>); })}</tbody>
      </table></div>
    </Card>
  );
}

// ---------- Synthesis ----------
function SynthesisTab({ view, setView, setMsg, openDetail }) {
  const [busy, setBusy] = useState(false);
  const syn = view.synthesis?.content;
  const byLabel = syn?.refs ?? {};
  const titles = new Map(view.papers.map(p => [p.key, p]));
  const make = async () => {
    setBusy(true); setMsg(null);
    for (let i = 0; i < 4; i++) {
      const r = await api(`/research/search/${view.search.id}/synthesis`, { method: "POST", timeoutMs: 95000 });
      if (r.status === 503 && r.data?.retry_after_seconds) { setMsg({ kind: "info", text: `The AI is busy; trying again in ${r.data.retry_after_seconds} s.` }); await new Promise(res => setTimeout(res, r.data.retry_after_seconds * 1000)); continue; }
      if (r.ok) { setView(r.data); setMsg(null); } else setMsg({ kind: r.status === 400 || r.status === 429 ? "info" : "error", text: errorText(r) });
      break;
    }
    setBusy(false);
  };
  const Refs = ({ refs }) => (refs?.length ? <span className="mn-rs-refs">{refs.map(r => <button key={r} className="mn-link" onClick={() => openDetail(byLabel[r])}>[{r.slice(1)}]</button>)}</span> : null);
  const Sec = ({ title, items }) => (items?.length ? <Card title={title}><ul className="mn-rs-list">{items.map((i, k) => (
    <li key={k}>{i.text} <Refs refs={i.refs} />{i.possible_reasons?.length > 0 && <div className="mn-fine left">Possible reasons: {i.possible_reasons.join("; ")}</div>}</li>))}</ul></Card> : null);
  return (
    <>
      <div className="mn-row wrap">
        <Button onClick={make} disabled={busy}>{busy ? "Writing from the assessments…" : syn ? "Write again" : "Write a synthesis"}</Button>
        {syn && <span className="mn-fine">Written {new Date(syn.generated_at).toLocaleString()} by AI from the assessed papers only.</span>}
      </div>
      {!syn ? <p className="mn-panel-text">Assess papers on the Evidence tab first. The synthesis uses only those assessments, and every statement points to its papers.</p> : (
        <>
          <Notice kind="info">Coverage: {syn.coverage} The synthesis is AI-written; open the papers before relying on it.{syn.checks?.refs_removed || syn.checks?.items_removed ? ` ${syn.checks.refs_removed} unsupported references and ${syn.checks.items_removed} unsupported statements were removed.` : ""}</Notice>
          <Sec title="Summary" items={syn.executive_summary} />
          <Sec title="Where studies agree" items={syn.agreements} />
          <Sec title="Where studies disagree" items={syn.disagreements} />
          <Sec title="Limitations of the evidence" items={syn.limitations} />
          {syn.gaps?.length > 0 && <Card title="Possible research gaps"><ul className="mn-rs-list">{syn.gaps.map((g, k) => <li key={k}><b>{g.gap}</b> <span className="mn-source-tag">{g.type}</span><div className="mn-fine left">Basis: {g.basis} <Refs refs={g.refs} /></div></li>)}</ul></Card>}
          {syn.directions?.length > 0 && <Card title="Future research directions"><ul className="mn-rs-list">{syn.directions.map((d, k) => (
            <li key={k}><b>{d.question}</b> <Refs refs={d.refs} /><div className="mn-fine left">Why it matters: {d.why}<br />Established: {d.established}<br />Still uncertain: {d.uncertain}<br />How to study it: {d.method}</div></li>))}</ul></Card>}
          <Card title="References"><ol className="mn-sources">{Object.entries(byLabel).map(([label, key]) => { const p = titles.get(key); return p ? <li key={label}><a href={p.data.url} target="_blank" rel="noopener noreferrer">{p.refs.apa}</a></li> : null; })}</ol></Card>
        </>
      )}
    </>
  );
}

// ---------- Search details ----------
function Strategy({ view, ws, setView, refresh }) {
  const st = view.search.strategy ?? {};
  const setProject = async (projectId) => { await api(`/research/search/${view.search.id}/project`, { method: "POST", body: { projectId: projectId || null } }); refresh(); };
  return (
    <>
      <Card title="How this search was done">
        <dl className="mn-facts">
          <div><dt>Your question</dt><dd>{st.question}</dd></div>
          <div><dt>Query sent</dt><dd><code>{st.query}</code>{st.boolean ? " (boolean)" : ""}</dd></div>
          <div><dt>Years</dt><dd>{st.filters?.fromYear ?? "any"} to {st.filters?.toYear ?? "any"}</dd></div>
          <div><dt>Databases</dt><dd>{(st.databases ?? []).join(", ")}</dd></div>
          {st.skipped?.length > 0 && <div><dt>Not used for this subject</dt><dd>{st.skipped.join(", ")}</dd></div>}
          <div><dt>Abstracts</dt><dd>{view.counts.abstracts} of {view.counts.total} papers; {view.counts.full_text_read} assessments read open full-text excerpts</dd></div>
        </dl>
      </Card>
      {(st.pages ?? []).map(pg => (
        <Card key={pg.page} title={`Page ${pg.page} · ${new Date(pg.date).toLocaleString()}`}>
          <p className="mn-panel-text">{pg.retrieved} results retrieved, {pg.unique} unique after merging duplicates, {pg.kept} kept. Excluded: {pg.excluded.outside_years} outside the years, {pg.excluded.query_operators} not matching AND/OR/NOT, {pg.excluded.low_relevance} barely matching the search words, {pg.excluded.over_limit} over your plan's limit.</p>
          <div className="mn-table-wrap"><table className="mn-table"><thead><tr><th>Database</th><th>Status</th><th style={{ textAlign: "right" }}>Results</th><th style={{ textAlign: "right" }}>Time</th></tr></thead>
            <tbody>{pg.sources.map(x => <tr key={x.id}><td>{x.name}</td><td>{x.status}</td><td style={{ textAlign: "right" }}>{x.results}</td><td style={{ textAlign: "right" }}>{x.ms} ms</td></tr>)}</tbody></table></div>
        </Card>))}
      {(st.notices ?? []).length > 0 && <Card title="Limitations of this search"><ul className="mn-rs-list">{st.notices.map(n => <li key={n}>{n}</li>)}</ul></Card>}
      {ws?.projects?.length > 0 && <Card title="Project"><select style={inputStyle} value={view.search.project_id ?? ""} onChange={e => setProject(e.target.value)} aria-label="Project">
        <option value="">None</option>{ws.projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select></Card>}
    </>
  );
}

// ---------- One paper ----------
function Detail({ view, paperKey, onClose, saved, toggleSave }) {
  const p = view.papers.find(x => x.key === paperKey);
  const [copied, setCopied] = useState(null);
  if (!p) return null;
  const d = p.data;
  const rows = view.assessments.filter(a => a.paper_key === paperKey);
  const claims = new Map(view.claims.map(c => [c.id, c.text]));
  const copy = async (k) => { try { await navigator.clipboard.writeText(p.refs[k]); setCopied(k); setTimeout(() => setCopied(null), 1500); } catch { /* blocked */ } };
  return (
    <div className="mn-rs-overlay" onClick={onClose}>
      <aside className="mn-drawer mn-rs-detail" onClick={e => e.stopPropagation()} role="dialog" aria-label="Paper details">
        <div className="mn-drawer-head"><b>Paper</b><button className="mn-btn icon" onClick={onClose} aria-label="Close"><X size={18} /></button></div>
        <div className="mn-drawer-body">
          <h2 className="mn-rs-dtitle"><a href={d.url} target="_blank" rel="noopener noreferrer">{d.title}</a></h2>
          <dl className="mn-facts">
            <div><dt>Authors</dt><dd>{d.authors.join("; ") || "Not given"}</dd></div>
            <div><dt>Year</dt><dd>{d.year ?? "Not given"}</dd></div>
            <div><dt>Journal or venue</dt><dd>{d.venue ?? "Not given"}</dd></div>
            <div><dt>DOI</dt><dd>{d.doi ? <a href={`https://doi.org/${d.doi}`} target="_blank" rel="noopener noreferrer">{d.doi}</a> : "None recorded"}</dd></div>
            <div><dt>Type</dt><dd>{KIND[d.kind] ?? d.kind}</dd></div>
            <div><dt>Found in</dt><dd>{p.found_in.join(", ")}</dd></div>
            {d.citedBy != null && <div><dt>Citations</dt><dd>{d.citedBy} per {d.connector}, retrieved {new Date(p.retrieved_at).toLocaleDateString()}</dd></div>}
            {d.openAccessUrl && <div><dt>Free full text</dt><dd><a href={d.openAccessUrl} target="_blank" rel="noopener noreferrer">Open</a></dd></div>}
          </dl>
          <button className="mn-btn outline" onClick={() => toggleSave(p.key)} style={{ margin: "10px 0" }}>{saved.has(p.key) ? "Saved" : "Save to my research"}</button>
          {rows.filter(a => a.category !== "no_text").map(a => (
            <section key={a.id} className="mn-rs-assess">
              <h3>Against: {claims.get(a.claim_id)}</h3>
              <p><span className={`mn-rs-cat ${a.category}`}>{CAT_LABEL[a.category]}</span> <span className="mn-fine">AI confidence {a.confidence} · {STRENGTH[a.strength]} · {a.evidence_level === "abstract" ? "abstract only" : "abstract and full-text excerpt"}</span></p>
              <p><b>Why (AI):</b> {a.rationale}</p>
              <dl className="mn-facts">
                <div><dt>Design</dt><dd>{a.design.replace(/_/g, " ")}</dd></div>
                <div><dt>Sample size</dt><dd>{a.sample_size ?? "Not stated"}</dd></div>
                <div><dt>Population</dt><dd>{a.population ?? "Not stated"}</dd></div>
                <div><dt>Setting</dt><dd>{a.geographic_context ?? "Not stated"}</dd></div>
              </dl>
              {a.findings && <p><b>Findings (AI paraphrase):</b> {a.findings}</p>}
              {a.passages.map((q, i) => <blockquote key={i} className="mn-rs-quote">"{q.text}" <span className="mn-fine">({q.location}, direct quotation)</span></blockquote>)}
              {a.limitations_reported.length > 0 && <p><b>Limitations the authors report:</b> {a.limitations_reported.join("; ")}</p>}
              {a.ai_concerns.length > 0 && <p className="mn-fine left"><b>Concerns raised by the AI (not the authors):</b> {a.ai_concerns.join("; ")}</p>}
            </section>))}
          {d.abstract && <details><summary>Abstract</summary><p className="mn-rs-abs">{d.abstract}</p></details>}
          <h3>Cite</h3>
          {Object.keys(STYLE_NAMES).map(k => (
            <div key={k} className="mn-rs-cite"><span className="mn-fine">{STYLE_NAMES[k]}</span><p>{p.refs[k]}</p>
              <button className="mn-btn outline" onClick={() => copy(k)}>{copied === k ? <Check size={14} /> : <Copy size={14} />}{copied === k ? "Copied" : "Copy"}</button></div>))}
        </div>
      </aside>
    </div>
  );
}

function Compare({ view, keys, onClose }) {
  const papers = keys.map(k => view.papers.find(p => p.key === k)).filter(Boolean);
  const first = (k) => view.assessments.find(a => a.paper_key === k && a.category !== "no_text");
  const rows = [["Year", p => p.data.year ?? "—"], ["Type", p => KIND[p.data.kind] ?? p.data.kind], ["Design", p => first(p.key)?.design?.replace(/_/g, " ") ?? "Not assessed"],
    ["Sample", p => first(p.key)?.sample_size ?? "—"], ["Population", p => first(p.key)?.population ?? "—"], ["Setting", p => first(p.key)?.geographic_context ?? "—"],
    ...view.claims.map(c => [c.text, p => CAT_LABEL[view.assessments.find(a => a.paper_key === p.key && a.claim_id === c.id)?.category] ?? "Not assessed"])];
  return (
    <Card title="Comparing papers">
      <div className="mn-table-wrap"><table className="mn-table"><thead><tr><th />{papers.map(p => <th key={p.key}>{p.data.title.slice(0, 70)}</th>)}</tr></thead>
        <tbody>{rows.map(([label, fn]) => <tr key={label}><td>{label}</td>{papers.map(p => <td key={p.key}>{fn(p)}</td>)}</tr>)}</tbody></table></div>
      <Button variant="ghost" onClick={onClose}>Close comparison</Button>
    </Card>
  );
}
