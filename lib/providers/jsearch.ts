import type { JobPost, SearchParams, WorkType } from "@/types";
import { summarizeResponsibilities } from "@/lib/text";
import { normalizeDomain } from "@/lib/utils";

const ENDPOINT = "https://jsearch.p.rapidapi.com/search";
const HOST = "jsearch.p.rapidapi.com";

interface JSearchJob {
  job_id?: string;
  job_title?: string;
  employer_name?: string;
  employer_website?: string | null;
  employer_logo?: string | null;
  job_city?: string | null;
  job_state?: string | null;
  job_country?: string | null;
  job_is_remote?: boolean;
  job_employment_type?: string | null;
  job_min_salary?: number | null;
  job_max_salary?: number | null;
  job_salary_currency?: string | null;
  job_salary_period?: string | null;
  job_posted_at_datetime_utc?: string | null;
  job_apply_link?: string | null;
  job_description?: string | null;
  job_publisher?: string | null;
}

function toWorkType(job: JSearchJob): WorkType {
  if (job.job_is_remote) return "Remote";

  const haystack = `${job.job_employment_type ?? ""} ${job.job_description ?? ""}`.toLowerCase();
  if (/\bhybrid\b/.test(haystack)) return "Hybrid";
  if (job.job_city || job.job_state) return "On-site";
  return "Unknown";
}

export function mapJSearchJob(job: JSearchJob): JobPost {
  const description = job.job_description ?? null;

  return {
    id: `jsearch:${job.job_id ?? crypto.randomUUID()}`,
    title: job.job_title?.trim() || "Untitled role",
    companyName: job.employer_name?.trim() || "Unknown company",
    companyDomain: normalizeDomain(job.employer_website),
    companyLogoUrl: job.employer_logo ?? null,
    city: job.job_city ?? job.job_state ?? null,
    country: job.job_country ?? null,
    workType: toWorkType(job),
    salary:
      job.job_min_salary != null || job.job_max_salary != null
        ? {
            min: job.job_min_salary ?? null,
            max: job.job_max_salary ?? null,
            currency: job.job_salary_currency ?? null,
            period: job.job_salary_period ?? null,
          }
        : null,
    postedAt: job.job_posted_at_datetime_utc ?? null,
    applyUrl: job.job_apply_link ?? null,
    summary: summarizeResponsibilities(description),
    description,
    source: job.job_publisher ? `JSearch · ${job.job_publisher}` : "JSearch",
  };
}

export async function searchJSearch(
  params: SearchParams,
  apiKey: string,
  signal?: AbortSignal,
): Promise<JobPost[]> {
  const url = new URL(ENDPOINT);
  url.searchParams.set("query", params.designation);
  url.searchParams.set("country", params.country.toLowerCase());
  url.searchParams.set("page", String(params.page ?? 1));
  url.searchParams.set("num_pages", "1");
  url.searchParams.set("date_posted", "month");

  const response = await fetch(url, {
    headers: {
      "X-RapidAPI-Key": apiKey,
      "X-RapidAPI-Host": HOST,
    },
    signal,
    // Job boards move slowly enough that a short shared cache is a big win on
    // rate-limited RapidAPI plans.
    next: { revalidate: 300 },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`JSearch request failed (${response.status}): ${body.slice(0, 200)}`);
  }

  const payload = (await response.json()) as { data?: JSearchJob[] };
  return (payload.data ?? []).map(mapJSearchJob);
}
