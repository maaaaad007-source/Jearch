import type { Person } from "@/types";
import { config } from "@/lib/config";
import { sameCompany, slugifyCompany } from "@/lib/ranking";

/**
 * Finding the person to contact, via Google (Serper) over LinkedIn.
 *
 * The deliberate change from the previous design: a LinkedIn profile is a fact
 * — it was found, it exists, you can open it — while an email assembled from
 * "first.last@domain" is a guess that might bounce or reach a stranger.
 * Presenting the two with equal confidence was a mistake, so the profile leads
 * and the address is flagged as constructed wherever it appears.
 *
 * Serper is used rather than Apollo or Hunter because it costs a fraction as
 * much and works from a company *name*, so it answers for the small employers
 * the enrichment vendors have never indexed.
 */

const DEFAULT_ENDPOINT = "https://google.serper.dev/search";

interface SerperResult {
  title?: string;
  link?: string;
  snippet?: string;
}

async function serper(query: string, limit: number, signal?: AbortSignal): Promise<SerperResult[]> {
  const response = await fetch(config.serperEndpoint || DEFAULT_ENDPOINT, {
    method: "POST",
    headers: { "X-API-KEY": config.serperKey!, "content-type": "application/json" },
    body: JSON.stringify({ q: query, num: limit }),
    signal,
    next: { revalidate: 900 },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    if (response.status === 401 || response.status === 403) {
      throw new Error("Serper rejected the API key. Check SERPER_API_KEY at serper.dev.");
    }
    throw new Error(`Serper returned HTTP ${response.status}. ${body.slice(0, 160)}`);
  }

  const payload = (await response.json()) as { organic?: SerperResult[] };
  return payload.organic ?? [];
}

function stripLinkedInSuffix(title: string): string {
  return title
    .replace(/\s*[|\-–—]\s*LinkedIn\s*$/i, "")
    .replace(/\s*\.{3}\s*$/, "")
    .trim();
}

interface ParsedProfile {
  name: string;
  title: string | null;
  companyName: string | null;
}

/**
 * LinkedIn profile results read "Name - Role - Company", with hyphens or
 * dashes, and the company segment often missing.
 */
export function parseProfile(rawTitle: string): ParsedProfile | null {
  const cleaned = stripLinkedInSuffix(rawTitle);
  if (!cleaned) return null;

  const parts = cleaned.split(/\s+[-–—]\s+/).map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return null;

  const name = parts[0];
  // Reject LinkedIn pages that are not profiles — "Jobs at Acme", "Careers |
  // Acme". A real headline name is short, has letters, and is not a phrase.
  if (!/[a-z]/i.test(name) || name.length > 60) return null;
  if (/\b(at|for|in)\b/i.test(name)) return null;
  if (/^(jobs|careers|people|search|profiles|top \d+)\b/i.test(name)) return null;
  if (name.split(/\s+/).length > 4) return null;

  return { name, title: parts[1] ?? null, companyName: parts[2] ?? null };
}

/** Surname particles that belong to the surname rather than being middle names. */
const PARTICLES = new Set(["de", "van", "von", "der", "den", "la", "le", "du", "di", "da", "dos", "del", "bin"]);

export function patternEmail(name: string, domain: string | null): string | null {
  if (!domain) return null;

  const parts = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z\s]/g, "")
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length < 2) return null;

  const surname = PARTICLES.has(parts[parts.length - 2])
    ? `${parts[parts.length - 2]}${parts[parts.length - 1]}`
    : parts[parts.length - 1];

  return `${parts[0]}.${surname}@${domain}`;
}

/**
 * A profile that names a different employer is the wrong person.
 *
 * Plain keyword queries are looser than a `site:` search, so Google will
 * happily return a recruiter somewhere else entirely. A profile naming no
 * company is kept — there is nothing to contradict.
 */
function companyAgrees(profileCompany: string | null, searched: string): boolean {
  if (!profileCompany) return true;

  return sameCompany(profileCompany, searched);
}

/** Whose job it is to be contacted about a role, most relevant first. */
const TITLE_WEIGHTS: Array<[RegExp, number]> = [
  [/\b(talent acquisition|technical recruiter|recruiter|recruitment)\b/i, 100],
  [/\b(talent|hiring manager|people (partner|operations|ops))\b/i, 90],
  [/\b(head of (talent|people|hr)|hr (manager|director|lead))\b/i, 80],
  [/\b(head of|director|vp|vice president|chief)\b/i, 55],
  [/\b(manager|lead)\b/i, 40],
  [/\b(founder|co-?founder|ceo)\b/i, 35],
];

function scoreTitle(title: string | null): number {
  if (!title) return 0;

  for (const [pattern, weight] of TITLE_WEIGHTS) {
    if (pattern.test(title)) return weight;
  }
  return 10;
}

function mapProfile(result: SerperResult, companyName: string, domain: string | null): Person | null {
  const link = result.link ?? "";
  if (!/linkedin\.com\/in\//i.test(link)) return null;

  const parsed = parseProfile(result.title ?? "");
  if (!parsed) return null;
  if (!companyAgrees(parsed.companyName, companyName)) return null;

  const email = patternEmail(parsed.name, domain);

  return {
    id: `serper:${link}`,
    name: parsed.name,
    title: parsed.title,
    linkedinUrl: link.split("?")[0],
    email,
    // Serper is a search engine; it cannot verify an address. Anything here was
    // constructed from a naming convention and the UI must say so.
    emailIsPattern: Boolean(email),
    companyName: parsed.companyName ?? companyName,
    source: "LinkedIn via Serper",
  };
}

/** Hosts that are never a company's own website. */
const NOT_COMPANY_SITES = [
  "linkedin.com", "facebook.com", "twitter.com", "x.com", "instagram.com", "youtube.com",
  "wikipedia.org", "glassdoor.com", "indeed.com", "crunchbase.com", "bloomberg.com",
  "github.com", "medium.com", "reddit.com", "zoominfo.com", "greenhouse.io", "lever.co",
  "workable.com", "teamtailor.com", "smartrecruiters.com", "myworkdayjobs.com", "ashbyhq.com",
];

/**
 * Find the employer's own website, so an address can be constructed at all.
 *
 * Applicant-tracking hosts are excluded explicitly: a posting hosted on
 * teamtailor.com is not evidence that the recruiter's email ends in
 * @teamtailor.com, and that exact mistake reached the screen once.
 */
async function resolveDomain(companyName: string, signal?: AbortSignal): Promise<string | null> {
  const results = await serper(`${companyName} official website`, 5, signal).catch(() => []);

  for (const result of results) {
    if (!result.link) continue;

    try {
      const host = new URL(result.link).hostname.replace(/^www\./, "");
      if (NOT_COMPANY_SITES.some((bad) => host === bad || host.endsWith(`.${bad}`))) continue;

      // A plausible company domain shares a stem with the company name.
      const stem = slugifyCompany(companyName).slice(0, 6);
      if (stem.length >= 3 && !host.replace(/[^a-z0-9]/g, "").includes(stem)) continue;

      return host;
    } catch {
      continue;
    }
  }

  return null;
}

export interface CompanyQuery {
  companyName: string;
  /** Known from the posting, when the source published one. */
  domain: string | null;
}

async function findForCompany(query: CompanyQuery, signal?: AbortSignal): Promise<Person[]> {
  const domain = query.domain ?? (await resolveDomain(query.companyName, signal));

  const results = await serper(
    `${query.companyName} recruiter OR "talent acquisition" OR "hiring manager" site:linkedin.com/in`,
    10,
    signal,
  );

  const people = results
    .map((result) => mapProfile(result, query.companyName, domain))
    .filter((person): person is Person => person !== null);

  return people.sort((a, b) => {
    const byTitle = scoreTitle(b.title) - scoreTitle(a.title);
    if (byTitle !== 0) return byTitle;

    // A profile with a reachable address is more use than one without.
    return Number(Boolean(b.email)) - Number(Boolean(a.email));
  });
}

/**
 * Look several employers up at once.
 *
 * One company failing never fails the batch — that card simply renders without
 * a person — but every company failing is a configuration problem, and the
 * caller is told so rather than being shown an empty result.
 */
export async function findPeople(
  companies: CompanyQuery[],
  signal?: AbortSignal,
): Promise<{ peopleByCompany: Record<string, Person[]>; error: string | null }> {
  if (!config.serperKey) {
    return { peopleByCompany: {}, error: null };
  }

  const unique = new Map<string, CompanyQuery>();
  for (const entry of companies) {
    const key = entry.companyName.trim();
    if (key && key !== "Unknown company" && !unique.has(key)) unique.set(key, entry);
  }

  const settled = await Promise.allSettled(
    [...unique.entries()].map(async ([key, query]) => [key, await findForCompany(query, signal)] as const),
  );

  const peopleByCompany: Record<string, Person[]> = {};
  const failures: string[] = [];

  for (const result of settled) {
    if (result.status === "fulfilled") {
      const [key, people] = result.value;
      peopleByCompany[key] = people;
    } else {
      failures.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
    }
  }

  const error = failures.length > 0 && failures.length === settled.length ? failures[0] : null;
  return { peopleByCompany, error };
}
