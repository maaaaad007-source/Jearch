import type { JobPost, SearchParams, WorkType } from "@/types";
import { ProviderError } from "@/lib/providers/errors";
import { summarizeResponsibilities } from "@/lib/text";
import { normalizeDomain } from "@/lib/utils";

/**
 * JobTech Search — the Swedish Public Employment Service's job ad API.
 *
 * This is a real jobs database rather than a search engine, which is the
 * difference that matters: it answers "every UX Designer ad in Sweden" with
 * hundreds of structured records, where a Google query answers it with
 * directory pages. Employers advertising in Sweden post here, and it
 * aggregates the major Swedish boards, so coverage is close to complete for
 * the market.
 *
 * Free to use. A key is registered at apirequest.jobtechdev.se and sent as the
 * `api-key` header; the adapter works without one too, since the API has been
 * open in the past and may still answer unauthenticated requests.
 *
 * Sweden only — `supportsCountry` gates it so it is never asked about markets
 * it does not cover.
 */

const DEFAULT_ENDPOINT = "https://jobsearch.api.jobtechdev.se/search";

function endpoint(): string {
  return process.env.JOBTECH_ENDPOINT?.trim() || DEFAULT_ENDPOINT;
}

/** Records per page. The API allows up to 100. */
export const PAGE_SIZE = 50;

export function supportsCountry(code: string): boolean {
  return code.toUpperCase() === "SE";
}

interface JobTechHit {
  id?: string;
  headline?: string;
  employer?: { name?: string | null; workplace?: string | null; url?: string | null } | null;
  workplace_address?: {
    municipality?: string | null;
    region?: string | null;
    country?: string | null;
    city?: string | null;
  } | null;
  description?: { text?: string | null; text_formatted?: string | null } | null;
  application_details?: { url?: string | null; email?: string | null; reference?: string | null } | null;
  webpage_url?: string | null;
  publication_date?: string | null;
  application_deadline?: string | null;
  remote_work?: boolean | null;
  salary_description?: string | null;
  occupation?: { label?: string | null } | null;
}

function toWorkType(hit: JobTechHit): WorkType {
  if (hit.remote_work) return "Remote";

  const haystack = `${hit.headline ?? ""} ${hit.description?.text ?? ""}`.toLowerCase();
  if (/\bhybrid\b/.test(haystack)) return "Hybrid";
  if (/\b(distans|remote|helt på distans)\b/.test(haystack)) return "Remote";
  if (hit.workplace_address?.municipality) return "On-site";
  return "Unknown";
}

/**
 * The employer's domain, taken from wherever the ad reveals it.
 *
 * Swedish ads frequently carry an application email at the employer's own
 * domain, which is a fact rather than the pattern guess the search-based
 * providers have to fall back on.
 */
function employerDomain(hit: JobTechHit): string | null {
  const fromEmail = normalizeDomain(hit.application_details?.email);
  if (fromEmail) return fromEmail;

  const fromEmployerUrl = normalizeDomain(hit.employer?.url);
  if (fromEmployerUrl) return fromEmployerUrl;

  // An application URL on the employer's own site, but not on a board.
  const fromApplyUrl = normalizeDomain(hit.application_details?.url);
  return fromApplyUrl;
}

export function mapJobTechHit(hit: JobTechHit): JobPost | null {
  const title = hit.headline?.trim() || hit.occupation?.label?.trim();
  if (!title) return null;

  // An ad past its deadline cannot be applied to.
  if (hit.application_deadline) {
    const deadline = Date.parse(hit.application_deadline);
    if (!Number.isNaN(deadline) && deadline < Date.now()) return null;
  }

  const description = hit.description?.text ?? null;
  const address = hit.workplace_address;

  return {
    id: `jobtech:${hit.id ?? hit.webpage_url ?? title}`,
    title,
    companyName: hit.employer?.name?.trim() || hit.employer?.workplace?.trim() || "Unknown company",
    companyDomain: employerDomain(hit),
    companyLogoUrl: null,
    city: address?.municipality ?? address?.city ?? address?.region ?? null,
    country: address?.country ?? "Sweden",
    workType: toWorkType(hit),
    // JobTech carries a free-text salary description rather than a range, so
    // there is nothing structured to show.
    salary: null,
    postedAt: hit.publication_date ?? null,
    applyUrl: hit.webpage_url ?? hit.application_details?.url ?? null,
    summary: summarizeResponsibilities(description),
    description,
    source: "Platsbanken (JobTech)",
  };
}

/** Same tolerant lookup the other adapters use: find the records, wherever they are. */
function findHits(payload: unknown): JobTechHit[] | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;

  for (const key of ["hits", "results", "ads", "data"]) {
    const value = root[key];
    if (Array.isArray(value)) return value as JobTechHit[];
  }
  return null;
}

export async function searchJobTech(
  params: SearchParams,
  apiKey?: string,
  signal?: AbortSignal,
): Promise<JobPost[]> {
  const query = [params.designation, params.company].filter(Boolean).join(" ").trim();

  const url = new URL(endpoint());
  if (query) url.searchParams.set("q", query);
  url.searchParams.set("limit", String(PAGE_SIZE));
  url.searchParams.set("offset", String(((params.page ?? 1) - 1) * PAGE_SIZE));
  // Newest first is what a job seeker wants; relevance ordering buries fresh ads.
  url.searchParams.set("sort", "pubdate-desc");

  const headers: Record<string, string> = { accept: "application/json" };
  if (apiKey) headers["api-key"] = apiKey;

  const response = await fetch(url, { headers, signal, next: { revalidate: 300 } });

  if (!response.ok) {
    throw new ProviderError({
      provider: "Platsbanken (JobTech)",
      kind: "jobs",
      status: response.status,
      body: await response.text().catch(() => ""),
      envVar: "JOBTECH_API_KEY",
      authHint: "that a free key is registered at apirequest.jobtechdev.se and copied exactly",
    });
  }

  const payload = await response.json();
  const hits = findHits(payload);

  if (!hits) {
    const keys = payload && typeof payload === "object" ? Object.keys(payload).join(", ") : typeof payload;
    throw new ProviderError({
      provider: "Platsbanken (JobTech)",
      kind: "jobs",
      status: response.status,
      body: `No ad list found in the response (top-level keys: ${keys}). The API format may have changed.`,
      envVar: "JOBTECH_API_KEY",
    });
  }

  return hits.map(mapJobTechHit).filter((job): job is JobPost => job !== null);
}
