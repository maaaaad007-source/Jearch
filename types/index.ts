/**
 * Shared domain types for the Direct-Contact Job Finder.
 *
 * These shapes are what the UI consumes. Every provider adapter in
 * `lib/providers` is responsible for mapping its own vendor payload into them,
 * so swapping JSearch for TheirStack (or Apollo for Hunter) never touches a
 * component.
 */

export type WorkType = "Remote" | "Hybrid" | "On-site" | "Unknown";

export type VerificationStatus = "verified" | "guess" | "unverified";

export interface SalaryRange {
  min: number | null;
  max: number | null;
  currency: string | null;
  /** e.g. "YEAR" | "MONTH" | "HOUR" — provider dependent. */
  period: string | null;
}

export interface JobPost {
  /** Stable id, namespaced by provider (e.g. "jsearch:abc123"). */
  id: string;
  title: string;
  companyName: string;
  companyDomain: string | null;
  companyLogoUrl: string | null;
  city: string | null;
  country: string | null;
  workType: WorkType;
  salary: SalaryRange | null;
  /** ISO-8601 timestamp of when the post went live, when the provider knows. */
  postedAt: string | null;
  applyUrl: string | null;
  /** Short (~2 sentence) summary of the key responsibilities. */
  summary: string;
  /** Full description, kept for the expandable panel. */
  description: string | null;
  source: string;
}

export interface ContactPerson {
  id: string;
  name: string;
  title: string | null;
  linkedinUrl: string | null;
  email: string | null;
  emailStatus: VerificationStatus;
  phone: string | null;
  /** Extension digits, when the provider splits them out. */
  phoneExtension: string | null;
  companyName: string | null;
  companyDomain: string | null;
  /** 0-100 provider confidence in the email match, when available. */
  confidence: number | null;
  source: string;
}

/** A job post merged with the best decision maker we could find for it. */
export interface JobWithContact {
  job: JobPost;
  contact: ContactPerson | null;
  /** Additional decision makers at the same company, best-first. */
  alternateContacts: ContactPerson[];
  /** Set when enrichment was attempted but produced nothing usable. */
  contactError: string | null;
}

export interface SearchParams {
  /** Optional only when `company` is set — one of the two is always required. */
  designation: string;
  /** ISO 3166-1 alpha-2 country code. */
  country: string;
  /** Narrow results to a single employer. */
  company?: string;
  page?: number;
}

export interface JobsApiResponse {
  jobs: JobPost[];
  provider: string;
  /** True when results are locally generated because no API key is configured. */
  demo: boolean;
  page: number;
  /** Whether requesting the next page is worth doing. */
  hasMore: boolean;
  /** Set when results came from a fallback source, or every source was empty. */
  notice: string | null;
}

export interface ContactsApiResponse {
  /** Keyed by company domain. */
  contactsByDomain: Record<string, ContactPerson[]>;
  provider: string;
  demo: boolean;
  /** Set when every lookup failed — usually a bad or exhausted API key. */
  error: string | null;
}

export interface SavedOpportunity {
  id: string;
  job: JobPost;
  contact: ContactPerson | null;
  savedAt: string;
  notes: string | null;
}
