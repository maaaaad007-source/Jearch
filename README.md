# Jearch — Direct-Contact Job Finder

Search active job postings by **title**, **company**, and **country**, and get the decision maker behind each one:
recruiter or hiring lead, with LinkedIn profile, verified work email and direct phone where they exist.
Draft the outreach email in one click, and bookmark what you want to follow up on.

![Next.js](https://img.shields.io/badge/Next.js-16-black) ![TypeScript](https://img.shields.io/badge/TypeScript-5-blue) ![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-06B6D4)

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000
```

No API keys needed to try it. With no provider configured the app runs in **demo mode**: seeded,
clearly-labelled synthetic postings and contacts on `.example` domains, so every screen and every
interaction works before you pay for anything.

To go live, copy `.env.example` to `.env.local` and fill in at least one job key and one contact key.

---

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, TypeScript, React 19) |
| Styling | Tailwind CSS v4 + Shadcn-style UI primitives on Radix |
| UI state | Zustand |
| Persistence | Zustand `persist` → `localStorage`, optionally mirrored to Supabase |
| Job search | Platsbanken/JobTech (Sweden), Adzuna (19 countries), JSearch, TheirStack, or job boards via Serper |
| Contact enrichment | Serper (LinkedIn), Apollo.io, or Hunter.io |

---

## How it works

```text
[Title and/or Company + Country]
       │
       ▼
GET /api/jobs ─────────► JSearch / TheirStack ──► normalized JobPost[]
       │
       ├─ extract company domains
       ▼
POST /api/contacts ────► Apollo / Hunter (decision-maker title filter)
       │                 ranked by title relevance, then reachability
       ▼
UI merges JobPost + ContactPerson into one card
```

The two phases are deliberately separate requests. Job cards paint as soon as the board responds and
the contact panels fill in when enrichment lands, instead of the page waiting on the slower of the two.

Every provider adapter in `lib/providers/` maps its vendor payload into the shared types in
`types/index.ts`, so swapping JSearch for TheirStack — or Apollo for Hunter — never touches a component.

The company filter is applied differently per provider, because their APIs differ: TheirStack has a real
employer filter, while JSearch takes only free text, so the company is folded into the query and the
results are filtered on the way back.

---

## Configuration

All environment variables are optional; see `.env.example` for the full list.

| Variable | Purpose |
| --- | --- |
| `RAPIDAPI_KEY` | JSearch via RapidAPI |
| `JSEARCH_PATH` | Override the JSearch endpoint path if it is renamed again (default: probes `/search-v2`, then `/search`) |
| `JSEARCH_ENDPOINT` | Override the JSearch base URL (testing or a proxy) |
| `SERPER_ENDPOINT` | Override the Serper base URL (testing or a proxy) |
| `JOBTECH_API_KEY` | Optional key for JobTech/Platsbanken (free, from apirequest.jobtechdev.se) |
| `ADZUNA_APP_ID` / `ADZUNA_APP_KEY` | Adzuna credentials (free, from developer.adzuna.com) — covers 19 countries |
| `JOBTECH_DISABLED` | `true` skips JobTech even for Swedish searches |
| `THEIRSTACK_API_KEY` | TheirStack job search |
| `SERPER_API_KEY` | Serper — powers both LinkedIn job listings and LinkedIn contact lookup |
| `SERPER_RESOLVE_DOMAINS` | `false` skips the extra credit spent resolving a company's website (default: resolve) |
| `SERPER_PLAIN_QUERIES` | `true` skips operator queries outright — set this on a free Serper account |
| `APOLLO_API_KEY` | Apollo.io people search |
| `HUNTER_API_KEY` | Hunter.io domain search |
| `JOB_PROVIDER` | Pin the job provider: `jsearch` \| `theirstack` \| `serper` \| `demo` |
| `CONTACT_PROVIDER` | Pin the contact provider: `serper` \| `apollo` \| `hunter` \| `demo` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (optional sync) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (optional sync) |

Provider selection falls back gracefully: whichever key is present wins, and with nothing set the app
uses demo data and says so in the results header.

### Why a national job board beats a search engine

A search engine indexes web pages; a job board holds the jobs. Asked for UX Designers in Sweden, Google
returns directory pages and a handful of postings, while LinkedIn's own search shows ninety-odd — the
gap is not filtering, it is the data source.

So where a jobs database covers the country, it leads. **Sweden uses
[JobTech/Platsbanken](https://jobtechdev.se)**, the Public Employment Service's ad API: free, structured,
and close to complete for the market, since that is where employers advertising in Sweden post. It also
carries each ad's application email, which yields the employer's real domain rather than a guessed one.
**[Adzuna](https://developer.adzuna.com)** covers nineteen more countries — the Netherlands, UK, Germany,
France, Poland, the US and others — on the same principle, with a real employer filter of its own.

Search-based sources remain the fallback for markets neither covers.

### What the form promises, enforced

Whatever the source, `lib/providers/relevance.ts` applies the promises the search form makes, so a new
provider inherits them rather than re-implementing them:

- **A company filter means that company.** Searching "UX Designer at Booking.com" returned postings from
  HousingAnywhere and Wongdoody until this was enforced; a filter that does not filter is a bug.
- **The role has to be the role.** Every significant word must appear, synonyms allowed, so "User
  Experience Designer" matches "UX Designer" while "UX Writer" does not — sharing "UX" is not enough to
  make them the same job. A posting titled "Designer II Job Opening" is still kept when its description
  names the discipline.
- **Nothing stale.** Postings older than 120 days are dropped, whatever the index still lists.

Job sources are tried **in order** rather than one being picked and stuck with. Different boards index
different employers, so when the preferred source returns nothing — or is unreachable — the next
configured one is tried, and the results header says where the postings actually came from. Setting
`JOB_PROVIDER` pins a single source and disables the chain. Paging stays on whichever source answered
page one. For contacts, Serper is preferred when available — it
costs a fraction of the enrichment vendors and works from a company name alone, so it returns something
for employers the domain-based services have never indexed.

### Pulling LinkedIn listings

LinkedIn has no public jobs API, and scraping it directly breaches their terms. What works instead is
Google: LinkedIn job pages are indexed, and their titles follow a fixed shape
(`Acme hiring Senior UX Designer in Amsterdam | LinkedIn`). With `SERPER_API_KEY` set and
`JOB_PROVIDER=serper`, the app runs a `site:linkedin.com/jobs/view` search through Serper and parses
those titles into postings — real LinkedIn listings, one credit per search, no scraping.

The trade-off is what a search result contains: title, company, location, a snippet and the posting URL
— but no salary and no employer website. The contact side compensates by looking companies up by name.

**Queries name cities, not countries.** Asking Google for "UX Designer jobs Sweden" returns Sweden-wide
directory pages — "5000+ Design jobs in Sweden" — because that is what those pages rank for. A city and
an ATS platform are what individual postings rank for, so `lib/countries.ts` carries the major
employment centres per country and the queries use them. Countries without a city list fall back to the
country name.

**One search runs four queries**, angled differently — two cities, the applicant-tracking systems, and
LinkedIn — because a single page of Google leaves only a handful of postings once filtered. Results are
merged and deduplicated, employers whose name could be read are listed first, and a thin result set
triggers one more untargeted query. Four to five credits per search rather than one.

Closed vacancies are dropped: Google indexes them for months after the fact, and the whole point of a
card is the outreach. A posting on the employer's own domain also yields the company and its website
directly from the host — `ericsson.com` is Ericsson — which beats resolving the domain with another
search and cannot land on an ATS host.

Quality gates run over everything that comes back, because a search engine returns portals as readily as
postings. A role has to echo what was searched for (an aggregator titled "Jobs in Stockholm" is not a UX
Designer role), and an employer name that is really a country, a city, a work arrangement or a sentence
fragment is discarded rather than shown — it would otherwise feed the contact lookup and produce a
guessed address at a nonsense domain.

**Free Serper accounts reject operator queries** (`Query pattern not allowed for free accounts`), and
`site:` is exactly what the precise search uses. The adapter detects that rejection and retries with a
plain keyword query, filtering results by URL so only LinkedIn job pages and profiles survive — fewer
results per credit, but it works. Set `SERPER_PLAIN_QUERIES=true` to skip the doomed first attempt.

### What Serper can and cannot give you for contacts

Serper finds the *person*: name, role, and LinkedIn profile URL, by searching LinkedIn profiles at the
company for decision-maker titles. It cannot verify an email, because a search engine has no way to.

When the company's domain is known — or resolvable with one extra credit — a pattern address
(`first.last@domain`) is offered and always labelled **Guess / Unverified**, with the source line saying
so outright. If you need verified addresses, that is what Hunter and Apollo are for; the two can be
combined by setting `JOB_PROVIDER=serper` with `CONTACT_PROVIDER=hunter`.

### Checking that your keys took effect

`/api/debug/serper?designation=UX+Designer&country=SE` runs a real search and reports every result with
a verdict — kept as a posting, or rejected and why. When a search returns nothing, that is what separates
"Google found nothing" from "the filters discarded everything", which look identical from the outside.

If a live search fails with a parsing error, `/api/debug/jsearch` reports the structure of a real
JSearch response — which endpoint answered, where the job array sits, and what fields the first record
carries. It describes shapes rather than dumping the body, and never includes the key, so the output is
safe to share when reporting a problem.

Open `/api/status` on the running app (e.g. `https://your-app.vercel.app/api/status`). It reports which
providers are in play and which environment variables were detected — as booleans only, never key
values, so it is safe to open on a deployed URL and safe to paste when asking for help.

The results header names the providers that actually served the request too:

- `Demo data` — no key was picked up; the app is still on sample data.
- `Jobs: JSearch` / `Contacts: Hunter.io` — that provider answered, so the key works.

If a key is present but wrong or out of quota, the failure is shown rather than swallowed: a bad job key
surfaces the provider's message in place of the results, and a contact key that fails for every company
puts that message on each card instead of the ambiguous "No decision maker found for this company".

### Saved opportunities

Bookmarks always persist locally in the browser, so the Saved dashboard works with zero setup. Point
the app at a Supabase project and they are mirrored server-side as well — run `supabase/schema.sql`
first. There are no user accounts: each browser generates an anonymous owner id, and rows are scoped
by it. Read the comments in the schema before using it with real data.

---

## Features

**Search** — job title with autocomplete over a curated title corpus, an optional company filter, and a
type-to-filter country picker (alphabetical, matches on name or ISO 3166-1 alpha-2 code, accent
insensitive). Either the title or the company is enough on its own. Skeleton loading states throughout,
and a **Load more** button that pages the job board without re-billing enrichment for companies already
looked up.

**Result cards** — two sections per card:

- *Job banner*: title, company, location, work type (Remote/Hybrid/On-site), estimated salary,
  freshness badge, and an expandable key-responsibilities summary extracted from the description.
- *Contact panel*: decision maker name and title, LinkedIn badge, click-to-copy work email and direct
  phone, a Verified / Guess / Unverified badge, plus any other decision makers at the same company.

**Outreach** — a pre-filled draft naming the role and company, editable in place, handed to your mail
client via `mailto:`, or copied whole to the clipboard.

**Saved dashboard** — bookmarked jobs with their contact card, per-opportunity notes, and CSV export.

---

## Project layout

```
app/
  api/jobs/         GET  designation and/or company + country, paged → postings
  api/contacts/     POST company domains → ranked decision makers
  api/saved/        Optional Supabase-backed bookmark sync
  page.tsx          Search + results
  saved/page.tsx    Saved opportunities dashboard
components/         Cards, panels, dialogs, and ui/ primitives
lib/
  providers/        One adapter per vendor + demo data generator
  countries.ts      ISO country list + the combobox search filter
  email-template.ts Outreach draft builder
  text.ts           HTML stripping and responsibility summarization
store/              Zustand stores (search pipeline, saved bookmarks)
types/              Shared domain types
```

---

## Scripts

```bash
npm run dev         # dev server
npm run build       # production build
npm run start       # serve the production build
npm run lint        # eslint
npm run typecheck   # tsc --noEmit
```

---

## A note on contact data

Enrichment providers return best-effort data — that is what the verification badge is for. Check an
address before you use it, and follow the rules that apply to unsolicited outreach in your market
(GDPR in the EU, CAN-SPAM in the US, and equivalents elsewhere). Demo mode never emits a real address.
