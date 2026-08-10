import type { JobPost, MatchQuality, RankedJob, SearchParams } from "@/types";

/**
 * Turning a pile of postings into an ordered answer.
 *
 * Two complaints drove this file, and they pull in opposite directions: "it
 * shows very limited results" and "the searches aren't showing exact results".
 * Filtering harder satisfies the second and worsens the first; filtering less
 * does the reverse. So nothing relevant is thrown away — postings are *scored*
 * and split into an exact tier and a close tier, and the UI labels both. The
 * user sees everything that could plausibly matter, in an order that puts the
 * real answers on top.
 */

/** Beyond this a posting is usually filled, whatever the index still says. */
const MAX_AGE_DAYS = 90;

/** Words employers use interchangeably in titles. */
const SYNONYMS: Record<string, string[]> = {
  ux: ["user experience"],
  ui: ["user interface"],
  qa: ["quality assurance"],
  pm: ["product manager", "project manager"],
  hr: ["human resources", "people"],
  dev: ["developer", "engineer"],
  developer: ["engineer", "dev"],
  engineer: ["developer"],
  sre: ["site reliability"],
  ml: ["machine learning"],
  ai: ["artificial intelligence"],
  sr: ["senior"],
  senior: ["sr", "lead"],
};

/** Seniority and filler that should not decide whether a title matches. */
const IGNORABLE = new Set([
  "junior", "senior", "sr", "jr", "lead", "principal", "staff", "mid",
  "level", "i", "ii", "iii", "and", "or", "the", "of", "for", "a", "an",
]);

function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-zà-ÿ0-9+#]+/)
    .filter(Boolean);
}

function significant(text: string): string[] {
  return words(text).filter((word) => word.length >= 2 && !IGNORABLE.has(word));
}

function contains(haystack: string, word: string): boolean {
  if (haystack.includes(word)) return true;
  return (SYNONYMS[word] ?? []).some((synonym) => haystack.includes(synonym));
}

const LEGAL_SUFFIX =
  /^(inc|llc|ltd|limited|gmbh|bv|nv|ab|as|oy|plc|corp|corporation|holding|holdings|group|sa|srl|spa|co)$/;

/**
 * A company name as comparable tokens, with legal suffixes removed.
 *
 * "Booking.com B.V." and "Booking.com" both reduce to ["booking", "com"],
 * which is what makes a catalogue's spelling and a user's spelling comparable.
 */
export function companyTokens(name: string): string[] {
  return name
    .toLowerCase()
    // Dots close up rather than split, so "B.V." becomes the strippable "bv"
    // and "Booking.com" stays one token instead of two.
    .replace(/\./g, "")
    .split(/[^a-z0-9]+/)
    .filter((token) => token && !LEGAL_SUFFIX.test(token));
}

/** Flat form, used for de-duplication fingerprints. */
export function slugifyCompany(name: string): string {
  return companyTokens(name).join("");
}

/**
 * Are these the same employer?
 *
 * Prefix matching on tokens, not substring matching on letters. Substrings
 * looked reasonable and were quietly wrong: "ING" is inside "Booking", so a
 * search for Booking.com returned ING's postings. Requiring one name to *begin*
 * with the other keeps the cases that matter — "Booking.com B.V.",
 * "Google Netherlands" — and rejects coincidental overlap.
 */
export function sameCompany(a: string, b: string): boolean {
  const left = companyTokens(a);
  const right = companyTokens(b);
  if (left.length === 0 || right.length === 0) return false;

  // Catalogues disagree about where the spaces go: "Booking.com" reduces to
  // one token, "Booking com" to two. Comparing the closed-up forms for
  // *equality* settles that. Deliberately not a prefix test — "metabase"
  // starts with "meta" and they are different companies.
  if (left.join("") === right.join("")) return true;

  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
  return shorter.every((token, index) => token === longer[index]);
}

/**
 * Does this posting come from the employer that was asked for?
 *
 * A company filter is a promise, not a hint — searching Booking.com and being
 * shown a different employer is a bug — so this one really does exclude.
 */
export function matchesCompany(job: JobPost, company: string): boolean {
  if (!company.trim()) return true;

  return sameCompany(job.companyName, company);
}

export function ageInDays(iso: string | null): number | null {
  if (!iso) return null;

  const posted = Date.parse(iso);
  if (Number.isNaN(posted)) return null;

  return (Date.now() - posted) / 86_400_000;
}

/**
 * How well a title answers the search, 0-100.
 *
 * The tiers matter more than the numbers: an exact phrase beats a bag of
 * words, which beats a match found only in the description. "UX Writer"
 * scoring below "UX Designer" for a UX Designer search is the whole point —
 * they share a word but are different jobs.
 */
export function scoreTitle(title: string, designation: string): number {
  const wanted = designation.trim().toLowerCase();
  if (!wanted) return 60;

  const haystack = title.toLowerCase();
  if (haystack === wanted) return 100;
  if (haystack.includes(wanted)) return 90;

  const needed = significant(wanted);
  if (needed.length === 0) return 60;

  const matched = needed.filter((word) => contains(haystack, word));
  if (matched.length === needed.length) return 80;

  // A partial title match is what "close" is made of: "Product Designer" for a
  // "UX Designer" search is worth showing under a heading that says so.
  return Math.round(40 * (matched.length / needed.length));
}

const EXACT_THRESHOLD = 70;

export interface RankOptions {
  /** Postings older than this are dropped outright. */
  maxAgeDays?: number;
}

export interface RankedResults {
  exact: RankedJob[];
  close: RankedJob[];
  /**
   * Title matches at a *different* employer, kept only when a company was
   * named. A company search that finds nothing has still done the work of
   * finding the role elsewhere, and throwing that away leaves the user with a
   * blank screen and no idea whether the role or the employer was the problem.
   */
  elsewhere: RankedJob[];
  /** Why postings were set aside — the difference between "no such job" and
   * "wrong company name", which is invisible from a count of zero. */
  excluded: { company: number; stale: number; title: number };
}

/** Enough to prove the role exists elsewhere, without burying the answer. */
const ELSEWHERE_LIMIT = 12;

/**
 * Score, split and order every posting collected for a search.
 *
 * Recency only ever breaks ties within a tier — a fresh near-miss should not
 * outrank an exact match from last month, which is the mistake a single
 * blended score makes.
 */
export function rankJobs(jobs: JobPost[], params: SearchParams, options: RankOptions = {}): RankedResults {
  const maxAge = options.maxAgeDays ?? MAX_AGE_DAYS;
  const exact: RankedJob[] = [];
  const close: RankedJob[] = [];
  const elsewhere: RankedJob[] = [];
  const excluded = { company: 0, stale: 0, title: 0 };

  for (const job of jobs) {
    const age = ageInDays(job.postedAt);
    if (age !== null && age > maxAge) {
      excluded.stale += 1;
      continue;
    }

    const wrongCompany = Boolean(params.company && !matchesCompany(job, params.company));

    let score = scoreTitle(job.title, params.designation);

    // Some employers title a posting "Designer II" and name the discipline
    // only in the body. Worth showing, never worth calling an exact match.
    if (score < EXACT_THRESHOLD && params.designation && job.description) {
      const needed = significant(params.designation);
      const body = job.description.toLowerCase();
      if (needed.length > 0 && needed.every((word) => contains(body, word))) {
        score = Math.max(score, 50);
      }
    }

    if (score <= 0) {
      excluded.title += 1;
      continue;
    }

    const quality: MatchQuality = score >= EXACT_THRESHOLD ? "exact" : "close";

    if (wrongCompany) {
      excluded.company += 1;
      elsewhere.push({ job, quality, score });
      continue;
    }

    (quality === "exact" ? exact : close).push({ job, quality, score });
  }

  const order = (a: RankedJob, b: RankedJob) => {
    if (b.score !== a.score) return b.score - a.score;

    const ageA = ageInDays(a.job.postedAt) ?? Number.MAX_SAFE_INTEGER;
    const ageB = ageInDays(b.job.postedAt) ?? Number.MAX_SAFE_INTEGER;
    return ageA - ageB;
  };

  return {
    exact: exact.sort(order),
    close: close.sort(order),
    elsewhere: elsewhere.sort(order).slice(0, ELSEWHERE_LIMIT),
    excluded,
  };
}

/**
 * The employers a search actually turned up, most postings first.
 *
 * Shown when a company filter matched nothing: seeing that the catalogue lists
 * "Booking.com BV" while you typed something it could not reconcile is the
 * fastest way to understand an empty result, and no error message can guess it
 * for you.
 */
export function employersFound(jobs: RankedJob[], limit = 8): string[] {
  const counts = new Map<string, number>();

  for (const { job } of jobs) {
    const name = job.companyName;
    if (!name || name === "Unknown company") continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name]) => name);
}

/**
 * Collapse the same job arriving from two sources, or twice from one.
 *
 * Aggregators repost, and the same ad reaches Adzuna under several ids, so
 * identity is the employer plus the title plus the town rather than any id.
 */
/**
 * Which copy of the same opening to keep.
 *
 * The employer's own board wins over an aggregator's copy of it even when the
 * aggregator's text is longer: it is the primary record, so its link goes
 * straight to the real application page and its details are what the employer
 * actually published. Between two copies of equal standing, the fuller
 * description gives the card more to show.
 */
function preferredCopy(a: JobPost, b: JobPost): JobPost {
  if (a.directFromEmployer !== b.directFromEmployer) {
    return a.directFromEmployer ? a : b;
  }

  return (a.description?.length ?? 0) > (b.description?.length ?? 0) ? a : b;
}

export function dedupe(jobs: JobPost[]): JobPost[] {
  const seen = new Map<string, JobPost>();

  for (const job of jobs) {
    const fingerprint = [
      slugifyCompany(job.companyName),
      // Every word, not just the significant ones: seniority is ignorable when
      // deciding whether a title *matches* a search, but "Senior UX Designer"
      // and "UX Designer" at one employer are two different openings.
      words(job.title).join(""),
      (job.city ?? "").toLowerCase().replace(/[^a-z]/g, ""),
    ].join("|");

    const existing = seen.get(fingerprint);
    if (!existing || preferredCopy(job, existing) === job) {
      seen.set(fingerprint, job);
    }
  }

  return [...seen.values()];
}
