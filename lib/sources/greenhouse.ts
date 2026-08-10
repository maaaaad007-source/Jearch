import type { JobPost } from "@/types";
import { config } from "@/lib/config";
import { stripHtml, summarizeResponsibilities } from "@/lib/text";
import { firstBoardThatAnswers, inCountry, splitLocation, workTypeFrom } from "@/lib/sources/ats";
import type { JobSource } from "@/lib/sources/types";

/**
 * Greenhouse job boards — https://boards-api.greenhouse.io
 *
 * Free, unauthenticated, and the employer's own listing rather than an
 * aggregator's copy of it, so it is fresher and carries the full description.
 * Addressed per company, which is why it only joins a search that names one.
 */

const DEFAULT_BASE = "https://boards-api.greenhouse.io/v1/boards";

interface GreenhouseJob {
  id?: number | string;
  title?: string;
  absolute_url?: string;
  updated_at?: string;
  first_published?: string;
  location?: { name?: string | null } | null;
  content?: string | null;
}

export function mapJob(job: GreenhouseJob, company: string): JobPost | null {
  const title = job.title?.trim();
  if (!title) return null;

  const location = job.location?.name?.trim() ?? null;
  // Greenhouse returns the description as HTML-escaped HTML, so it needs
  // unescaping before the tags can be stripped.
  const description = job.content ? stripHtml(unescapeHtml(job.content)) : null;

  const { city, region } = splitLocation(location);

  return {
    id: `greenhouse:${job.id ?? job.absolute_url ?? title}`,
    title,
    companyName: company,
    companyDomain: null,
    city,
    region,
    workType: workTypeFrom(location, description ?? ""),
    salary: null,
    postedAt: job.first_published ?? job.updated_at ?? null,
    applyUrl: job.absolute_url ?? null,
    summary: summarizeResponsibilities(description),
    description,
    source: "Greenhouse",
    directFromEmployer: true,
  };
}

function unescapeHtml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

export const greenhouse: JobSource = {
  id: "greenhouse",
  label: "Greenhouse",
  maxPages: 1,
  requiresCompany: true,

  // A company's own board is wherever the company hires, so there is no
  // country it cannot answer for.
  supports() {
    return true;
  },

  ready() {
    return true;
  },

  async fetchPage(params, _page, signal) {
    const base = config.greenhouseEndpoint?.replace(/\/$/, "") || DEFAULT_BASE;

    const found = await firstBoardThatAnswers<{ jobs?: GreenhouseJob[] }>(
      params,
      (token) => `${base}/${token}/jobs?content=true`,
      (payload) => payload.jobs ?? [],
      signal,
    );

    if (!found) return [];

    return (found.records as GreenhouseJob[])
      .map((job) => mapJob(job, params.company!))
      .filter((job): job is JobPost => job !== null)
      .filter((job) => inCountry([job.city, job.region].filter(Boolean).join(", ") || null, params.country));
  },
};
