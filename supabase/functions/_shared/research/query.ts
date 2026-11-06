// What a researcher typed, as a search every service can run. Plain questions become search words; text with
// AND, OR, NOT (in capitals) or "exact phrases" is read as a boolean query. Services that understand boolean
// syntax get it in their own form; the rest get the positive terms, and the results are checked locally.
import { keywordsFrom } from "./select.ts";

export interface ParsedQuery {
  boolean: boolean;      // the person used operators or quotes
  groups: string[][];    // all groups must match; within a group, any term (OR)
  not: string[];         // none may appear
  keywords: string;      // positive terms as plain words, for services without boolean search
}

const clean = (t: string) => t.replace(/[^\p{L}\p{N}\s'-]/gu, " ").replace(/\s+/g, " ").trim();

export function parseQuery(input: string): ParsedQuery {
  const text = input.trim();
  const isBoolean = /"[^"]+"|\b(AND|OR|NOT)\b/.test(text);
  if (!isBoolean) {
    const keywords = keywordsFrom(text, 12);
    return { boolean: false, groups: [], not: [], keywords };
  }
  const groups: string[][] = [], not: string[] = [];
  let negate = false, either = false;
  for (const m of text.matchAll(/"([^"]+)"|\S+/g)) {
    const raw = m[1] ?? m[0];
    if (!m[1] && /^\(+$|^\)+$/.test(raw)) continue;
    if (!m[1] && raw === "AND") { either = false; continue; }
    if (!m[1] && raw === "OR") { either = true; continue; }
    if (!m[1] && raw === "NOT") { negate = true; continue; }
    const term = clean(m[1] ?? raw.replace(/^\(+|\)+$/g, "")).toLowerCase();
    if (!term) continue;
    if (negate) not.push(term);
    else if (either && groups.length) groups.at(-1)!.push(term);
    else groups.push([term]);
    negate = false; either = false;
  }
  const keywords = [...new Set(groups.flat())].join(" ").slice(0, 300);
  return { boolean: true, groups, not, keywords };
}

const quote = (t: string) => (t.includes(" ") ? `"${t}"` : t);

// AND / OR / NOT with quoted phrases: OpenAlex, Europe PMC, PubMed, DOAJ and CORE read this form.
export function booleanString(q: ParsedQuery): string {
  const parts = q.groups.map(g => (g.length > 1 ? `(${g.map(quote).join(" OR ")})` : quote(g[0])));
  return [parts.join(" AND "), ...q.not.map(t => `NOT ${quote(t)}`)].filter(Boolean).join(" ");
}

// arXiv's own operators: all:term, AND, OR, ANDNOT.
export function arxivString(q: ParsedQuery): string {
  const one = (t: string) => `all:${t.includes(" ") ? `"${t}"` : t}`;
  const parts = q.groups.map(g => (g.length > 1 ? `(${g.map(one).join(" OR ")})` : one(g[0])));
  return [parts.join(" AND "), ...q.not.map(t => `ANDNOT ${one(t)}`)].filter(Boolean).join(" ");
}

// The local check after retrieval: services differ in how strictly they apply operators. A term only has to
// appear in the title or abstract; a paper with no abstract is judged on its title for NOT only.
export function matchesQuery(q: ParsedQuery, title: string, abstract: string | null): boolean {
  if (!q.boolean) return true;
  const text = `${title} ${abstract ?? ""}`.toLowerCase();
  if (q.not.some(t => text.includes(t))) return false;
  if (!abstract) return true;
  return q.groups.every(g => g.some(t => text.includes(t)));
}
