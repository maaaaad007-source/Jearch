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
| Job search | JSearch (RapidAPI) or TheirStack |
| Contact enrichment | Apollo.io or Hunter.io |

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
| `THEIRSTACK_API_KEY` | TheirStack job search |
| `APOLLO_API_KEY` | Apollo.io people search |
| `HUNTER_API_KEY` | Hunter.io domain search |
| `JOB_PROVIDER` | Pin the job provider: `jsearch` \| `theirstack` \| `demo` |
| `CONTACT_PROVIDER` | Pin the contact provider: `apollo` \| `hunter` \| `demo` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (optional sync) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (optional sync) |

Provider selection falls back gracefully: whichever key is present wins (JSearch and Apollo preferred),
and with nothing set the app uses demo data and says so in the results header.

### Checking that your keys took effect

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
