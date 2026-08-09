import type { JobPost, SearchParams, WorkType } from "@/types";
import { summarizeResponsibilities } from "@/lib/text";
import { ProviderError } from "@/lib/providers/errors";
import { findJobArray } from "@/lib/providers/jsearch-shape";
import { normalizeDomain } from "@/lib/utils";

const HOST = "jsearch.p.rapidapi.com";
const BASE = `https://${HOST}`;

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

/** Loose company match — "Acme" should match "Acme Corp" and "ACME, Inc.". */
function matchesCompany(job: JobPost, company: string): boolean {
  const needle = company.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!needle) return true;
  return job.companyName.toLowerCase().replace(/[^a-z0-9]/g, "").includes(needle);
}

/**
 * Search paths to try, newest first.
 *
 * JSearch has renamed its search endpoint at least once, and RapidAPI answers
 * a retired path with a 404 rather than anything you can plan around. So the
 * adapter probes: a 404 on one candidate falls through to the next, and the
 * one that answers is remembered for the life of the process. `JSEARCH_PATH`
 * overrides the list outright when a future rename outruns this default.
 */
const SEARCH_PATHS = ["/search-v2", "/search"];

function candidatePaths(): string[] {
  const override = process.env.JSEARCH_PATH?.trim();
  if (override) return [override.startsWith("/") ? override : `/${override}`];
  return SEARCH_PATHS;
}

/** Remembered across calls so the probe cost is paid once, not per search. */
let resolvedPath: string | null = null;

function buildUrl(path: string, params: SearchParams): URL {
  // JSearch takes a single free-text query with no employer filter, so the
  // company name is folded into the query and the results are filtered after.
  const query = [params.designation, params.company].filter(Boolean).join(" ").trim();

  const url = new URL(`${BASE}${path}`);
  url.searchParams.set("query", query);
  url.searchParams.set("country", params.country.toLowerCase());
  url.searchParams.set("page", String(params.page ?? 1));
  url.searchParams.set("num_pages", "1");
  url.searchParams.set("date_posted", "month");
  return url;
}

async function requestPath(
  path: string,
  params: SearchParams,
  apiKey: string,
  signal?: AbortSignal,
): Promise<Response> {
  return fetch(buildUrl(path, params), {
    headers: {
      "X-RapidAPI-Key": apiKey,
      "X-RapidAPI-Host": HOST,
    },
    signal,
    // Job boards move slowly enough that a short shared cache is a big win on
    // rate-limited RapidAPI plans.
    next: { revalidate: 300 },
  });
}

export async function searchJSearch(
  params: SearchParams,
  apiKey: string,
  signal?: AbortSignal,
): Promise<JobPost[]> {
  const paths = resolvedPath ? [resolvedPath, ...candidatePaths().filter((p) => p !== resolvedPath)] : candidatePaths();

  let response: Response | null = null;
  let usedPath = paths[0];

  for (const path of paths) {
    const attempt = await requestPath(path, params, apiKey, signal);

    // Only a 404 means "wrong path" — every other status is a real answer
    // about this request and must not be retried against another endpoint.
    if (attempt.status === 404 && paths.length > 1) continue;

    response = attempt;
    usedPath = path;
    break;
  }

  if (!response) {
    throw new ProviderError({
      provider: "JSearch",
      kind: "jobs",
      status: 404,
      body: `None of the known search endpoints exist on this API (tried ${paths.join(", ")}). Open the JSearch page on RapidAPI, copy the path from its code snippet, and set it as the JSEARCH_PATH environment variable.`,
      envVar: "RAPIDAPI_KEY",
    });
  }

  if (!response.ok) {
    throw new ProviderError({
      provider: "JSearch",
      kind: "jobs",
      status: response.status,
      body: await response.text().catch(() => ""),
      envVar: "RAPIDAPI_KEY",
      authHint:
        "that you are actually subscribed to JSearch on RapidAPI — a key on its own is not enough, you have to click Subscribe on the API's page",
    });
  }

  resolvedPath = usedPath;

  const payload = await response.json();
  const { jobs: raw, emptyResult } = findJobArray(payload);

  // An empty list is a real answer — no postings matched. Only a payload with
  // no job array anywhere means the format moved on us, and saying so beats
  // rendering "no postings matched" over a parsing failure.
  if (!raw) {
    if (emptyResult) return [];

    const topLevelKeys = payload && typeof payload === "object" ? Object.keys(payload).join(", ") : typeof payload;
    throw new ProviderError({
      provider: "JSearch",
      kind: "jobs",
      status: response.status,
      body: `No job list found in the ${usedPath} response (top-level keys: ${topLevelKeys}). Open /api/debug/jsearch on this app to see the structure.`,
      envVar: "RAPIDAPI_KEY",
    });
  }

  const jobs = (raw as JSearchJob[]).map(mapJSearchJob);
  return params.company ? jobs.filter((job) => matchesCompany(job, params.company!)) : jobs;
}
