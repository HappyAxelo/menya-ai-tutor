# Research, natural tutoring and the profile menu

Status words used here: **Working** means run against the real service. **Written, not run** means the code exists but needs a key
or access to test. **Not integrated** means no code, for the stated reason. Real output is in [RESEARCH_DEMO.md](RESEARCH_DEMO.md).

## 1. What was there before

React and Vite site; one Supabase Edge Function (`api`); Postgres with row-level security. A rules-based engine
(`engine/state.ts`) picks the teaching move before the model writes it. `policy.ts` holds one set of instructions for every model.
The model is told the server's verdict and can't overrule it. The audit found:

- The engine note overrode the instruction to explain concept questions, so "what is entropy?" started with a diagnostic question.
- "I don't know" counted as an attempt, and got another guiding question at the same level.
- The instructions said the tutor had no internet access. Nothing retrieved or checked any source.
- Two bugs already live. Code fences were stripped from every reply, so code never rendered as code. The header menu shared a CSS
  class with another menu, so it floated over the page.

## 2. Machine-sounding patterns

**In the instructions:** openers such as "Certainly" and "Great question", sentences announcing what comes next, closing pep talks,
unrequested recaps, flattery, stock disclaimers, emoji, the ban on any structure (now: plain prose for short answers, headings only
for long multi-part ones), and mode-change announcements.

**Removed by code too** (`polishReply`), because instructions alone aren't reliable: those openers and closers in English and French,
some in Kiswahili and Kinyarwanda, and emoji outside code. Fallback messages no longer say "You're close" when nothing shows it.

The tutor says it's an AI if asked, and is told never to claim to be human or to have personal experiences.

## 3. Tutoring logic

The move is decided by rules, tested in `tests/research.test.ts` and `tests/engine.test.ts`:

| Situation | Move |
|---|---|
| Asks about an idea, values not given | Explain with an example, then one question answerable from it |
| Question about published evidence | Search, teach from it, cite, then check understanding |
| A problem with values | Say what it's asking, then one concrete question about the first step |
| "I don't know": 1st / 2nd / 3rd / 4th time | Hint / explain differently and do one step / work a similar problem / full solution |
| Three questions in a row without progress | Stop asking: explain and do one step |
| Same mistake twice | Worked example of a similar problem (existing) |
| One correct answer | Independent check; mastery needs independent and delayed evidence (existing) |

"I don't know" and concept questions no longer count as attempts, so they can't unlock a solution by themselves.

**Learner memory:** at the start of a conversation and when teaching changes approach, the tutor receives what the server has marked
about this learner: topics found hard, mistakes seen, topics shown, reviews due, and any unsecured prerequisite of the current topic.
Prerequisites exist only for the objectives in the problem bank. For other topics the model infers the link from the list.

## 4. Connector inventory

Tested 3 November 2026 from this computer, not yet from Supabase's servers, whose shared address may hit limits sooner.

| Service | Status | Access | Used for |
|---|---|---|---|
| OpenAlex | **Working** | Free. Without a key, one shared daily budget per IP address: get the free key | Default for most subjects |
| Europe PMC | **Working** | Free, no key | Biomedical; open-access full text |
| PubMed | **Working** | Free. Optional key raises limits | Biomedical |
| arXiv | **Working**, but rate-limited at times | Free, no key | Computing, physics, maths. Always labelled preprint |
| DOAJ | **Working** | Free, no key | Open-access journals |
| Crossref | **Working** | Free, no key | General; publication metadata |
| Semantic Scholar | **Written, not run successfully**: returned "too many requests" on every live try. Parsing tested on a scripted response | Free. The shared public limit is exhausted, so it needs a free key | Most subjects |
| Unpaywall | **Direct request works; adapter not run**: needs `RESEARCH_CONTACT_EMAIL` | Free | Finding legal open copies, deep searches only |
| CORE | **Written, not run**: needs a key; no answer without one | Free key by application | Open-access discovery |
| Consensus | **Not integrated**: API answered 401 | Needs authorised partner access | Ask Consensus for access first |
| Google Scholar | **Not integrated** | No API; terms forbid scraping | Not used |
| African Journals Online | **Not integrated**: its OAI-PMH feed answers, but harvesting isn't search | Free | AJOL papers with DOIs may appear through Crossref or OpenAlex |
| University repositories | **Not integrated** | Varies | Proposed |
| Software documentation | **Not integrated** | | The tutor explains from general knowledge and doesn't retrieve docs |

## 5. Secrets

All optional and free. Set them in Supabase → Edge Functions → Secrets. Keys are never stored in the database or sent to the browser;
the admin page shows only "set" or "not set". So credentials are configured in Supabase rather than in the admin page: this is
deliberate, because a form would mean storing them in the database.

| Secret | Why | Where to get it |
|---|---|---|
| `OPENALEX_API_KEY` | **Recommended.** Its own daily budget instead of one shared by everyone on Supabase's address | openalex.org/settings/api |
| `SEMANTIC_SCHOLAR_API_KEY` | **Recommended.** It rarely answers without one | semanticscholar.org/product/api |
| `RESEARCH_CONTACT_EMAIL` | Required by Unpaywall, and polite use elsewhere. Sent to those services | An address you choose |
| `NCBI_API_KEY` | Optional: higher PubMed limits | ncbi.nlm.nih.gov/account |
| `CORE_API_KEY` | Turns CORE on | core.ac.uk/services/api |

## 6. How a researched reply is made

```
Question → rules: search or not? which services? (no model call, no delay for homework)
         → allowance check → search words only, personal details removed (other languages: model translates to keywords)
         → up to 3 services in parallel (5 on a deep search), by priority, 7 s overall (12 s deep)
              each: cache → rate limit → request → one retry on a server error; 429 = left alone for 60 s
         → merge duplicates → rank by relevance, usable text, type, age, citations → top 5 (8 deep)
         → deep only: short excerpts of open-licence papers; legal open copies
         → numbered, cleaned records go to the model as data, marked as not instructions
         → model teaches and writes markers like [S2]
         → server replaces markers with real citations and removes anything unverifiable
```

**Rules:** the question table in the brief is covered in `tests/research.test.ts`. Search also runs when a student presses Research.
A search counts against the allowance only if it finds something.

**When it fails:** a slow or failing service is skipped. If none answer, the tutor still replies, and the app itself shows that the
answer wasn't checked against current research.

**Costs:** every research service used is free. A researched reply uses more of the model's free-tier allowance (one test estimated
$0.0012 at listed prices). No paid service was added.

## 7. Citation checking

The model never receives a DOI or URL to copy, and is told to write markers only. After it replies, `checkCitations`:

- turns valid markers into links, and builds in-text citations and APA 7 references only from the retrieved record;
- removes markers with no source, invented DOIs and links, author-year citations matching no record, and any reference list the model wrote;
- counts each removal, shown to administrators as "Citations removed".

Status is carried through honestly. Preprints are labelled as such. "Journal article" is what the record says, and peer review isn't
claimed for a paper individually, because the services don't confirm it. Each reference states whether Menya read the abstract, excerpts
or only the title. Retracted papers are dropped where the service marks them.

**Limit, and it matters:** this proves each citation is a real retrieved paper. It does **not** prove the paper supports the sentence.
The model is told to claim only what the text says, but a summary can still overreach. In the demo, one reply credited a broad claim to a
student journal article. Ranking also favours closely matching text over standing in the field, so a weak paper can rank above a
well-known one. Students are told to open a paper before relying on it. Conflicting evidence is handled by instruction and wasn't
measured on a real disagreement.

## 8. Profile and logout

A profile button (picture or initials) opens: My profile, Learning progress, Courses, Saved notes, My study, Practice exam, Subscription,
Usage and limits, Settings, Help and support, Log out. Guests get a shorter menu with Create an account.

- **My profile:** name, email, picture, sign-in method, creation date, plan, language, level, field of study, institution. No credentials.
- **My courses:** only what the student entered. Menya has no course catalogue, and the page says so.
- **Notifications:** Menya sends none, and the page says that rather than showing switches that do nothing.
- **Log out** ends the session on the server, clears the browser's token and account markers even if the server can't be reached, and
  fully reloads, so nothing stays in memory. Other tabs follow. Back shows no account content. Theme and text size stay, as device
  preferences. **Log out on all devices** is on the profile page.
- **Offline logout:** this browser is cleared, and the student is told the session expires by itself within the hour.

## 9. Admin

Admin → **Academic research**: status, requests, cache hits, failures, rate-limit events and average time per service; researched
replies, sources retrieved and cited, citations removed, estimated AI cost, and subjects. Controls: on/off, priority, timeout, rate limit,
waiting times, cache time, per-plan searches, and a live test for each service. Every change goes to the audit log. Priority sets the order
among the services that suit a question's subject; the subject decides which are eligible.

## 10. Security and privacy

| Risk | Handling |
|---|---|
| Student data reaching research services | Search words only; emails, phones, links and "my name is…" removed. A name typed some other way could still pass |
| Instructions hidden in a paper | Cleaned, stripped of markup and known phrases, marked as data; output is checked. Reduces the risk, doesn't eliminate it. One real-model test passed; that's not proof |
| Invented references | Removed by the server, see section 7 |
| Exposed keys | Server only; test confirms the admin response holds no key values |
| Students reading research tables | No access; tested |
| What's stored | Usage rows hold no question text and no user. Cached records are public metadata. References are stored with the conversation, under its existing rules |
| Copyright | Short excerpts of open-licence papers only; no paywall bypass; papers are never stored in full |
| Student conversations seen by admins | Unchanged. Note the existing feedback export does include the rated question and reply |
| Guests | No research (limit 0), and existing restrictions still apply |

The privacy policy now names the research services. **Not done:** legal review. Translations in Kinyarwanda, French and Kiswahili need a native
speaker's review.

## 11. Tests

Run: `cd supabase && npm test` and `cd menya && npm test`. On commit of this release: 270 backend and 28 front-end tests, none failing.
Outside services and the model are scripted in these tests. `dev/try-research.ts` and `dev/try-tutoring.ts` use the real ones.

**Acceptance list**

| # | Criterion | Result |
|---|---|---|
| 1-3, 5 | Direct answers, depth, guiding, help when struggling | Real model: seen in the demo |
| 4 | No repetitive, frustrating questions | Rules tested. The real model still re-asked once in a test; instruction tightened; not re-measured at scale |
| 6 | Adapts to level | Existing level setting and learner memory; not measured on real students |
| 7-8 | Search when needed, not otherwise | Tested |
| 9-11, 14 | Real metadata, links work, abstract not passed off as full text, no invented references | Tested; demo DOIs resolved to the right titles |
| 12 | Conflicting evidence | Instruction only; **not measured** |
| 13, 22 | Failures and timeouts | Tested |
| 15-18 | Profile, usage, progress, logout | Browser test on the local backend |
| 19 | Logout invalidates the session | **Client tested. The server side needs checking on live Supabase after deployment** |
| 20-21 | Guests restricted; accounts intact | Tested in the database; re-check on live |
| 23-24 | Keys, monitoring | Tested |
| 25 | Prompt injection | Tested, plus one real-model run. Risk reduced, not gone |
| 26 | IremboPay and subscriptions | Existing tests pass; no payment code changed |

**Not tested:** real Google or email logout, real phones, Supabase's network, CORE, Semantic Scholar and Unpaywall through the full pipeline,
real student use.

## 12. Deployment

1. Database: apply `20261103000020_menya_research.sql`. It only adds; see its header for rollback.
2. Server: deploy `api` pinned to the commit. Works with no new secrets.
3. Website: publish.
4. Optional: add the free keys from section 5.
5. Check: Admin → Academic research → Test now on each service, because Supabase's address may behave differently from the one tested here.
