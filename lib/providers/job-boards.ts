/**
 * Recognising a job posting in a Google result.
 *
 * The LinkedIn-only search relies on the `site:` operator, which free Serper
 * accounts refuse. Without it Google returns a mix — LinkedIn, Indeed, and the
 * applicant-tracking systems companies host their own listings on — so rather
 * than discard everything that is not LinkedIn, this identifies a posting on
 * any known board and extracts the employer from it.
 */

export interface BoardMatch {
  /** Display name for the source, e.g. "LinkedIn" or "Greenhouse". */
  board: string;
  /** Company slug taken from the URL, when the board puts one there. */
  companyFromUrl: string | null;
}

/** Pages that list many jobs rather than being one posting. */
const INDEX_PATH = /\/jobs?\/(search|browse|collections|explore|directory|category|companies)\b/i;

interface BoardRule {
  board: string;
  host: RegExp;
  /** Must match for the URL to be an individual posting. */
  posting: RegExp;
  /** Optional capture of the employer slug from the URL path. */
  company?: RegExp;
  /** Boards that put the employer in the subdomain instead. */
  companyFromSubdomain?: boolean;
}

const BOARDS: BoardRule[] = [
  {
    board: "LinkedIn",
    host: /(^|\.)linkedin\.com$/i,
    // /jobs/view/<id> or /jobs/<slug>-<id> — the trailing id is what makes it
    // a single posting rather than a listing page.
    posting: /\/jobs\/(view\/|.*-)\d{6,}/i,
  },
  {
    board: "Greenhouse",
    host: /(^|\.)(greenhouse\.io|boards\.greenhouse\.io)$/i,
    posting: /\/[^/]+\/jobs\/\d+/i,
    company: /^\/(?:embed\/job_board\?for=)?([^/?#]+)/i,
  },
  {
    board: "Lever",
    host: /(^|\.)lever\.co$/i,
    posting: /\/[^/]+\/[0-9a-f-]{8,}/i,
    company: /^\/([^/?#]+)/i,
  },
  {
    board: "Ashby",
    host: /(^|\.)ashbyhq\.com$/i,
    posting: /\/[^/]+\/[0-9a-f-]{8,}/i,
    company: /^\/([^/?#]+)/i,
  },
  {
    board: "Workable",
    host: /(^|\.)workable\.com$/i,
    posting: /\/j\/[0-9A-Z]{6,}/i,
    company: /^\/([^/?#]+)/i,
  },
  {
    board: "SmartRecruiters",
    host: /(^|\.)smartrecruiters\.com$/i,
    posting: /\/[^/]+\/\d{6,}/i,
    company: /^\/([^/?#]+)/i,
  },
  {
    board: "Teamtailor",
    host: /(^|\.)teamtailor\.com$/i,
    posting: /\/jobs\/[^/?#]+/i,
    companyFromSubdomain: true,
  },
  {
    board: "Workday",
    host: /(^|\.)myworkdayjobs\.com$/i,
    posting: /\/job\/|\/details\//i,
    companyFromSubdomain: true,
  },
  {
    board: "Indeed",
    host: /(^|\.)indeed\.[a-z.]+$/i,
    posting: /\/(viewjob|rc\/clk)/i,
  },
  {
    board: "Glassdoor",
    host: /(^|\.)glassdoor\.[a-z.]+$/i,
    posting: /\/job-listing\//i,
  },
  {
    board: "Otta",
    host: /(^|\.)otta\.com$/i,
    posting: /\/jobs\/[^/?#]+/i,
  },
];

/** Identify a single job posting, or null when the URL is not one. */
export function matchJobBoard(link: string): BoardMatch | null {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./i, "");
  const path = url.pathname;

  if (INDEX_PATH.test(path)) return null;

  for (const rule of BOARDS) {
    if (!rule.host.test(host)) continue;
    if (!rule.posting.test(path)) return null;

    const slug = rule.companyFromSubdomain
      ? subdomainCompany(host)
      : rule.company
        ? path.match(rule.company)?.[1] ?? null
        : null;

    return { board: rule.board, companyFromUrl: slug ? prettifySlug(slug) || null : null };
  }

  return null;
}

/** Subdomains that name the page, not the employer. */
const GENERIC_SUBDOMAINS = new Set(["www", "jobs", "job", "career", "careers", "apply", "boards", "my", "wd1", "wd3", "wd5"]);

/** `spotify.teamtailor.com` → "spotify"; ignores generic prefixes. */
function subdomainCompany(host: string): string | null {
  const label = host.split(".")[0];
  if (!label || GENERIC_SUBDOMAINS.has(label.toLowerCase())) return null;
  return label;
}

/** "acme-corp" → "Acme Corp" — ATS URLs carry the employer as a slug. */
export function prettifySlug(slug: string): string {
  const cleaned = decodeURIComponent(slug).replace(/[-_+]+/g, " ").trim();
  if (!cleaned || /^\d+$/.test(cleaned)) return "";

  return cleaned
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Titles that are obviously a listing page rather than one job. */
const LISTING_TITLE =
  /\b(jobs?|vacancies|careers|openings|opportunities)\b.*\b(in|at|near)\b.*\b(sweden|netherlands|germany|uk|usa)\b|^\d+\s+.*\bjobs\b|\bjobs? in\b/i;

export function looksLikeListingPage(title: string): boolean {
  return LISTING_TITLE.test(title);
}

/**
 * Pull role and employer out of a generic job-page title.
 *
 * Boards converge on a handful of separators: "Role - Company", "Role at
 * Company", "Company: Role". The role is whichever side is not the employer,
 * and when a slug from the URL is available it settles the ambiguity.
 */
export function parseBoardTitle(
  rawTitle: string,
  companyFromUrl: string | null,
): { title: string; companyName: string | null } {
  const cleaned = rawTitle
    .replace(/\s*[|\-–—]\s*(LinkedIn|Indeed|Glassdoor|Greenhouse|Lever|Workable|SmartRecruiters|Teamtailor|Otta|Workday)\s*$/i, "")
    .replace(/\s*\(\s*(remote|hybrid|on-?site)\s*\)\s*$/i, "")
    .trim();

  // "Acme hiring Product Designer in Stockholm" (LinkedIn's shape)
  const hiring = cleaned.match(/^(?<company>.+?)\s+hiring\s+(?<role>.+?)(?:\s+in\s+.+)?$/i);
  if (hiring?.groups) {
    return { title: hiring.groups.role.trim(), companyName: hiring.groups.company.trim() };
  }

  // "Acme: Product Designer" puts the employer first, the opposite of the
  // dash and "at" forms, so a colon is read on its own terms.
  const colon = cleaned.match(/^(?<company>[^:]{2,40}):\s+(?<role>.+)$/);
  if (colon?.groups && !/\bhiring\b/i.test(cleaned)) {
    return {
      title: colon.groups.role.trim(),
      companyName: companyFromUrl ?? colon.groups.company.trim(),
    };
  }

  const separated = cleaned.split(/\s+[-–—|]\s+|\s+at\s+/i).map((part) => part.trim()).filter(Boolean);

  if (separated.length >= 2) {
    // Prefer the URL's employer when we have one — it is not guesswork.
    if (companyFromUrl) {
      const role = separated.find((part) => part.toLowerCase() !== companyFromUrl.toLowerCase()) ?? separated[0];
      return { title: role, companyName: companyFromUrl };
    }
    return { title: separated[0], companyName: separated[1] };
  }

  return { title: cleaned, companyName: companyFromUrl };
}
