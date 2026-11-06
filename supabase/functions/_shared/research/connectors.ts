// One adapter per academic service. Each turns the service's own response into a Paper and
// nothing else; timeouts, retries, caching and rate limits are in pipeline.ts. Every field comes
// from the service's response: an adapter never fills in a value it didn't receive.
import { arxivString, booleanString, type ParsedQuery } from "./query.ts";

export type PaperKind = "journal_article" | "review" | "preprint" | "conference" | "book" | "report" | "other";

export interface Paper {
  connector: string;
  title: string;
  authors: string[];        // "Family, Given" or a full name, as the service gave it
  year: number | null;
  venue: string | null;
  doi: string | null;       // lower case, without https://doi.org/
  url: string;              // a page for this record at a verified address
  abstract: string | null;
  kind: PaperKind;
  openAccessUrl: string | null;
  license: string | null;
  citedBy: number | null;
  pmcid?: string | null;    // Europe PMC: lets the pipeline fetch open-access full text
  doajListed?: boolean;
  excerpt?: string | null;  // passages of open-access full text, when read
  ids?: Record<string, string>;  // the service's own identifiers (OpenAlex W…, Semantic Scholar id, PMID, arXiv id)
  foundIn?: string[];       // every service that returned it, after merging duplicates
}

export interface ConnectorKeys {
  contactEmail?: string;    // RESEARCH_CONTACT_EMAIL: required by Unpaywall, polite use elsewhere
  openalex?: string;        // OPENALEX_API_KEY
  semanticScholar?: string; // SEMANTIC_SCHOLAR_API_KEY
  ncbi?: string;            // NCBI_API_KEY
  core?: string;            // CORE_API_KEY
}

export type Http = (url: string, init?: { headers?: Record<string, string> }) => Promise<{ status: number; text: string }>;

export interface SearchOptions {
  limit: number; recent: boolean; keys: ConnectorKeys; http: Http;
  page?: number;                         // 1 = first page
  fromYear?: number | null; toYear?: number | null;
  bool?: ParsedQuery | null;             // a boolean query, when the person wrote one
}

export class ConnectorError extends Error {
  kind: "rate_limited" | "http" | "parse" | "not_configured";
  status?: number;
  constructor(kind: ConnectorError["kind"], status?: number) { super(`${kind}${status ? ` ${status}` : ""}`); this.kind = kind; this.status = status; }
}

export interface Connector {
  id: string;
  name: string;
  needs?: keyof ConnectorKeys;    // can't run without this secret
  search(query: string, o: SearchOptions): Promise<Paper[]>;
}

const decodeEntities = (s: string) => s
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&amp;/g, "&");
// Markup stripped and whitespace closed up (JATS abstracts, XML titles).
export const plainText = (s: unknown): string =>
  typeof s === "string" ? decodeEntities(s.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim() : "";

export function cleanDoi(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const m = /10\.\d{4,9}\/[^\s"<>]+/.exec(raw.trim());
  return m ? m[0].replace(/[.,;)]+$/, "").toLowerCase() : null;
}
const doiUrl = (doi: string) => `https://doi.org/${doi}`;
const httpsUrl = (u: unknown): string | null => (typeof u === "string" && /^https?:\/\/[^\s]+$/i.test(u) ? u.replace(/^http:/i, "https:") : null);
const yearOf = (v: unknown): number | null => {
  const n = Number(String(v ?? "").slice(0, 4));
  return Number.isInteger(n) && n >= 1400 && n <= new Date().getFullYear() + 1 ? n : null;
};
const words = (q: string) => q.replace(/[^\p{L}\p{N}\s-]/gu, " ").replace(/\s+/g, " ").trim();

async function getJson(o: SearchOptions, url: string, headers?: Record<string, string>): Promise<any> {
  const res = await o.http(url, { headers });
  if (res.status === 429 || res.status === 403) throw new ConnectorError("rate_limited", res.status);
  if (res.status < 200 || res.status >= 300) throw new ConnectorError("http", res.status);
  try { return JSON.parse(res.text); } catch { throw new ConnectorError("parse"); }
}
async function getText(o: SearchOptions, url: string): Promise<string> {
  const res = await o.http(url);
  if (res.status === 429) throw new ConnectorError("rate_limited", res.status);
  if (res.status < 200 || res.status >= 300) throw new ConnectorError("http", res.status);
  return res.text;
}
const recentFrom = () => new Date().getFullYear() - 5;
const years = (o: SearchOptions) => ({ from: o.fromYear ?? (o.recent ? recentFrom() : null), to: o.toYear ?? null });
const page = (o: SearchOptions) => Math.max(1, o.page ?? 1);
const skip = (o: SearchOptions) => (page(o) - 1) * o.limit;
// The service's own boolean syntax when it has one, else plain words.
const booleanOr = (query: string, o: SearchOptions) => (o.bool?.boolean ? booleanString(o.bool) : words(query));

// ---------- OpenAlex: https://docs.openalex.org ----------
function openAlexAbstract(index: unknown): string | null {
  if (!index || typeof index !== "object") return null;
  const placed: string[] = [];
  for (const [word, positions] of Object.entries(index as Record<string, number[]>)) for (const p of positions) placed[p] = word;
  const text = placed.filter(Boolean).join(" ").trim();
  return text || null;
}
const openalex: Connector = {
  id: "openalex", name: "OpenAlex",
  async search(query, o) {
    const filters = [`title_and_abstract.search:${encodeURIComponent(booleanOr(query, o).replace(/,/g, " "))}`, "is_retracted:false"];
    const y = years(o);
    if (y.from) filters.push(`from_publication_date:${y.from}-01-01`);
    if (y.to) filters.push(`to_publication_date:${y.to}-12-31`);
    const params = [`filter=${filters.join(",")}`, `per-page=${o.limit}`, `page=${page(o)}`, "select=id,doi,title,publication_year,type,authorships,primary_location,best_oa_location,cited_by_count,abstract_inverted_index",
      ...(o.keys.openalex ? [`api_key=${encodeURIComponent(o.keys.openalex)}`] : []), ...(o.keys.contactEmail ? [`mailto=${encodeURIComponent(o.keys.contactEmail)}`] : [])];
    const data = await getJson(o, `https://api.openalex.org/works?${params.join("&")}`);
    return (data.results ?? []).filter((w: any) => w.title).map((w: any): Paper => {
      const doi = cleanDoi(w.doi);
      const source = w.primary_location?.source;
      const kind: PaperKind = w.type === "preprint" || w.primary_location?.version === "submittedVersion" ? "preprint"
        : w.type === "review" ? "review" : source?.type === "conference" ? "conference"
        : w.type === "book" || w.type === "book-chapter" ? "book" : w.type === "report" ? "report"
        : w.type === "article" && source?.type === "journal" ? "journal_article" : "other";
      return { connector: "openalex", title: plainText(w.title), authors: (w.authorships ?? []).map((a: any) => a.author?.display_name).filter(Boolean),
        year: yearOf(w.publication_year), venue: source?.display_name ?? null, doi, url: doi ? doiUrl(doi) : httpsUrl(w.primary_location?.landing_page_url) ?? String(w.id),
        abstract: openAlexAbstract(w.abstract_inverted_index), kind, openAccessUrl: httpsUrl(w.best_oa_location?.landing_page_url),
        license: w.best_oa_location?.license ?? null, citedBy: Number.isInteger(w.cited_by_count) ? w.cited_by_count : null, doajListed: source?.is_in_doaj === true,
        ids: { openalex: String(w.id ?? "").replace("https://openalex.org/", "") } };
    });
  },
};

// ---------- Semantic Scholar: https://api.semanticscholar.org/api-docs/graph ----------
const semanticScholar: Connector = {
  id: "semantic_scholar", name: "Semantic Scholar",
  async search(query, o) {
    const y = years(o);
    const span = y.from || y.to ? `&year=${y.from ?? ""}-${y.to ?? ""}` : "";
    const params = `query=${encodeURIComponent(o.bool?.boolean ? o.bool.keywords : words(query))}&limit=${o.limit}&offset=${skip(o)}&fields=title,year,authors,venue,externalIds,abstract,openAccessPdf,publicationTypes,citationCount,url${span}`;
    const data = await getJson(o, `https://api.semanticscholar.org/graph/v1/paper/search?${params}`, o.keys.semanticScholar ? { "x-api-key": o.keys.semanticScholar } : undefined);
    return (data.data ?? []).filter((p: any) => p.title).map((p: any): Paper => {
      const doi = cleanDoi(p.externalIds?.DOI);
      const types: string[] = p.publicationTypes ?? [];
      const onArxiv = Boolean(p.externalIds?.ArXiv) && !doi;
      const kind: PaperKind = onArxiv || /arxiv|preprint/i.test(p.venue ?? "") ? "preprint"
        : types.includes("Review") || types.includes("MetaAnalysis") ? "review" : types.includes("Conference") ? "conference"
        : types.includes("JournalArticle") ? "journal_article" : "other";
      return { connector: "semantic_scholar", title: plainText(p.title), authors: (p.authors ?? []).map((a: any) => a.name).filter(Boolean), year: yearOf(p.year),
        venue: p.venue || null, doi, url: doi ? doiUrl(doi) : httpsUrl(p.url) ?? `https://www.semanticscholar.org/paper/${p.paperId}`, abstract: plainText(p.abstract) || null,
        kind, openAccessUrl: httpsUrl(p.openAccessPdf?.url), license: p.openAccessPdf?.license ?? null, citedBy: Number.isInteger(p.citationCount) ? p.citationCount : null,
        ids: { semantic_scholar: String(p.paperId ?? "") } };
    });
  },
};

// ---------- Crossref: https://api.crossref.org/swagger-ui ----------
const crossref: Connector = {
  id: "crossref", name: "Crossref",
  async search(query, o) {
    const y = years(o);
    const parts = [y.from && `from-pub-date:${y.from}`, y.to && `until-pub-date:${y.to}`].filter(Boolean);
    const filter = parts.length ? `&filter=${parts.join(",")}` : "";
    const mail = o.keys.contactEmail ? `&mailto=${encodeURIComponent(o.keys.contactEmail)}` : "";
    const data = await getJson(o, `https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(o.bool?.boolean ? o.bool.keywords : words(query))}&rows=${o.limit}&offset=${skip(o)}&select=DOI,title,author,issued,container-title,type,URL,abstract,is-referenced-by-count,update-to${filter}${mail}`);
    return (data.message?.items ?? []).filter((w: any) => w.title?.[0] && !w["update-to"]?.some?.((u: any) => /retract/i.test(u.type ?? ""))).map((w: any): Paper => {
      const doi = cleanDoi(w.DOI);
      const kind: PaperKind = w.type === "posted-content" ? "preprint" : w.type === "journal-article" ? "journal_article"
        : w.type === "proceedings-article" ? "conference" : /^book/.test(w.type ?? "") ? "book" : w.type === "report" ? "report" : "other";
      return { connector: "crossref", title: plainText(w.title[0]), authors: (w.author ?? []).map((a: any) => a.family ? (a.given ? `${a.family}, ${a.given}` : a.family) : a.name).filter(Boolean),
        year: yearOf(w.issued?.["date-parts"]?.[0]?.[0]), venue: w["container-title"]?.[0] ?? null, doi, url: doi ? doiUrl(doi) : httpsUrl(w.URL) ?? "",
        abstract: plainText(w.abstract) || null, kind, openAccessUrl: null, license: null, citedBy: Number.isInteger(w["is-referenced-by-count"]) ? w["is-referenced-by-count"] : null };
    }).filter((p: Paper) => p.url);
  },
};

// ---------- Europe PMC: https://europepmc.org/RestfulWebService ----------
const europePmc: Connector = {
  id: "europe_pmc", name: "Europe PMC",
  async search(query, o) {
    // Europe PMC pages by cursor, not by number: only the first page is fetched here.
    if (page(o) > 1) return [];
    const y = years(o);
    const q = `${booleanOr(query, o)}${y.from || y.to ? ` AND PUB_YEAR:[${y.from ?? 1900} TO ${y.to ?? 3000}]` : ""}`;
    const data = await getJson(o, `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(q)}&format=json&pageSize=${o.limit}&resultType=core`);
    return (data.resultList?.result ?? []).filter((r: any) => r.title && !(r.pubTypeList?.pubType ?? []).some((t: string) => /retract/i.test(t))).map((r: any): Paper => {
      const doi = cleanDoi(r.doi);
      const types: string[] = (r.pubTypeList?.pubType ?? []).map((t: string) => t.toLowerCase());
      const kind: PaperKind = r.source === "PPR" || types.includes("preprint") ? "preprint" : types.some(t => /review|meta-analysis/.test(t)) ? "review"
        : types.includes("journal article") || r.journalInfo ? "journal_article" : "other";
      const open = r.isOpenAccess === "Y";
      return { connector: "europe_pmc", title: plainText(r.title), authors: (r.authorList?.author ?? []).map((a: any) => a.lastName ? (a.firstName ? `${a.lastName}, ${a.firstName}` : a.lastName) : a.fullName || a.collectiveName).filter(Boolean),
        year: yearOf(r.pubYear), venue: r.journalInfo?.journal?.title ?? r.bookOrReportDetails?.publisher ?? null, doi, url: doi ? doiUrl(doi) : `https://europepmc.org/article/${r.source}/${r.id}`,
        abstract: plainText(r.abstractText) || null, kind, openAccessUrl: open && r.pmcid ? `https://europepmc.org/article/PMC/${r.pmcid}` : null, license: r.license ?? null,
        citedBy: Number.isInteger(r.citedByCount) ? r.citedByCount : null, pmcid: open ? r.pmcid ?? null : null,
        ids: { europe_pmc: `${r.source}/${r.id}`, ...(r.pmid ? { pmid: String(r.pmid) } : {}) } };
    });
  },
};

// ---------- PubMed (NCBI E-utilities): https://www.ncbi.nlm.nih.gov/books/NBK25497 ----------
const xmlAll = (xml: string, tag: string) => [...xml.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "g"))].map(m => m[1]);
const xmlOne = (xml: string, tag: string) => xmlAll(xml, tag)[0] ?? null;
export function parsePubmed(xml: string): Paper[] {
  return xmlAll(xml, "PubmedArticle").map((a): Paper | null => {
    const title = plainText(xmlOne(a, "ArticleTitle"));
    const pmid = plainText(xmlOne(a, "PMID"));
    if (!title || !pmid) return null;
    const types = xmlAll(a, "PublicationType").map(t => plainText(t).toLowerCase());
    if (types.some(t => /retract/.test(t))) return null;
    const doi = cleanDoi(/<(?:ArticleId IdType="doi"|ELocationID EIdType="doi"[^>]*)>([^<]+)</.exec(a)?.[1]);
    const pubDate = xmlOne(a, "PubDate") ?? "";
    const authors = xmlAll(a, "Author").map(x => {
      const last = plainText(xmlOne(x, "LastName")), fore = plainText(xmlOne(x, "ForeName"));
      return last ? (fore ? `${last}, ${fore}` : last) : plainText(xmlOne(x, "CollectiveName"));
    }).filter(Boolean);
    const pmc = /<ArticleId IdType="pmc">([^<]+)</.exec(a)?.[1] ?? null;
    return { connector: "pubmed", title, authors, year: yearOf(plainText(xmlOne(pubDate, "Year")) || plainText(xmlOne(pubDate, "MedlineDate"))),
      venue: plainText(xmlOne(xmlOne(a, "Journal") ?? "", "Title")) || null, doi, url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
      abstract: xmlAll(a, "AbstractText").map(plainText).join(" ") || null,
      kind: types.some(t => /review|meta-analysis/.test(t)) ? "review" : types.includes("preprint") ? "preprint" : "journal_article",
      openAccessUrl: pmc ? `https://pmc.ncbi.nlm.nih.gov/articles/${pmc}/` : null, license: null, citedBy: null, ids: { pmid } };
  }).filter((p): p is Paper => Boolean(p));
}
const pubmed: Connector = {
  id: "pubmed", name: "PubMed",
  async search(query, o) {
    const who = `&tool=menya${o.keys.contactEmail ? `&email=${encodeURIComponent(o.keys.contactEmail)}` : ""}${o.keys.ncbi ? `&api_key=${encodeURIComponent(o.keys.ncbi)}` : ""}`;
    const y = years(o);
    const dates = y.from || y.to ? `&datetype=pdat&mindate=${y.from ?? 1900}&maxdate=${y.to ?? 3000}` : "";
    const found = await getJson(o, `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&sort=relevance&retmax=${o.limit}&retstart=${skip(o)}&term=${encodeURIComponent(booleanOr(query, o))}${dates}${who}`);
    const ids: string[] = found.esearchresult?.idlist ?? [];
    if (!ids.length) return [];
    return parsePubmed(await getText(o, `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&retmode=xml&id=${ids.join(",")}${who}`));
  },
};

// ---------- arXiv: https://info.arxiv.org/help/api ----------
export function parseArxiv(xml: string): Paper[] {
  return xmlAll(xml, "entry").map((e): Paper | null => {
    const title = plainText(xmlOne(e, "title"));
    const id = plainText(xmlOne(e, "id"));
    if (!title || !/arxiv\.org\/abs\//.test(id)) return null;
    const url = id.replace(/^http:/, "https:");
    return { connector: "arxiv", title, authors: xmlAll(e, "name").map(plainText).filter(Boolean), year: yearOf(plainText(xmlOne(e, "published"))),
      venue: "arXiv", doi: cleanDoi(xmlOne(e, "arxiv:doi")), url, abstract: plainText(xmlOne(e, "summary")) || null,
      kind: "preprint", openAccessUrl: url, license: null, citedBy: null, ids: { arxiv: url.replace(/^.*\/abs\//, "") } };
  }).filter((p): p is Paper => Boolean(p));
}
const arxiv: Connector = {
  id: "arxiv", name: "arXiv",
  async search(query, o) {
    const terms = o.bool?.boolean ? encodeURIComponent(arxivString(o.bool)) : words(query).split(" ").slice(0, 8).map(t => `all:${encodeURIComponent(t)}`).join("+AND+");
    // arXiv has no year filter: the caller filters years after retrieval.
    return parseArxiv(await getText(o, `https://export.arxiv.org/api/query?search_query=${terms}&start=${skip(o)}&max_results=${o.limit}${o.recent ? "&sortBy=submittedDate&sortOrder=descending" : ""}`));
  },
};

// ---------- DOAJ: https://doaj.org/api/docs ----------
const doaj: Connector = {
  id: "doaj", name: "DOAJ",
  async search(query, o) {
    const data = await getJson(o, `https://doaj.org/api/search/articles/${encodeURIComponent(booleanOr(query, o))}?pageSize=${o.limit}&page=${page(o)}`);
    return (data.results ?? []).filter((r: any) => r.bibjson?.title).map((r: any): Paper | null => {
      const b = r.bibjson;
      const doi = cleanDoi((b.identifier ?? []).find((i: any) => /doi/i.test(i.type ?? ""))?.id);
      const link = httpsUrl((b.link ?? []).find((l: any) => /fulltext/i.test(l.type ?? ""))?.url);
      const url = doi ? doiUrl(doi) : link;
      if (!url) return null;
      return { connector: "doaj", title: plainText(b.title), authors: (b.author ?? []).map((a: any) => a.name).filter(Boolean), year: yearOf(b.year), venue: b.journal?.title ?? null,
        doi, url, abstract: plainText(b.abstract) || null, kind: "journal_article", openAccessUrl: link, license: null, citedBy: null, doajListed: true };
    }).filter(Boolean);
  },
};

// ---------- CORE: https://api.core.ac.uk/docs/v3. Needs a free key; not yet run against the live service. ----------
const core: Connector = {
  id: "core", name: "CORE", needs: "core",
  async search(query, o) {
    const data = await getJson(o, `https://api.core.ac.uk/v3/search/works?q=${encodeURIComponent(booleanOr(query, o))}&limit=${o.limit}&offset=${skip(o)}`, { Authorization: `Bearer ${o.keys.core}` });
    return (data.results ?? []).filter((w: any) => w.title).map((w: any): Paper | null => {
      const doi = cleanDoi(w.doi);
      const link = httpsUrl(w.downloadUrl) ?? httpsUrl(w.links?.find?.((l: any) => l.type === "display")?.url);
      const url = doi ? doiUrl(doi) : link;
      if (!url) return null;
      return { connector: "core", title: plainText(w.title), authors: (w.authors ?? []).map((a: any) => a.name).filter(Boolean), year: yearOf(w.yearPublished), venue: w.publisher ?? null,
        doi, url, abstract: plainText(w.abstract) || null, kind: "other", openAccessUrl: link, license: null, citedBy: Number.isInteger(w.citationCount) ? w.citationCount : null };
    }).filter(Boolean);
  },
};

export const CONNECTORS: Record<string, Connector> = {
  openalex, semantic_scholar: semanticScholar, crossref, europe_pmc: europePmc, pubmed, arxiv, doaj, core,
};

// Services asked about that have no adapter, and why. Shown to administrators.
export const NOT_INTEGRATED = [
  { id: "consensus", name: "Consensus", reason: "Its API answered 401 without authorised access. It needs a partner key from Consensus; no adapter was written because the access terms and response format can't be verified without one." },
  { id: "google_scholar", name: "Google Scholar", reason: "No public API, and its terms forbid automated access. Not used." },
  { id: "ajol", name: "African Journals Online", reason: "Its OAI-PMH feed answers, but harvesting is not search. AJOL papers can still be found through Crossref and OpenAlex when their DOIs are registered." },
];

// ---------- Enrichment: a legal open-access copy for a DOI. Needs a contact email by Unpaywall's rules. ----------
export async function unpaywallLookup(doi: string, o: Pick<SearchOptions, "keys" | "http">): Promise<{ url: string | null; license: string | null }> {
  if (!o.keys.contactEmail) throw new ConnectorError("not_configured");
  const data = await getJson(o as SearchOptions, `https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=${encodeURIComponent(o.keys.contactEmail)}`);
  return { url: httpsUrl(data.best_oa_location?.url_for_landing_page) ?? httpsUrl(data.best_oa_location?.url), license: data.best_oa_location?.license ?? null };
}

// ---------- Open-access full text from Europe PMC: paragraphs only, for choosing short excerpts. ----------
export async function europePmcParagraphs(pmcid: string, o: Pick<SearchOptions, "http">): Promise<string[]> {
  const xml = await getText(o as SearchOptions, `https://www.ebi.ac.uk/europepmc/webservices/rest/${encodeURIComponent(pmcid)}/fullTextXML`);
  return xmlAll(xml.replace(/<(ref-list|front|back)[\s\S]*?<\/\1>/g, " "), "p").map(plainText).filter(p => p.length > 80);
}
