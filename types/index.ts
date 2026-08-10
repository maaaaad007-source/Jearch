/**
 * Shared domain types.
 *
 * Every job source maps its own payload into `JobPost`, and every people
 * source into `Person`, so the UI never learns which vendor answered. The
 * deliberate omission is a "demo" flag: this app either has real data or says
 * it has none, because sample data that looks real cost more confusion than it
 * ever saved.
 */

export type WorkType = "Remote" | "Hybrid" | "On-site" | "Unknown";

export interface SalaryRange {
  min: number | null;
  max: number | null;
  currency: string | null;
  /** "YEAR" | "MONTH" | "HOUR" — whatever the source publishes. */
  period: string | null;
}

export interface JobPost {
  /** Stable id, namespaced by source (e.g. "adzuna:12345"). */
  id: string;
  title: string;
  companyName: string;
  companyDomain: string | null;
  city: string | null;
  region: string | null;
  workType: WorkType;
  salary: SalaryRange | null;
  /** ISO-8601 timestamp of when the posting went live, when known. */
  postedAt: string | null;
  applyUrl: string | null;
  /** ~2 sentence gist of the responsibilities. */
  summary: string;
  description: string | null;
  /** Human label for where this came from, e.g. "Adzuna". */
  source: string;
  /**
   * True when this came from the employer's own careers board rather than an
   * aggregator's copy of it. The primary record: fresher, fuller description,
   * and the version to keep when the same opening arrives twice.
   */
  directFromEmployer: boolean;
}

/**
 * How well a posting answers what was actually typed.
 *
 * Kept alongside the job rather than baked into the ordering because the UI
 * shows the two tiers under separate headings — the honest answer to "I want
 * more results" and "the results aren't exact" at the same time.
 */
export type MatchQuality = "exact" | "close";

export interface RankedJob {
  job: JobPost;
  quality: MatchQuality;
  /** 0-100. Only used for ordering; never shown. */
  score: number;
}

/**
 * A person worth contacting at the hiring company.
 *
 * `email` is deliberately nullable and separate from `emailIsPattern`: a
 * constructed address is a guess, and presenting a guess with the confidence of
 * a fact is how you end up mailing a stranger.
 */
export interface Person {
  id: string;
  name: string;
  title: string | null;
  linkedinUrl: string | null;
  email: string | null;
  /** True when the address was assembled from a naming convention, not found. */
  emailIsPattern: boolean;
  companyName: string | null;
  source: string;
}

export interface SearchParams {
  /** Optional only when `company` is set — one of the two is always required. */
  designation: string;
  /** ISO 3166-1 alpha-2 country code. */
  country: string;
  company?: string;
}

/** What a source could not do, in words meant for the person searching. */
export interface SourceReport {
  id: string;
  label: string;
  /** How many postings it contributed after de-duplication. */
  contributed: number;
  error: string | null;
}

export interface SearchResponse {
  exact: RankedJob[];
  close: RankedJob[];
  /** Title matches at other employers, when a company filter found nothing. */
  elsewhere: RankedJob[];
  /** Employers the search did turn up — names the company filter rejected. */
  employersFound: string[];
  /** Why postings were set aside, so an empty result can explain itself. */
  excluded: { company: number; stale: number; title: number };
  /** Every source consulted, whether or not it produced anything. */
  sources: SourceReport[];
  /** Total postings examined before ranking — the honest denominator. */
  examined: number;
  /** Set when the app cannot search at all, e.g. nothing is configured. */
  blocked: string | null;
}

export interface PeopleResponse {
  /** Keyed by the company name that was asked about. */
  peopleByCompany: Record<string, Person[]>;
  error: string | null;
}

export interface SavedOpportunity {
  id: string;
  job: JobPost;
  person: Person | null;
  savedAt: string;
  notes: string | null;
}
