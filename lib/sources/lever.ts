import type { JobPost } from "@/types";
import { config } from "@/lib/config";
import { summarizeResponsibilities } from "@/lib/text";
import { firstBoardThatAnswers, inCountry, splitLocation, workTypeFrom } from "@/lib/sources/ats";
import type { JobSource } from "@/lib/sources/types";

/**
 * Lever postings — https://api.lever.co/v0/postings/{company}
 *
 * Free and unauthenticated, like Greenhouse, and returns the whole board in
 * one response. Lever publishes a plain-text description alongside the HTML
 * one, which saves stripping tags.
 */

const DEFAULT_BASE = "https://api.lever.co/v0/postings";

interface LeverPosting {
  id?: string;
  text?: string;
  hostedUrl?: string;
  applyUrl?: string;
  createdAt?: number;
  categories?: {
    location?: string | null;
    team?: string | null;
    commitment?: string | null;
  } | null;
  descriptionPlain?: string | null;
  description?: string | null;
  workplaceType?: string | null;
}

export function mapPosting(posting: LeverPosting, company: string): JobPost | null {
  const title = posting.text?.trim();
  if (!title) return null;

  const location = posting.categories?.location?.trim() ?? null;
  const description = posting.descriptionPlain ?? posting.description ?? null;
  const { city, region } = splitLocation(location);

  // Lever states the workplace type outright when the employer set one, which
  // beats inferring it from prose.
  const stated = posting.workplaceType?.toLowerCase();
  const workType =
    stated === "remote" ? "Remote" : stated === "hybrid" ? "Hybrid" : workTypeFrom(location, description ?? "");

  return {
    id: `lever:${posting.id ?? posting.hostedUrl ?? title}`,
    title,
    companyName: company,
    companyDomain: null,
    city,
    region,
    workType,
    salary: null,
    postedAt: posting.createdAt ? new Date(posting.createdAt).toISOString() : null,
    applyUrl: posting.hostedUrl ?? posting.applyUrl ?? null,
    summary: summarizeResponsibilities(description),
    description,
    source: "Lever",
    directFromEmployer: true,
  };
}

export const lever: JobSource = {
  id: "lever",
  label: "Lever",
  maxPages: 1,
  requiresCompany: true,

  supports() {
    return true;
  },

  ready() {
    return true;
  },

  async fetchPage(params, _page, signal) {
    const base = config.leverEndpoint?.replace(/\/$/, "") || DEFAULT_BASE;

    const found = await firstBoardThatAnswers<LeverPosting[]>(
      params,
      (token) => `${base}/${token}?mode=json`,
      // Lever answers with a bare array rather than an envelope.
      (payload) => (Array.isArray(payload) ? payload : []),
      signal,
    );

    if (!found) return [];

    return (found.records as LeverPosting[])
      .map((posting) => mapPosting(posting, params.company!))
      .filter((job): job is JobPost => job !== null)
      .filter((job) => inCountry([job.city, job.region].filter(Boolean).join(", ") || null, params.country));
  },
};
