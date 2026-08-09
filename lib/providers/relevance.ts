import type { JobPost, SearchParams } from "@/types";
import { slugifyCompany } from "@/lib/company";

/**
 * Post-filters applied to every provider's results.
 *
 * Structured job APIs rank by their own relevance and search engines return
 * whatever matched some keywords, but neither honours the specific promises
 * this app's form makes: that a company filter means that company, and that a
 * posting on screen is one you can still apply to. Enforcing those centrally
 * means a new provider inherits them rather than re-implementing them.
 */

/** Older than this and a posting is likely filled, whatever the index says. */
const MAX_AGE_DAYS = 120;

/**
 * Words that mean the same thing in a job title. A search for "UX Designer"
 * should match "User Experience Designer", since employers use both.
 */
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
};

function hasTerm(haystack: string, word: string): boolean {
  if (haystack.includes(word)) return true;
  return (SYNONYMS[word] ?? []).some((synonym) => haystack.includes(synonym));
}

/**
 * Does this title actually describe the role that was searched for?
 *
 * Every significant word must appear, allowing synonyms — matching on any one
 * word is what let "UX Writer" answer a search for "UX Designer", since they
 * share "UX". The head noun is the part that makes them different jobs.
 */
export function matchesDesignation(title: string, designation: string): boolean {
  const words = designation
    .toLowerCase()
    .split(/[^a-zà-ÿ0-9]+/)
    .filter((word) => word.length >= 2);

  if (words.length === 0) return true;

  const haystack = title.toLowerCase();
  return words.every((word) => hasTerm(haystack, word));
}

/** Loose company match — "Booking.com" should match "Booking.com (Amsterdam)". */
export function matchesCompany(job: JobPost, company: string): boolean {
  const wanted = slugifyCompany(company);
  if (!wanted) return true;

  const actual = slugifyCompany(job.companyName);
  if (!actual) return false;

  return actual.includes(wanted) || wanted.includes(actual);
}

export function isStale(job: JobPost, maxAgeDays = MAX_AGE_DAYS): boolean {
  if (!job.postedAt) return false;

  const posted = Date.parse(job.postedAt);
  if (Number.isNaN(posted)) return false;

  return Date.now() - posted > maxAgeDays * 24 * 60 * 60 * 1000;
}

export interface RefineOptions {
  /** Search engines need the title checked; structured APIs rank it already. */
  enforceDesignation?: boolean;
}

/**
 * Apply the form's promises to a provider's results.
 *
 * A company filter that does not filter, or a three-year-old posting, are both
 * worse than a shorter list — the user asked a specific question.
 */
export function refineResults(
  jobs: JobPost[],
  params: SearchParams,
  options: RefineOptions = {},
): JobPost[] {
  return jobs.filter((job) => {
    if (isStale(job)) return false;

    if (params.company && !matchesCompany(job, params.company)) return false;

    if (options.enforceDesignation && params.designation) {
      // Some employers title a posting "Designer II Job Opening" and only name
      // the discipline in the body. Checking the summary as a second pass
      // keeps those without loosening what counts as a match.
      const inTitle = matchesDesignation(job.title, params.designation);
      const inBody = matchesDesignation(`${job.title} ${job.summary}`, params.designation);
      if (!inTitle && !inBody) return false;
    }

    return true;
  });
}
