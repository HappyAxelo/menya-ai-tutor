# Menya Research: search, Evidence Meter and synthesis

A Research page (header button "Research") for finding papers on a question, judging what each one says about a claim, and
writing a referenced summary. It is separate from the tutor; the tutor's research connectors (`docs/RESEARCH.md`) are unchanged.

Status words: **Done** means built and run against the real services and model. **Partial** means it works with stated gaps.
**Needs a key** means the code exists but the service won't answer without one. **Needs validation** means it runs, but its
quality hasn't been checked by a subject expert.

## 1. What a user can do

| Feature | Status | Notes |
|---|---|---|
| Search with plain words, `"exact phrases"`, `AND`, `OR`, `NOT`, brackets | **Done** | Operators must be in capitals. Each service is sent what it supports; results are then checked against the query, and `NOT` is always enforced |
| Filters: years, open access only, paper type, source; sort by relevance, year, citations | **Done** | Year range is passed to every service that supports it |
| "Find more" (next page from every service) | **Done** | Europe PMC returns only the first page |
| Duplicates merged by DOI, then by normalised title | **Done** | A merged paper lists every service it came from |
| "Search details": what was retrieved, merged, kept, and why papers were dropped | **Done** | Reasons: outside the years, failed the query, low relevance, over the plan's limit |
| Claims: the question becomes the first claim; add up to 6; "Suggest claims" | **Done** | A boolean query is not used as a claim: the page asks for one |
| Evidence Meter per claim: supports / contradicts / mixed / insufficient, counts and percentages | **Done** | Computed only from relevant papers. Clicking a segment filters the list |
| Per paper: category, confidence, evidence strength, quoted passage, study design, sample size, limitations | **Done** | See section 3 for the checks |
| Synthesis: agreements, disagreements, limitations, gaps, future directions, references | **Done** | Every statement cites papers that were assessed |
| References in APA, IEEE, Harvard, Vancouver; copy button | **Done** | Built from the retrieved record, never written by the model |
| Export RIS, BibTeX, CSV, Markdown report | **Done** | Scope: all, saved or assessed papers |
| Projects, saved papers with notes, recent searches | **Done** | Private to the user |
| Compare papers side by side | **Done** | Up to 3 |
| Full text | **Partial** | Only Europe PMC open-licence text, for plans with `full_text`. Otherwise the abstract only, and the page says so |
| Benchmark | **Done, small** | 20 papers, labels made by an AI. See section 5 |
| Page in Kinyarwanda, French, Kiswahili | **Not done** | The menu item is translated; the page itself is English |
| Consensus, Google Scholar | **Not integrated** | Same reasons as `docs/RESEARCH.md` section 4 |

## 2. Services

Same connectors as the tutor: OpenAlex, Crossref, Europe PMC, PubMed, arXiv and DOAJ answer without keys. Semantic Scholar and
CORE **need a key** (Semantic Scholar returned "too many requests" on most live tries without one). Up to 15 results per service per
page, 20 seconds in total; a service that fails or is slow is reported in Search details and the others carry on.

## 3. How a paper is judged

The model (Groq `gpt-oss-120b`, the free route) reads 3 papers at a time and must answer in a fixed JSON format. Then code checks it:

- **Quoted passage must be in the text.** After normalising spaces and quotes, the passage must appear word for word and be at least
  25 characters. A "supports", "contradicts" or "mixed" with no passage that passes is changed to **insufficient**.
- **Abstract only:** confidence is capped at "moderate".
- **Sample size** is kept only if that number appears in the text.
- **No abstract:** marked "no text to assess" without a model call, and not counted against the plan.
- **Perceptions are not outcomes:** a survey of what people think about an intervention does not support a claim that it works.
- **Evidence strength** is set by code from the study design and size (for example, a large randomised trial or a systematic review
  ranks above a small observational study). It is a simple rule, **not GRADE**, and the page says so.
- **Confidence** (how sure the reading is) and **strength** (how good the study is) are shown separately.

The synthesis may only cite papers that were assessed; references to anything else are removed, an "agreement" needs at least two
papers, and a "gap" must say what it's based on. The checks are counted and stored with each synthesis.

## 4. Plans and limits

Stored in `plans.research_limits` and editable in Admin → Academic research → Research workspace. Enforced on the server.

| Plan | Searches / month | Papers / search | Assessments / search | Syntheses / month | Full text | Export |
|---|---|---|---|---|---|---|
| Free | 5 | 25 | 10 | 2 | no | yes |
| Pro, Exam Pass | 30 | 50 | 40 | 15 | yes | yes |
| Max | 100 | 50 | 80 | 40 | yes | yes |
| Guest | 0 | | | | | |

These are proposed defaults, not yet a product decision. Prices are unchanged. The pricing page does **not** mention Research yet.

## 5. Benchmark: measured result

`supabase/eval/evidence-benchmark.json` holds 4 claims and 20 real papers (by DOI) with the category each should get. Abstracts are
fetched from Europe PMC at run time and not stored. `supabase/dev/eval-evidence.ts` runs the real model and the real checks.

**Limits of this benchmark:** the labels were made by Claude (an AI) from the abstracts, not by a subject expert; 20 papers is
small; 12 of the 20 are "not relevant", so the rarer categories rest on 1 to 3 papers each. Treat it as a first check. It should be
reviewed and extended by a researcher before any accuracy figure is quoted publicly.

Run on 6 November 2026 (`supabase/eval/evidence-benchmark-result.json`):

| Measure | Result |
|---|---|
| Accuracy | 17 / 20 (85%) |
| Macro F1 (5 categories) | 0.87 |
| False "supports" (paper wrongly said to support) | 1 of 18 (5.6%) |
| False "contradicts" | 0 of 18 |
| Quoted passages kept / rejected as not in the text | 19 / 4 |
| Judgements downgraded because no passage was found | 0 |
| References valid | All references come from retrieved records (DOI from the service), not from the model; DOIs were not each resolved online in this run |

| Category | In gold set | Precision | Recall | F1 |
|---|---|---|---|---|
| Supports | 2 | 0.67 | 1.00 | 0.80 |
| Contradicts | 2 | 1.00 | 1.00 | 1.00 |
| Mixed | 1 | 1.00 | 1.00 | 1.00 |
| Insufficient | 3 | 0.67 | 0.67 | 0.67 |
| Not relevant | 12 | 0.91 | 0.83 | 0.87 |

The three misses: a general paper on climate interventions for child health was said to **support** "insecticide-treated nets
reduce malaria in children" (the false support); a correlational study on retrieval scores was called not relevant instead of
insufficient; an oral-health paper was called insufficient instead of not relevant for a vitamin D and cancer claim.

The model's answers vary between runs; this is one run.

## 6. Data and security

Migration `20261106000021_menya_research_workspace.sql` only adds: one column on `plans` and nine tables (`research_projects`,
`research_searches`, `research_papers`, `research_search_papers`, `research_claims`, `evidence_assessments`, `research_syntheses`,
`research_saved_papers`, `research_exports`). Row-level security is on and the browser roles have no access to them; every read and
write goes through server functions that check the user owns the row. Another user's search answers "not found". Paper records hold
only public bibliographic data and abstracts. Rollback: `supabase/rollback/20261024_menya_all.down.sql` drops the new tables.

IremboPay, sign-in, subscriptions and the tutor are not touched.

## 7. Admin

Admin → Academic research → Research workspace shows, for the chosen period: searches, users who searched, searches by subject,
average search and assessment time, tokens and cost, papers assessed by category, passages rejected and judgements downgraded,
syntheses, exports by format, most-saved papers, and the limits per plan (editable).

## 8. Cost

The Groq free route has no charge at current use. A test search (22 papers found, 15 kept, 9 assessed, synthesis) used tokens worth
about $0.014 at Groq's list price. The real limit is Groq's free rate: when busy, the page waits and retries, showing a countdown.

## 9. Tests

- `supabase/tests/research-workspace.test.ts`: 20 tests (query parsing, passage and downgrade rules, formats, the full API flow with
  scripted services and model, privacy between users, limits, admin, plans unchanged). Whole backend suite: 295 pass.
- Website: 28 pass; build succeeds. Checked in a browser at 375 px wide: no sideways scrolling.
- `supabase/dev/try-workspace.ts`: one real search, assessment and synthesis against live services.

## 10. Deployment

1. Database: apply `20261106000021_menya_research_workspace.sql`.
2. Server: deploy `api` pinned to the commit. No new secrets needed.
3. Website: publish.
4. Recommended: `SEMANTIC_SCHOLAR_API_KEY`, `OPENALEX_API_KEY` (free; see `docs/RESEARCH.md` section 5).
5. Check: run one search in the live site, then Admin → Academic research.

## 11. Known limitations

- Relevance ranking comes from the services; low-quality journals can appear. The page shows the journal so users can judge.
- Abstract-only judgements are less reliable than full-text ones; most papers are abstract-only.
- The model can be wrong; every judgement shows its quoted passage so it can be checked.
- English-only page; quotas are first guesses.
