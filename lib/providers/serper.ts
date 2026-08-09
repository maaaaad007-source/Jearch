import type { ContactPerson, JobPost, SearchParams, WorkType } from "@/types";
import { countryName } from "@/lib/countries";
import { ProviderError } from "@/lib/providers/errors";
import { DECISION_MAKER_TITLES } from "@/lib/providers/constants";
import { truncate } from "@/lib/text";

/**
 * Serper — a Google Search API — used for both halves of the pipeline.
 *
 * Serper has no jobs endpoint, but Google indexes LinkedIn's job pages, whose
 * titles follow a fixed shape ("Acme hiring Senior UX Designer in Amsterdam |
 * LinkedIn"). A `site:` query plus that parse gives real LinkedIn listings at
 * one credit per search, which is far cheaper than the enrichment vendors.
 *
 * The same trick finds decision makers: LinkedIn profile titles are "Name -
 * Title - Company | LinkedIn". That yields name, role and profile URL — but
 * never a verified email, because a search engine cannot verify one. Emails
 * from this provider are pattern guesses, and only when the company domain is
 * known from the job posting. They are labelled as guesses in the UI.
 */

const DEFAULT_ENDPOINT = "https://google.serper.dev/search";

/** Overridable so the pipeline can be exercised end to end against a stub. */
function endpoint(): string {
  return process.env.SERPER_ENDPOINT?.trim() || DEFAULT_ENDPOINT;
}

interface SerperOrganicResult {
  title?: string;
  link?: string;
  snippet?: string;
  date?: string;
  position?: number;
}

interface SerperResponse {
  organic?: SerperOrganicResult[];
  credits?: number;
}

async function serperSearch(
  query: string,
  apiKey: string,
  options: { country?: string; page?: number; num?: number; recentOnly?: boolean },
  signal?: AbortSignal,
): Promise<SerperOrganicResult[]> {
  const body: Record<string, unknown> = {
    q: query,
    num: options.num ?? 20,
  };

  if (options.country) body.gl = options.country.toLowerCase();
  if (options.page && options.page > 1) body.page = options.page;
  // qdr:m — Google's "past month" filter, so stale postings stay out.
  if (options.recentOnly) body.tbs = "qdr:m";

  const response = await fetch(endpoint(), {
    method: "POST",
    headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
    next: { revalidate: 300 },
  });

  if (!response.ok) {
    throw new ProviderError({
      provider: "Serper",
      kind: query.includes("linkedin.com/in") ? "contacts" : "jobs",
      status: response.status,
      body: await response.text().catch(() => ""),
      envVar: "SERPER_API_KEY",
      authHint: "that the key is copied from the dashboard at serper.dev and has credits remaining",
    });
  }

  const payload = (await response.json()) as SerperResponse;
  return payload.organic ?? [];
}

// --- Job listings -----------------------------------------------------------

/** Strips the trailing site name Google appends to LinkedIn page titles. */
function stripLinkedInSuffix(title: string): string {
  return title.replace(/\s*[|\-–—]\s*LinkedIn\s*$/i, "").trim();
}

interface ParsedListing {
  title: string;
  companyName: string | null;
  location: string | null;
}

/**
 * LinkedIn job pages title as "<Company> hiring <Role> in <Location>", which is
 * the shape worth parsing precisely. Anything else falls back to treating the
 * whole string as the role, so an unparsed listing still appears rather than
 * being dropped.
 */
export function parseLinkedInJobTitle(rawTitle: string): ParsedListing {
  const cleaned = stripLinkedInSuffix(rawTitle);

  const hiring = cleaned.match(/^(?<company>.+?)\s+hiring\s+(?<role>.+?)(?:\s+in\s+(?<location>.+))?$/i);
  if (hiring?.groups) {
    return {
      title: hiring.groups.role.trim(),
      companyName: hiring.groups.company.trim(),
      location: hiring.groups.location?.trim() ?? null,
    };
  }

  // "Senior UX Designer - Acme Corp" / "Senior UX Designer at Acme Corp"
  const dashed = cleaned.match(/^(?<role>.+?)\s+(?:[-–—]|at)\s+(?<company>[^-–—]+)$/i);
  if (dashed?.groups) {
    return {
      title: dashed.groups.role.trim(),
      companyName: dashed.groups.company.trim(),
      location: null,
    };
  }

  return { title: cleaned, companyName: null, location: null };
}

function splitLocation(location: string | null): { city: string | null; country: string | null } {
  if (!location) return { city: null, country: null };
  const parts = location.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return { city: null, country: null };
  if (parts.length === 1) return { city: parts[0], country: null };
  return { city: parts[0], country: parts[parts.length - 1] };
}

function inferWorkType(text: string): WorkType {
  const haystack = text.toLowerCase();
  if (/\bhybrid\b/.test(haystack)) return "Hybrid";
  if (/\bremote\b/.test(haystack)) return "Remote";
  if (/\bon-?site\b|\bin[- ]office\b/.test(haystack)) return "On-site";
  return "Unknown";
}

/**
 * LinkedIn job URLs carry the posting id either bare (/jobs/view/4012345678)
 * or after a slug (/jobs/view/senior-ux-designer-at-acme-4012345678). The id is
 * what makes the posting identifiable — falling back to the full URL would
 * treat the same job as distinct whenever Google varies the tracking params.
 */
function linkedInJobId(link: string): string | null {
  return link.match(/\/jobs\/view\/(?:[^/?#]*?-)?(\d{6,})/)?.[1] ?? null;
}

/**
 * Google shows relative ages ("3 days ago") rather than timestamps, so the
 * posting date is reconstructed from that when present.
 */
export function parseRelativeDate(value: string | undefined, now = Date.now()): string | null {
  if (!value) return null;

  const match = value.match(/(\d+)\s*(minute|hour|day|week|month|year)s?\s*ago/i);
  if (!match) {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
  }

  const amount = Number(match[1]);
  const unitMs: Record<string, number> = {
    minute: 60_000,
    hour: 3_600_000,
    day: 86_400_000,
    week: 604_800_000,
    month: 2_592_000_000,
    year: 31_536_000_000,
  };

  return new Date(now - amount * unitMs[match[2].toLowerCase()]).toISOString();
}

export function mapSerperJob(result: SerperOrganicResult, fallbackCountry: string): JobPost | null {
  const link = result.link ?? "";
  if (!/linkedin\.com\/jobs\/view\//i.test(link)) return null;

  const parsed = parseLinkedInJobTitle(result.title ?? "");
  if (!parsed.title) return null;

  const { city, country } = splitLocation(parsed.location);
  const snippet = result.snippet ?? "";

  // Strip tracking params so the same posting is one job, not several.
  const cleanLink = link.split("?")[0];

  return {
    id: `serper:${linkedInJobId(link) ?? cleanLink}`,
    title: parsed.title,
    companyName: parsed.companyName ?? "Unknown company",
    // A Google result exposes no company website; contact lookup falls back to
    // searching by company name, which is what Serper enrichment wants anyway.
    companyDomain: null,
    companyLogoUrl: null,
    city,
    country: country ?? fallbackCountry,
    workType: inferWorkType(`${parsed.title} ${snippet}`),
    salary: null,
    postedAt: parseRelativeDate(result.date),
    applyUrl: cleanLink,
    summary: snippet ? truncate(snippet, 320) : "No description available in the search result.",
    description: snippet || null,
    source: "LinkedIn via Serper",
  };
}

export async function searchSerperJobs(
  params: SearchParams,
  apiKey: string,
  signal?: AbortSignal,
): Promise<JobPost[]> {
  const terms = ["site:linkedin.com/jobs/view"];
  if (params.designation) terms.push(`"${params.designation}"`);
  if (params.company) terms.push(`"${params.company}"`);
  terms.push(countryName(params.country));

  const results = await serperSearch(
    terms.join(" "),
    apiKey,
    { country: params.country, page: params.page, num: 20, recentOnly: true },
    signal,
  );

  const jobs = results
    .map((result) => mapSerperJob(result, countryName(params.country)))
    .filter((job): job is JobPost => job !== null);

  // Google can return the same posting under several URLs; the LinkedIn id is
  // the stable identity.
  const seen = new Set<string>();
  return jobs.filter((job) => (seen.has(job.id) ? false : (seen.add(job.id), true)));
}

// --- Decision makers --------------------------------------------------------

interface ParsedProfile {
  name: string;
  title: string | null;
  companyName: string | null;
}

/**
 * LinkedIn profile results title as "Name - Role - Company". Both hyphens and
 * en/em dashes appear, and the company segment is often missing.
 */
export function parseLinkedInProfileTitle(rawTitle: string): ParsedProfile | null {
  const cleaned = stripLinkedInSuffix(rawTitle);
  if (!cleaned) return null;

  const parts = cleaned.split(/\s+[-–—]\s+/).map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return null;

  const name = parts[0];
  // Guard against LinkedIn pages that are not profiles ("Jobs at Acme",
  // "Careers | Acme"): a headline name is short, has letters, and does not read
  // like a phrase.
  if (!/[a-z]/i.test(name) || name.length > 60) return null;
  if (/\b(at|for|in)\b/i.test(name)) return null;
  if (/^(jobs|careers|people|search|profiles|top \d+)\b/i.test(name)) return null;
  if (name.split(/\s+/).length > 4) return null;

  return {
    name,
    title: parts[1] ?? null,
    companyName: parts[2] ?? null,
  };
}

/** Pattern guess, only ever offered when the employer's domain is known. */
function guessEmail(name: string, domain: string | null): string | null {
  if (!domain) return null;

  const parts = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z\s]/g, "")
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length < 2) return null;

  // Dutch/German/Romance surname particles belong to the surname; anything else
  // before the final token is a middle name and is dropped.
  const PARTICLES = new Set(["de", "van", "von", "der", "den", "la", "le", "du", "di", "da", "dos", "del", "bin"]);
  const surname = PARTICLES.has(parts[parts.length - 2])
    ? `${parts[parts.length - 2]}${parts[parts.length - 1]}`
    : parts[parts.length - 1];

  return `${parts[0]}.${surname}@${domain}`;
}

export function mapSerperContact(
  result: SerperOrganicResult,
  company: { companyName: string; domain: string | null },
): ContactPerson | null {
  const link = result.link ?? "";
  if (!/linkedin\.com\/in\//i.test(link)) return null;

  const parsed = parseLinkedInProfileTitle(result.title ?? "");
  if (!parsed) return null;

  const email = guessEmail(parsed.name, company.domain);

  return {
    id: `serper:${link}`,
    name: parsed.name,
    title: parsed.title,
    linkedinUrl: link.split("?")[0],
    email,
    // Serper is a search engine — it cannot verify an address, so anything we
    // produce is explicitly a guess.
    emailStatus: email ? "guess" : "unverified",
    phone: null,
    phoneExtension: null,
    companyName: parsed.companyName ?? company.companyName,
    companyDomain: company.domain,
    confidence: null,
    source: email ? "Serper · LinkedIn (email is a pattern guess)" : "Serper · LinkedIn",
  };
}

/** Sites that are never a company's own domain. */
const NON_COMPANY_HOSTS = [
  "linkedin.com", "facebook.com", "twitter.com", "x.com", "instagram.com", "youtube.com",
  "wikipedia.org", "glassdoor.com", "indeed.com", "crunchbase.com", "bloomberg.com",
  "github.com", "medium.com", "reddit.com", "pitchbook.com", "zoominfo.com",
];

/**
 * Find a company's own website with one extra search.
 *
 * Job sources that go through Google (LinkedIn listings) carry no employer
 * domain, and without one no email can be constructed at all. One credit buys
 * the domain, which turns a name-and-profile card into one with a contactable
 * address. Set SERPER_RESOLVE_DOMAINS=false to skip it and halve the credits.
 */
export async function resolveCompanyDomain(
  companyName: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<string | null> {
  if (process.env.SERPER_RESOLVE_DOMAINS?.trim().toLowerCase() === "false") return null;

  const results = await serperSearch(`"${companyName}" official website`, apiKey, { num: 10 }, signal).catch(
    () => [] as SerperOrganicResult[],
  );

  for (const result of results) {
    if (!result.link) continue;
    let host: string;
    try {
      host = new URL(result.link).hostname.replace(/^www\./, "").toLowerCase();
    } catch {
      continue;
    }

    if (NON_COMPANY_HOSTS.some((blocked) => host === blocked || host.endsWith(`.${blocked}`))) continue;
    return host;
  }

  return null;
}

export async function searchSerperContacts(
  company: { companyName: string; domain: string | null },
  apiKey: string,
  signal?: AbortSignal,
): Promise<ContactPerson[]> {
  // A handful of the highest-value titles — a longer OR list dilutes the query
  // and Google truncates it anyway.
  const titles = DECISION_MAKER_TITLES.slice(0, 6)
    .map((title) => `"${title}"`)
    .join(" OR ");

  // Without a domain there is no address to construct, so look one up first.
  const domain = company.domain ?? (await resolveCompanyDomain(company.companyName, apiKey, signal));
  const resolved = { companyName: company.companyName, domain };

  const query = `site:linkedin.com/in "${company.companyName}" (${titles})`;
  const results = await serperSearch(query, apiKey, { num: 10 }, signal);

  const contacts = results
    .map((result) => mapSerperContact(result, resolved))
    .filter((contact): contact is ContactPerson => contact !== null);

  const seen = new Set<string>();
  return contacts.filter((contact) =>
    seen.has(contact.linkedinUrl ?? contact.id) ? false : (seen.add(contact.linkedinUrl ?? contact.id), true),
  );
}
