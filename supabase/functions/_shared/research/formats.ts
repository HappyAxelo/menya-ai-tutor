// Reference styles and export files, built only from the retrieved record. A missing field is left out, never guessed.
import type { Paper } from "./connectors.ts";
import { apaReference } from "./citations.ts";

export const STYLES = ["apa", "ieee", "harvard", "vancouver"] as const;
export type Style = typeof STYLES[number];

const split = (a: string): { family: string; given: string } => {
  if (a.includes(",")) { const [f, g] = a.split(",", 2).map(s => s.trim()); return { family: f, given: g }; }
  const parts = a.trim().split(/\s+/);
  return { family: parts.at(-1) ?? a, given: parts.slice(0, -1).join(" ") };
};
const initials = (g: string, dot: boolean) => g.split(/[\s-]+/).filter(Boolean).map(p => p[0].toUpperCase() + (dot ? "." : "")).join(dot ? " " : "");
const link = (p: Paper) => (p.doi ? `https://doi.org/${p.doi}` : p.url);
const title = (p: Paper) => p.title.replace(/\.+$/, "");

export function ieee(p: Paper): string {
  const names = p.authors.map(a => { const n = split(a); return n.given ? `${initials(n.given, true)} ${n.family}` : n.family; });
  const who = names.length > 6 ? `${names[0]} et al.` : names.length > 1 ? `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}` : names[0] ?? "";
  return [who && `${who},`, `"${title(p)},"`, p.venue && `${p.venue},`, p.year ? `${p.year}.` : "n.d.", p.doi ? `doi: ${p.doi}.` : `[Online]. Available: ${p.url}`].filter(Boolean).join(" ");
}
export function harvard(p: Paper): string {
  const names = p.authors.map(a => { const n = split(a); return n.given ? `${n.family}, ${initials(n.given, true).replace(/ /g, "")}` : n.family; });
  const who = names.length > 3 ? `${names[0]} et al.` : names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0] ?? "";
  return `${who ? `${who} ` : ""}(${p.year ?? "n.d."}) '${title(p)}'${p.venue ? `, ${p.venue}` : ""}. Available at: ${link(p)}.`;
}
export function vancouver(p: Paper): string {
  const names = p.authors.map(a => { const n = split(a); return n.given ? `${n.family} ${initials(n.given, false)}` : n.family; });
  const who = names.length > 6 ? `${names.slice(0, 6).join(", ")}, et al.` : names.join(", ");
  return [who && `${who}.`, `${title(p)}.`, p.venue && `${p.venue}.`, p.year ? `${p.year}.` : null, p.doi ? `doi:${p.doi}` : `Available from: ${p.url}`].filter(Boolean).join(" ");
}
export function formatReference(p: Paper, style: Style): string {
  return style === "ieee" ? ieee(p) : style === "harvard" ? harvard(p) : style === "vancouver" ? vancouver(p) : apaReference(p);
}

const risType = (p: Paper) => ({ journal_article: "JOUR", review: "JOUR", conference: "CPAPER", preprint: "UNPB", book: "BOOK", report: "RPRT", other: "GEN" } as Record<string, string>)[p.kind] ?? "GEN";
export function toRis(papers: Paper[]): string {
  return papers.map(p => [
    `TY  - ${risType(p)}`, ...p.authors.map(a => `AU  - ${a}`), `TI  - ${p.title}`, p.year && `PY  - ${p.year}`, p.venue && `JO  - ${p.venue}`,
    p.doi && `DO  - ${p.doi}`, `UR  - ${link(p)}`, p.abstract && `AB  - ${p.abstract.replace(/\s+/g, " ")}`, "ER  - ",
  ].filter(Boolean).join("\r\n")).join("\r\n\r\n") + "\r\n";
}

const bibEscape = (s: string) => s.replace(/[{}\\]/g, "").replace(/[&%$#_]/g, m => `\\${m}`);
export function toBibtex(papers: Paper[]): string {
  const used = new Set<string>();
  return papers.map(p => {
    const fam = (split(p.authors[0] ?? "anon").family || "anon").toLowerCase().replace(/[^a-z]/g, "") || "anon";
    let key = `${fam}${p.year ?? "nd"}`; let n = 1;
    while (used.has(key)) key = `${fam}${p.year ?? "nd"}${String.fromCharCode(96 + ++n)}`;
    used.add(key);
    const type = p.kind === "conference" ? "inproceedings" : p.kind === "book" ? "book" : p.kind === "report" ? "techreport" : p.kind === "journal_article" || p.kind === "review" ? "article" : "misc";
    const fields = [["title", p.title], ["author", p.authors.map(bibEscape).join(" and ")], ["year", p.year ? String(p.year) : ""],
      [type === "inproceedings" ? "booktitle" : "journal", p.venue ?? ""], ["doi", p.doi ?? ""], ["url", link(p)],
      ...(p.kind === "preprint" ? [["note", "Preprint, not peer reviewed"]] : [])].filter(([, v]) => v);
    return `@${type}{${key},\n${fields.map(([k, v]) => `  ${k} = {${k === "author" ? v : bibEscape(v)}}`).join(",\n")}\n}`;
  }).join("\n\n") + "\n";
}

const csvCell = (v: unknown) => { const s = v == null ? "" : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function toCsv(rows: { paper: Paper; extra?: Record<string, string> }[]): string {
  const extraKeys = [...new Set(rows.flatMap(r => Object.keys(r.extra ?? {})))];
  const head = ["title", "authors", "year", "venue", "type", "doi", "url", "open_access_url", "citations", "found_in", ...extraKeys];
  return [head.join(","), ...rows.map(({ paper: p, extra }) => [p.title, p.authors.join("; "), p.year, p.venue, p.kind, p.doi, link(p), p.openAccessUrl,
    p.citedBy, (p.foundIn ?? [p.connector]).join("; "), ...extraKeys.map(k => extra?.[k] ?? "")].map(csvCell).join(","))].join("\r\n") + "\r\n";
}
