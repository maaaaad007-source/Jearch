import type { JobPost, SearchParams, WorkType } from "@/types";
import { ProviderError } from "@/lib/providers/errors";
import { summarizeResponsibilities } from "@/lib/text";

/**
 * Adzuna — an aggregated job database covering most of Europe and the
 * Anglosphere.
 *
 * Same reasoning as JobTech: a jobs database answers "every UX Designer job in
 * the Netherlands" with the jobs, where a search engine answers with whatever
 * pages ranked. Adzuna is the general-purpose equivalent for the markets no
 * national board here covers, and its free tier is generous enough for
 * personal use.
 *
 * Credentials are an app id and key from developer.adzuna.com.
 */

const DEFAULT_BASE = "https://api.adzuna.com/v1/api/jobs";

function base(): string {
  return process.env.ADZUNA_ENDPOINT?.trim().replace(/\/$/, "") || DEFAULT_BASE;
}

export const PAGE_SIZE = 50;

/** The countries Adzuna publishes, as its own lowercase codes. */
const SUPPORTED = new Set([
  "at", "au", "be", "br", "ca", "ch", "de", "es", "fr", "gb",
  "in", "it", "mx", "nl", "nz", "pl", "sg", "us", "za",
]);

export function supportsCountry(code: string): boolean {
  return SUPPORTED.has(code.toLowerCase());
}

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
  salary_is_predicted?: string | null;
  contract_time?: string | null;
}

const CURRENCY_BY_COUNTRY: Record<string, string> = {
  gb: "GBP", us: "USD", ca: "CAD", au: "AUD", nz: "NZD", in: "INR",
  za: "ZAR", br: "BRL", mx: "MXN", pl: "PLN", ch: "CHF", sg: "SGD",
};

function toWorkType(result: AdzunaResult): WorkType {
  const haystack = `${result.title ?? ""} ${result.description ?? ""}`.toLowerCase();
  if (/\bhybrid\b/.test(haystack)) return "Hybrid";
  if (/\bremote\b|\bwork from home\b|\bthuiswerken\b/.test(haystack)) return "Remote";
  if (result.location?.display_name) return "On-site";
  return "Unknown";
}

export function mapAdzunaResult(result: AdzunaResult, countryCode: string): JobPost | null {
  const title = result.title?.replace(/<[^>]+>/g, "").trim();
  if (!title) return null;

  const area = result.location?.area ?? [];
  const description = result.description?.replace(/<[^>]+>/g, "") ?? null;

  return {
    id: `adzuna:${result.id ?? result.redirect_url ?? title}`,
    title,
    companyName: result.company?.display_name?.trim() || "Unknown company",
    // Adzuna does not publish the employer's website.
    companyDomain: null,
    companyLogoUrl: null,
    // `area` runs country-first; the last entry is the most specific place.
    city: area.length > 1 ? area[area.length - 1] : (result.location?.display_name ?? null),
    country: area[0] ?? null,
    workType: toWorkType(result),
    salary:
      result.salary_min != null || result.salary_max != null
        ? {
            min: result.salary_min ?? null,
            max: result.salary_max ?? null,
            currency: CURRENCY_BY_COUNTRY[countryCode.toLowerCase()] ?? "EUR",
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

export async function searchAdzuna(
  params: SearchParams,
  appId: string,
  appKey: string,
  signal?: AbortSignal,
): Promise<JobPost[]> {
  const country = params.country.toLowerCase();
  const page = Math.max(1, params.page ?? 1);

  const url = new URL(`${base()}/${country}/search/${page}`);
  url.searchParams.set("app_id", appId);
  url.searchParams.set("app_key", appKey);
  url.searchParams.set("results_per_page", String(PAGE_SIZE));
  url.searchParams.set("content-type", "application/json");
  url.searchParams.set("max_days_old", "60");

  if (params.designation) url.searchParams.set("what", params.designation);
  // Adzuna has a real employer filter, so the company narrows the query itself
  // rather than only being filtered out of the results afterwards.
  if (params.company) url.searchParams.set("company", params.company);

  const response = await fetch(url, { signal, next: { revalidate: 300 } });

  if (!response.ok) {
    throw new ProviderError({
      provider: "Adzuna",
      kind: "jobs",
      status: response.status,
      body: await response.text().catch(() => ""),
      envVar: "ADZUNA_APP_ID / ADZUNA_APP_KEY",
      authHint: "that both the app id and the app key are copied from developer.adzuna.com",
    });
  }

  const payload = (await response.json()) as { results?: AdzunaResult[] };
  if (!Array.isArray(payload.results)) {
    const keys = payload && typeof payload === "object" ? Object.keys(payload).join(", ") : typeof payload;
    throw new ProviderError({
      provider: "Adzuna",
      kind: "jobs",
      status: response.status,
      body: `No results array in the response (top-level keys: ${keys}).`,
      envVar: "ADZUNA_APP_ID",
    });
  }

  return payload.results
    .map((result) => mapAdzunaResult(result, country))
    .filter((job): job is JobPost => job !== null);
}
