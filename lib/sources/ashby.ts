import type { JobPost } from "@/types";
import { config } from "@/lib/config";
import { stripHtml, summarizeResponsibilities } from "@/lib/text";
import { firstBoardThatAnswers, inCountry, splitLocation, workTypeFrom } from "@/lib/sources/ats";
import type { JobSource } from "@/lib/sources/types";

/**
 * Ashby job boards — https://api.ashbyhq.com/posting-api/job-board/{company}
 *
 * The newest of the three and common at startups, so it covers employers the
 * older boards do not. Free and unauthenticated. The mapper is deliberately
 * tolerant about which description and date fields are present, since Ashby
 * returns different subsets depending on how the board is configured.
 */

const DEFAULT_BASE = "https://api.ashbyhq.com/posting-api/job-board";

interface AshbyJob {
  id?: string;
  title?: string;
  location?: string | null;
  isRemote?: boolean | null;
  publishedAt?: string | null;
  updatedAt?: string | null;
  jobUrl?: string | null;
  applyUrl?: string | null;
  descriptionPlain?: string | null;
  descriptionHtml?: string | null;
  isListed?: boolean | null;
}

export function mapJob(job: AshbyJob, company: string): JobPost | null {
  const title = job.title?.trim();
  if (!title) return null;

  // Ashby keeps unlisted roles in the payload; they are not open applications.
  if (job.isListed === false) return null;

  const location = job.location?.trim() ?? null;
  const description = job.descriptionPlain ?? (job.descriptionHtml ? stripHtml(job.descriptionHtml) : null);
  const { city, region } = splitLocation(location);

  return {
    id: `ashby:${job.id ?? job.jobUrl ?? title}`,
    title,
    companyName: company,
    companyDomain: null,
    city,
    region,
    workType: job.isRemote ? "Remote" : workTypeFrom(location, description ?? ""),
    salary: null,
    postedAt: job.publishedAt ?? job.updatedAt ?? null,
    applyUrl: job.jobUrl ?? job.applyUrl ?? null,
    summary: summarizeResponsibilities(description),
    description,
    source: "Ashby",
    directFromEmployer: true,
  };
}

export const ashby: JobSource = {
  id: "ashby",
  label: "Ashby",
  maxPages: 1,
  requiresCompany: true,

  supports() {
    return true;
  },

  ready() {
    return true;
  },

  async fetchPage(params, _page, signal) {
    const base = config.ashbyEndpoint?.replace(/\/$/, "") || DEFAULT_BASE;

    const found = await firstBoardThatAnswers<{ jobs?: AshbyJob[] }>(
      params,
      (token) => `${base}/${token}?includeCompensation=true`,
      (payload) => payload.jobs ?? [],
      signal,
    );

    if (!found) return [];

    return (found.records as AshbyJob[])
      .map((job) => mapJob(job, params.company!))
      .filter((job): job is JobPost => job !== null)
      .filter((job) => inCountry([job.city, job.region].filter(Boolean).join(", ") || null, params.country));
  },
};
