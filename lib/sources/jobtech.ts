import type { JobPost, SearchParams, WorkType } from "@/types";
import { config } from "@/lib/config";
import { summarizeResponsibilities } from "@/lib/text";
import { normalizeDomain } from "@/lib/utils";
import { describeHttpFailure, SourceError, type JobSource } from "@/lib/sources/types";

/**
 * Platsbanken — the Swedish Public Employment Service's job ad API.
 *
 * Open data, no credential, and near-complete coverage of the Swedish market
 * because employers are expected to advertise here. Sweden is consequently the
 * one country this app can search with nothing configured at all.
 */

const DEFAULT_ENDPOINT = "https://jobsearch.api.jobtechdev.se/search";
const PAGE_SIZE = 100;

interface JobTechHit {
  id?: string;
  headline?: string;
  employer?: { name?: string | null; workplace?: string | null; url?: string | null } | null;
  workplace_address?: {
    municipality?: string | null;
    region?: string | null;
    city?: string | null;
  } | null;
  description?: { text?: string | null } | null;
  application_details?: { url?: string | null; email?: string | null } | null;
  webpage_url?: string | null;
  publication_date?: string | null;
  application_deadline?: string | null;
  remote_work?: boolean | null;
  occupation?: { label?: string | null } | null;
}

function toWorkType(hit: JobTechHit): WorkType {
  if (hit.remote_work) return "Remote";

  const haystack = `${hit.headline ?? ""} ${hit.description?.text ?? ""}`.toLowerCase();
  if (/\bhybrid\b/.test(haystack)) return "Hybrid";
  if (/\b(distans|remote)\b/.test(haystack)) return "Remote";
  if (hit.workplace_address?.municipality) return "On-site";
  return "Unknown";
}

/**
 * The employer's real domain, when the ad reveals one.
 *
 * Swedish ads often carry an application address at the employer's own domain,
 * which beats any guess — and it is the difference between a verified contact
 * email and a constructed one.
 */
function employerDomain(hit: JobTechHit): string | null {
  return (
    normalizeDomain(hit.application_details?.email) ??
    normalizeDomain(hit.employer?.url) ??
    normalizeDomain(hit.application_details?.url)
  );
}

export function mapHit(hit: JobTechHit): JobPost | null {
  const title = hit.headline?.trim() || hit.occupation?.label?.trim();
  if (!title) return null;

  // An ad past its deadline cannot be applied to, so it is not a result.
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
    city: address?.municipality ?? address?.city ?? null,
    region: address?.region ?? null,
    workType: toWorkType(hit),
    // Platsbanken carries free-text pay, not a range, so there is nothing
    // structured to show and inventing one would be worse than an empty field.
    salary: null,
    postedAt: hit.publication_date ?? null,
    applyUrl: hit.webpage_url ?? hit.application_details?.url ?? null,
    summary: summarizeResponsibilities(description),
    description,
    source: "Platsbanken",
    directFromEmployer: false,
  };
}

function findHits(payload: unknown): JobTechHit[] | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;

  for (const key of ["hits", "results", "ads", "data"]) {
    const value = root[key];
    if (Array.isArray(value)) return value as JobTechHit[];
  }
  return null;
}

export const jobtech: JobSource = {
  id: "jobtech",
  label: "Platsbanken",
  maxPages: 2,
  queriedPerRole: true,

  supports(country) {
    return country.toUpperCase() === "SE";
  },

  ready() {
    return !config.jobtechDisabled;
  },

  async fetchPage(params: SearchParams, page: number, signal?: AbortSignal) {
    const query = [params.designation, params.company].filter(Boolean).join(" ").trim();

    const url = new URL(config.jobtechEndpoint || DEFAULT_ENDPOINT);
    if (query) url.searchParams.set("q", query);
    url.searchParams.set("limit", String(PAGE_SIZE));
    url.searchParams.set("offset", String((page - 1) * PAGE_SIZE));

    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal,
      next: { revalidate: 300 },
    });

    if (!response.ok) {
      throw describeHttpFailure("Platsbanken", response.status, await response.text().catch(() => ""));
    }

    const payload = await response.json();
    const hits = findHits(payload);

    if (!hits) {
      const keys = payload && typeof payload === "object" ? Object.keys(payload).join(", ") : typeof payload;
      throw new SourceError("Platsbanken", `Unrecognised response from Platsbanken (top-level keys: ${keys}).`);
    }

    return hits.map(mapHit).filter((job): job is JobPost => job !== null);
  },
};
