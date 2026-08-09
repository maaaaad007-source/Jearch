import type { JobPost, SearchParams, WorkType } from "@/types";
import { summarizeResponsibilities } from "@/lib/text";
import { normalizeDomain } from "@/lib/utils";

const ENDPOINT = "https://api.theirstack.com/v1/jobs/search";

export const PAGE_SIZE = 25;

interface TheirStackJob {
  id?: number | string;
  job_title?: string;
  company?: string;
  company_object?: {
    name?: string;
    domain?: string | null;
    url?: string | null;
    logo?: string | null;
  } | null;
  location?: string | null;
  country_code?: string | null;
  remote?: boolean | null;
  hybrid?: boolean | null;
  min_annual_salary?: number | null;
  max_annual_salary?: number | null;
  salary_currency?: string | null;
  date_posted?: string | null;
  url?: string | null;
  final_url?: string | null;
  description?: string | null;
}

function toWorkType(job: TheirStackJob): WorkType {
  if (job.hybrid) return "Hybrid";
  if (job.remote) return "Remote";
  if (job.location) return "On-site";
  return "Unknown";
}

function splitLocation(location: string | null | undefined): { city: string | null; country: string | null } {
  if (!location) return { city: null, country: null };
  const parts = location.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return { city: null, country: null };
  if (parts.length === 1) return { city: parts[0], country: null };
  return { city: parts[0], country: parts[parts.length - 1] };
}

export function mapTheirStackJob(job: TheirStackJob): JobPost {
  const description = job.description ?? null;
  const { city, country } = splitLocation(job.location);

  return {
    id: `theirstack:${job.id ?? crypto.randomUUID()}`,
    title: job.job_title?.trim() || "Untitled role",
    companyName: job.company_object?.name?.trim() || job.company?.trim() || "Unknown company",
    companyDomain: normalizeDomain(job.company_object?.domain ?? job.company_object?.url),
    companyLogoUrl: job.company_object?.logo ?? null,
    city,
    country: country ?? job.country_code ?? null,
    workType: toWorkType(job),
    salary:
      job.min_annual_salary != null || job.max_annual_salary != null
        ? {
            min: job.min_annual_salary ?? null,
            max: job.max_annual_salary ?? null,
            currency: job.salary_currency ?? "USD",
            period: "YEAR",
          }
        : null,
    postedAt: job.date_posted ?? null,
    applyUrl: job.final_url ?? job.url ?? null,
    summary: summarizeResponsibilities(description),
    description,
    source: "TheirStack",
  };
}

export async function searchTheirStack(
  params: SearchParams,
  apiKey: string,
  signal?: AbortSignal,
): Promise<JobPost[]> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      page: Math.max(0, (params.page ?? 1) - 1),
      limit: PAGE_SIZE,
      // TheirStack rejects empty filter arrays, so each one is only sent when
      // the user actually supplied that field.
      ...(params.designation ? { job_title_or: [params.designation] } : {}),
      ...(params.company ? { company_name_partial_match_or: [params.company] } : {}),
      job_country_code_or: [params.country.toUpperCase()],
      posted_at_max_age_days: 30,
      blur_company_data: false,
      include_total_results: false,
    }),
    signal,
    next: { revalidate: 300 },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`TheirStack request failed (${response.status}): ${body.slice(0, 200)}`);
  }

  const payload = (await response.json()) as { data?: TheirStackJob[] };
  return (payload.data ?? []).map(mapTheirStackJob);
}
