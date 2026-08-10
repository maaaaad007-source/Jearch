import type { JobPost, SearchParams, WorkType } from "@/types";
import { config } from "@/lib/config";
import { summarizeResponsibilities } from "@/lib/text";
import { describeHttpFailure, SourceError, type JobSource } from "@/lib/sources/types";

/**
 * Adzuna — an aggregated jobs database covering 19 countries.
 *
 * This is the primary source, and the reason the app stopped using a search
 * engine for jobs: asked for every UX Designer role in the Netherlands, a
 * database answers with the roles, while a search engine answers with whichever
 * pages ranked. The difference showed up as 2 results against LinkedIn's 98.
 */

const DEFAULT_BASE = "https://api.adzuna.com/v1/api/jobs";
const PAGE_SIZE = 50;

/** Adzuna's own lowercase country codes. */
const SUPPORTED = new Set([
  "at", "au", "be", "br", "ca", "ch", "de", "es", "fr", "gb",
  "in", "it", "mx", "nl", "nz", "pl", "sg", "us", "za",
]);

const CURRENCY_BY_COUNTRY: Record<string, string> = {
  gb: "GBP", us: "USD", ca: "CAD", au: "AUD", nz: "NZD", in: "INR",
  za: "ZAR", br: "BRL", mx: "MXN", pl: "PLN", ch: "CHF", sg: "SGD",
};

interface AdzunaResult {
  id?: string;
  title?: string;
  company?: { display_name?: string | null } | null;
  location?: { display_name?: string | null; area?: string[] | null } | null;
  description?: string | null;
  redirect_url?: string | null;
  created?: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
}

function toWorkType(result: AdzunaResult): WorkType {
  const haystack = `${result.title ?? ""} ${result.description ?? ""}`.toLowerCase();
  if (/\bhybrid\b/.test(haystack)) return "Hybrid";
  if (/\bremote\b|\bwork from home\b|\bthuiswerken\b/.test(haystack)) return "Remote";
  if (result.location?.display_name) return "On-site";
  return "Unknown";
}

export function mapResult(result: AdzunaResult, country: string): JobPost | null {
  const title = result.title?.replace(/<[^>]+>/g, "").trim();
  if (!title) return null;

  const area = result.location?.area ?? [];
  const description = result.description?.replace(/<[^>]+>/g, "") ?? null;

  return {
    id: `adzuna:${result.id ?? result.redirect_url ?? title}`,
    title,
    companyName: result.company?.display_name?.trim() || "Unknown company",
    // Adzuna does not publish the employer's website; people lookup works from
    // the name alone, so this stays null rather than being guessed at.
    companyDomain: null,
    // `area` runs country-first, so the last entry is the most specific place.
    city: area.length > 1 ? area[area.length - 1] : (result.location?.display_name ?? null),
    region: area.length > 2 ? area[1] : null,
    workType: toWorkType(result),
    salary:
      result.salary_min != null || result.salary_max != null
        ? {
            min: result.salary_min ?? null,
            max: result.salary_max ?? null,
            currency: CURRENCY_BY_COUNTRY[country] ?? "EUR",
            period: "YEAR",
          }
        : null,
    postedAt: result.created ?? null,
    applyUrl: result.redirect_url ?? null,
    summary: summarizeResponsibilities(description),
    description,
    source: "Adzuna",
  };
}

async function request(params: SearchParams, page: number, useCompanyFilter: boolean, signal?: AbortSignal) {
  const country = params.country.toLowerCase();
  const base = config.adzunaEndpoint?.replace(/\/$/, "") || DEFAULT_BASE;

  const url = new URL(`${base}/${country}/search/${page}`);
  url.searchParams.set("app_id", config.adzunaAppId!);
  url.searchParams.set("app_key", config.adzunaAppKey!);
  url.searchParams.set("results_per_page", String(PAGE_SIZE));
  url.searchParams.set("content-type", "application/json");
  url.searchParams.set("max_days_old", "90");

  if (params.designation) url.searchParams.set("what", params.designation);
  if (useCompanyFilter && params.company) url.searchParams.set("company", params.company);

  const response = await fetch(url, { signal, next: { revalidate: 300 } });

  if (!response.ok) {
    throw describeHttpFailure("Adzuna", response.status, await response.text().catch(() => ""));
  }

  const payload = (await response.json()) as { results?: AdzunaResult[] };
  if (!Array.isArray(payload.results)) {
    const keys = payload && typeof payload === "object" ? Object.keys(payload).join(", ") : typeof payload;
    throw new SourceError("Adzuna", `Adzuna returned an unrecognised response (top-level keys: ${keys}).`);
  }

  return payload.results
    .map((result) => mapResult(result, country))
    .filter((job): job is JobPost => job !== null);
}

export const adzuna: JobSource = {
  id: "adzuna",
  label: "Adzuna",
  // Three pages of fifty is 150 postings per search, which is the fix for
  // "it only shows one or two" — one page was never going to be enough.
  maxPages: 3,

  supports(country) {
    return SUPPORTED.has(country.toLowerCase());
  },

  ready() {
    return Boolean(config.adzunaAppId && config.adzunaAppKey);
  },

  async fetchPage(params, page, signal) {
    // Adzuna's company filter matches its own canonical employer name, so a
    // name the user recognises ("Booking.com") can miss the catalogue's
    // spelling and return nothing. Ask precisely first, then broadly and let
    // the shared company matching decide — it filters either way.
    const precise = await request(params, page, Boolean(params.company), signal);
    if (precise.length > 0 || !params.company) return precise;

    return request(params, page, false, signal);
  },
};
