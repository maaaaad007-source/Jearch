# Jearch — direct-contact job finder

Search live job postings by title, company and country, and get the person
hiring for each one: their role, their LinkedIn profile, and an email address
where one can be worked out.

Next.js 16 (App Router) · TypeScript · Tailwind v4 · Zustand.

---

## Why it is built this way

This is the second design. The first used a search engine as its job source,
and the rebuild came directly out of what that cost:

| Symptom | Cause | What changed |
| --- | --- | --- |
| A search returned 2 results where LinkedIn showed 98 | Google indexes *pages*, not jobs — and only page one was read | Jobs come from job **databases**, several pages fetched in parallel |
| "UX Writer" answered a search for "UX Designer" | Any shared word counted as a match | Titles are **scored**; adjacent roles land in a separate, labelled tier |
| Filtering harder produced "No postings matched" | A boolean gate discards near misses silently | Nothing relevant is thrown away — close matches get their own heading |
| A guessed email was shown like a confirmed one | Both rendered identically | The LinkedIn profile leads; a constructed address is labelled as constructed |
| Hours lost debugging a search that was never sent | An unset key looked exactly like an empty result | Nothing degrades silently — see `/setup` |

The last one is worth stating plainly: **there is no demo mode.** If a source
is not configured the app names the missing variable instead of showing
synthetic postings.

---

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in what you have — Sweden needs nothing
npm run dev                  # http://localhost:3000
```

Open `/setup` to see what is actually connected.

| Command | |
| --- | --- |
| `npm run dev` | development server |
| `npm run build` | production build |
| `npm test` | ranking and matching tests |
| `npm run typecheck` | app and test type-checking |
| `npm run lint` | ESLint |

---

## Configuration

| Variable | Needed for |
| --- | --- |
| `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` | Jobs in 19 countries — free tier at [developer.adzuna.com](https://developer.adzuna.com) |
| `SERPER_API_KEY` | Finding who is hiring, via [serper.dev](https://serper.dev) |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Optional: sync saved jobs across devices |

Swedish searches need no credentials at all — Platsbanken is open data, and
the Greenhouse/Lever/Ashby boards need no credential in any country.

Variable names are matched loosely: case and separators are ignored, so
`adzuna_app_id` and `ADZUNA-APP-ID` both work. A name missing from `/setup`
did not reach the running build at all.

> **Deploying:** environment variables are scoped per environment and read at
> build time. A variable saved for Production does not reach a Preview build,
> and none reach a deployment created before it was saved — redeploy after
> changing one. In a hosting dashboard the left-hand box is the *variable
> name* and the right-hand box is the value; putting the Adzuna Application ID
> in the name box is the most common way to end up with no results. `/setup`
> reports which environment and commit answered, so these cases are
> distinguishable.

---

## How a search works

```
     roles + company + country          "UX Designer, Product Designer"
                 │                       is one search, several queries
                 ▼
   ┌─────────────────────────────┐   Adzuna       ·  3 pages ×  50 × roles
   │  every source that applies, │   Platsbanken  ·  2 pages × 100   (SE)
   │  all pages at once          │   Greenhouse ┐
   └─────────────────────────────┘   Lever      ├ the employer's own board,
                 │                   Ashby      ┘ only with a company named
                 │  up to ~150 postings
                 ▼
      de-duplicate  (employer + title + town)
                 │   the employer's own listing wins over an aggregator's copy
                 ▼
      rank ──►  exact matches  ─┐
                close matches  ─┴─►  two labelled tiers on screen
                 │
                 ▼
      look up people for the top employers  (one Serper search each)
```

### Sources

| Source | What it is | Scope |
| --- | --- | --- |
| **Adzuna** | Aggregated jobs database | 19 countries |
| **Platsbanken** | Swedish public employment service | Sweden, no credential |
| **Greenhouse**, **Lever**, **Ashby** | The employer's own careers board, free unauthenticated JSON | Any country — **only when a company is named**, since a board is addressed per employer rather than searched |

The applicant-tracking boards are the primary record: fresher than an
aggregator's copy, with the full description and a link straight to the real
application page. They are addressed by a board token the company chose, which
has to be guessed from the name typed — a few candidates (`bookingcom`,
`booking-com`, `booking`) are tried in parallel and the first board that exists
wins. Each board is worldwide, so postings are filtered to the searched country
by their location text; a location that cannot be placed is kept rather than
dropped.

**Not** included: LinkedIn (no public jobs API, and scraping breaches their
terms) and Indeed (public jobs API closed to new applicants).

Jobs paint as soon as the databases answer; contact panels fill in afterwards,
so the page is useful before the slower half finishes.

Sources are **additive, not competing** — two sources covering one market
produce a better list together, and de-duplication makes the overlap harmless.
A source that fails is named on screen rather than quietly skipped.

### Searching several roles at once

Comma-separate them — `UX Designer, Product Designer` — and `/` or ` or ` work
too. Up to four roles per search; each one gets its own set of queries against
the title-searching sources, all in parallel, and the combined pile is
de-duplicated and ranked once. A posting only has to answer one of the roles,
and each card is badged with the role it matched. An employer's own board is
asked once regardless, since it returns its whole list either way.

The cap exists because every extra role multiplies the requests made — four is
a realistic ceiling, not an arbitrary one.

### What decides a match

`lib/ranking.ts`, and it is deliberately small:

- an exact title beats a phrase match beats every-word-with-synonyms
- seniority words (`senior`, `lead`, `II`) never decide a match
- a description-only match is capped below the exact tier
- postings older than 90 days are dropped
- **a company filter really excludes.** Matching is on name *tokens*, not
  substrings — `"ING"` is inside `"Booking"`, and substring matching once put
  ING's postings in a Booking.com search
- de-duplication keeps seniority: "Senior UX Designer" is not a duplicate of
  "UX Designer" at the same employer

Those rules are pinned by `lib/ranking.test.ts`.

### What is and is not claimed about a contact

A LinkedIn profile was genuinely found — it exists, you can open it. An email
built from `first.last@domain` is a guess. The UI never renders them alike:
the profile leads every card and a constructed address carries a warning.
Applicant-tracking hosts are excluded when resolving a company domain, because
a posting hosted on `teamtailor.com` is not evidence that anyone's address
ends in `@teamtailor.com`.

There is no LinkedIn scraping here. LinkedIn publishes no jobs API and
scraping it breaches their terms; postings come from job databases instead.

---

## Layout

```
app/
  page.tsx              search + results
  setup/                what this deployment can do, in plain language
  saved/                bookmarked opportunities
  api/search            GET  → ranked postings + a report per source
  api/people            POST → who to contact at each employer
  api/setup             the same setup data as JSON
lib/
  sources/              one file per job database + the fan-out orchestrator
  people/               contact lookup
  ranking.ts            scoring, tiering, company matching, de-duplication
  config.ts             environment reading and the setup report
```

Adding a job source means implementing `JobSource` in `lib/sources/types.ts`
and listing it in `lib/sources/index.ts`. The interface deliberately does not
let a source filter or rank — it fetches a page and maps it, and inherits
everything else.

---

## Testing against stubs

Provider hosts are blocked in some sandboxes, and hitting live APIs during
development burns credits. Every source honours an endpoint override
(`ADZUNA_ENDPOINT`, `JOBTECH_ENDPOINT`, `SERPER_ENDPOINT`) so it can be pointed
at a local stub returning the documented response shape.
