import type { JobPost, SearchParams } from "@/types";

/**
 * A job source is a paginated jobs database.
 *
 * Note what this interface does not allow: a source cannot decide relevance,
 * cannot filter, and cannot report "no results" for a reason of its own. It
 * fetches a page and maps it. Everything else is the orchestrator's job, so a
 * new source inherits the ranking, de-duplication and reporting rather than
 * reimplementing them — and so no source can quietly swallow a posting.
 */
export interface JobSource {
  id: string;
  /** Shown to the user, e.g. "Adzuna". */
  label: string;
  /** How many pages the orchestrator may request in parallel. */
  maxPages: number;
  /**
   * True for sources that can only answer about a named employer.
   *
   * An applicant-tracking board is published per company and cannot be
   * searched across employers, so it contributes to "UX Designer at Booking.com"
   * and sits out "UX Designer" — a real capability difference rather than a
   * failure, and one the orchestrator has to know about to report honestly.
   */
  requiresCompany?: boolean;
  /** Whether this source covers the country at all. */
  supports(country: string): boolean;
  /** Whether its credentials are present. */
  ready(): boolean;
  fetchPage(params: SearchParams, page: number, signal?: AbortSignal): Promise<JobPost[]>;
}

/** A source failed in a way the person searching should hear about. */
export class SourceError extends Error {
  readonly label: string;

  constructor(label: string, message: string) {
    super(message);
    this.name = "SourceError";
    this.label = label;
  }
}

export function describeHttpFailure(label: string, status: number, body: string): SourceError {
  const trimmed = body.trim().slice(0, 200);

  if (status === 401 || status === 403) {
    return new SourceError(
      label,
      `${label} rejected the credentials (HTTP ${status}). Check the API key is current and copied in full.`,
    );
  }

  if (status === 429) {
    return new SourceError(label, `${label} is rate limiting this key (HTTP 429). Wait a minute and search again.`);
  }

  return new SourceError(label, `${label} returned HTTP ${status}.${trimmed ? ` ${trimmed}` : ""}`);
}
