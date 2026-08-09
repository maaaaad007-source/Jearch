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
  /**
   * The employer's own domain, when the posting is on it. A job on
   * `ericsson.com` tells us the company and its website at once — no
   * resolution search, and no chance of guessing an address at the wrong host.
   */
  companyDomain?: string | null;
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
  {
    board: "Recruitee",
    host: /(^|\.)recruitee\.com$/i,
    posting: /\/o\/[^/?#]+/i,
    companyFromSubdomain: true,
  },
  {
    board: "Personio",
    host: /(^|\.)(jobs\.personio\.de|jobs\.personio\.com)$/i,
    posting: /\/job\/\d+/i,
    companyFromSubdomain: true,
  },
  {
    board: "JOIN",
    host: /(^|\.)join\.com$/i,
    posting: /\/companies\/[^/]+\/\d+/i,
    company: /^\/companies\/([^/?#]+)/i,
  },
  {
    board: "The Hub",
    host: /(^|\.)thehub\.io$/i,
    posting: /\/jobs\/[^/?#]+/i,
  },
  {
    board: "Jobbsafari",
    host: /(^|\.)jobbsafari\.[a-z.]+$/i,
    posting: /\/jobb?\/[^/?#]+/i,
  },
  {
    board: "Arbetsförmedlingen",
    host: /(^|\.)arbetsformedlingen\.se$/i,
    posting: /\/(annons|ad)\/[^/?#]+/i,
  },
  {
    board: "Academic Work",
    host: /(^|\.)academicwork\.[a-z.]+$/i,
    posting: /\/(jobs?|lediga-jobb)\/[^/?#]+/i,
  },
  {
    board: "Monster",
    host: /(^|\.)monster\.[a-z.]+$/i,
    posting: /\/job-openings?\/|\/jobb?\//i,
  },
  {
    board: "StepStone",
    host: /(^|\.)stepstone\.[a-z.]+$/i,
    posting: /\/(stellenangebote|job)[-/]/i,
  },
  {
    board: "Welcome to the Jungle",
    host: /(^|\.)welcometothejungle\.com$/i,
    posting: /\/jobs\/[^/?#]+/i,
  },
  {
    board: "Jobylon",
    host: /(^|\.)jobylon\.com$/i,
    posting: /\/jobs\/\d+/i,
  },
  {
    board: "Varbi",
    host: /(^|\.)varbi\.com$/i,
    posting: /\/(what|se)\/[^/?#]+/i,
  },
];

/**
 * A last-resort shape check for boards not listed above — company career pages
 * and regional sites this list will never fully cover. It requires both a
 * job-ish path segment and an identifier (a numeric id or a multi-word slug),
 * which is what separates one posting from a category page.
 */
const GENERIC_POSTING = /\/(jobs?|career|careers|vacancy|vacancies|position|opening|stelle|annons|lediga-jobb)\/[^/?#]*(\d{4,}|[a-z]+-[a-z]+)/i;

/** Hosts that are never a job posting, whatever their path looks like. */
const NEVER_A_POSTING =
  /(^|\.)(wikipedia\.org|facebook\.com|twitter\.com|x\.com|instagram\.com|youtube\.com|reddit\.com|medium\.com|quora\.com|pinterest\.[a-z.]+)$/i;

/**
 * Is this host a job board or applicant-tracking system rather than a
 * company's own website?
 *
 * Domain resolution needs this: searching "Mt3 official website" ranks the
 * company's Teamtailor careers page, and accepting it would build addresses at
 * `mt3.teamtailor.com` — the ATS vendor's domain, where no mail from that
 * company is ever read.
 */
export function isJobBoardHost(host: string): boolean {
  const clean = host.replace(/^www\./i, "").toLowerCase();
  return BOARDS.some((rule) => rule.host.test(clean));
}

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

  // Not a board we know. Career pages on a company's own domain are worth
  // keeping — often they are the best outreach target — so accept anything
  // shaped like a single posting and name the host as the source.
  if (!NEVER_A_POSTING.test(host) && GENERIC_POSTING.test(path)) {
    const label = host.replace(/^(jobs|careers|career|apply|work|join)\./i, "");
    const company = companyFromHost(host);

    return {
      board: label,
      companyFromUrl: company,
      // Only claim the domain when the host actually names the employer;
      // an aggregator's domain is not the company's.
      companyDomain: company ? host.replace(/^(jobs|careers|career|apply|work|join)\./i, "") : null,
    };
  }

  return null;
}

/**
 * Derive the employer from the host of a company's own careers page.
 *
 * `ericsson.com` is Ericsson; `spotifyjobs.com` is Spotify. An aggregator like
 * `jobsinstockholm.com` is nobody — a host whose name is still about jobs after
 * the recruiting words are stripped is a job site, not an employer, and
 * claiming otherwise would put the wrong company on the card and build an
 * address at its domain.
 */
export function companyFromHost(host: string): string | null {
  const label = host.replace(/^(jobs|careers|career|apply|work|join|emea|www)\./i, "").split(".")[0];
  if (!label) return null;

  const trimmed = label.replace(/(jobs|careers|hiring|recruiting|recruitment|talent|vacancies)$/i, "");
  if (!trimmed || trimmed.length < 2) return null;
  if (/(job|career|vacan|recruit|talent|hiring|work|bemanning)/i.test(trimmed)) return null;

  return prettifySlug(trimmed) || null;
}

/**
 * Postings Google still indexes but nobody can apply to.
 *
 * Search results lag reality by months, and a closed vacancy wastes the one
 * thing this app is for — the outreach. The wording is standard enough across
 * boards to match directly.
 */
const EXPIRED_SIGNALS =
  /\b(no longer accepting applications|no longer available|this (job|position|vacancy) (has expired|is closed|is no longer)|applications? (are )?closed|position (has been )?filled|vacancy (has )?closed|ansökningstiden har (gått ut|utgått)|sista ansökningsdag har passerat)\b/i;

export function looksExpired(text: string): boolean {
  return EXPIRED_SIGNALS.test(text);
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

/**
 * Titles that are unmistakably a listing page.
 *
 * Deliberately narrow. "UX Designer job in Stockholm - Spotify" is a single
 * posting, and an earlier, greedier rule that rejected any "job in" threw away
 * most real results. The URL patterns above are the real filter; this only
 * catches what slips past them.
 */
const LISTING_TITLE = [
  // "500 UX Designer jobs in Stockholm"
  /^\d[\d,.\s]*\s+\S/,
  // The whole title is "<Role> Jobs in <Place>" with no employer named.
  /^[^|\-–—:]{0,60}\bjobs\b\s+(in|near|at)\s+[^|\-–—:]{0,40}$/i,
  /\b(browse|search results|all jobs|job search|latest jobs|top \d+)\b/i,
];

export function looksLikeListingPage(title: string): boolean {
  return LISTING_TITLE.some((pattern) => pattern.test(title));
}

/**
 * Is this parsed role actually a job title?
 *
 * Aggregator sites title their pages after themselves ("Jobs in Stockholm -
 * Sweden - for English Speaking Professionals"), which parses into a role that
 * is really a site name. Requiring the role to echo what the user searched for
 * is a blunt test, but it is the one that reliably separates a posting from a
 * portal — and a card with the wrong title is worse than one fewer card.
 */
export function isPlausibleRole(role: string, designation: string): boolean {
  const cleaned = role.trim();
  if (!cleaned || cleaned.length > 90) return false;

  // Page titles rather than roles.
  if (/^(jobs?|careers?|vacancies|openings|opportunities|home|about|search)\b/i.test(cleaned)) return false;
  if (/\bfor english speaking\b|\bjob (board|site|portal)\b/i.test(cleaned)) return false;

  if (!designation.trim()) return true;

  // Share at least one meaningful word with the search — "UX Designer" should
  // not return "Jobs in Stockholm".
  const significant = designation
    .toLowerCase()
    .split(/[^a-zà-ÿ0-9]+/)
    // Two characters is deliberate: "UX", "QA", "PM" and "HR" carry most of
    // the meaning in the titles people actually search for.
    .filter((word) => word.length >= 2);

  if (significant.length === 0) return true;

  const haystack = cleaned.toLowerCase();
  return significant.some((word) => haystack.includes(word));
}

/** Words that are never an employer, however the title is punctuated. */
const NON_COMPANY_WORDS =
  /^(jobs?|careers?|vacancies|openings|home|about|apply|remote|hybrid|on-?site|full[- ]time|part[- ]time|contract|internship|sweden|norway|denmark|finland|netherlands|germany|france|spain|italy|poland|ireland|england|scotland|europe|emea|worldwide|global|anywhere)$/i;

/**
 * Reject employer names that are really a place, a work arrangement, or a page
 * label. A bad name is not merely cosmetic: it feeds the contact lookup and
 * the guessed email address, so "Sweden" becomes `name@sweden.se`.
 */
export function sanitizeCompanyName(
  name: string | null,
  countryName?: string,
  location?: string | null,
): string | null {
  if (!name) return null;

  const raw = name.replace(/\s+/g, " ").trim();
  // Truncated search-result text is a fragment, not a name — check before any
  // trailing punctuation is stripped away.
  if (/\.\.\.$|…$/.test(raw)) return null;

  const cleaned = raw.replace(/[.,;:|\-–—]+$/, "").trim();
  if (!cleaned || cleaned.length < 2 || cleaned.length > 60) return null;
  if (NON_COMPANY_WORDS.test(cleaned)) return null;
  if (!/[a-zà-ÿ]/i.test(cleaned)) return null;

  // Sentence fragments captured by a separator ("... - for English Speaking").
  // Articles are deliberately absent: "The Guardian" is a real employer.
  if (/^(for|and|with|at|in|on|by|to|of)\s/i.test(cleaned)) return null;

  if (countryName && cleaned.toLowerCase() === countryName.toLowerCase()) return null;

  // The place the job is in is not the company hiring for it.
  if (location && location.toLowerCase().includes(cleaned.toLowerCase())) return null;

  return cleaned;
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
  boardName?: string,
): { title: string; companyName: string | null } {
  // The board's own name is never the employer — "UX Designer | The Hub" is a
  // posting on The Hub, not a job at The Hub.
  const boardSuffix = boardName
    ? new RegExp(`\\s*[|\\-–—]\\s*${boardName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i")
    : null;

  const cleaned = rawTitle
    .replace(/\s*[|\-–—]\s*(LinkedIn|Indeed|Glassdoor|Greenhouse|Lever|Workable|SmartRecruiters|Teamtailor|Otta|Workday|Recruitee|Personio|JOIN|The Hub|Jobbsafari|Monster|StepStone)\s*$/i, "")
    .replace(boardSuffix ?? /(?!)/, "")
    .replace(/\s*\(\s*(remote|hybrid|on-?site)\s*\)\s*$/i, "")
    .trim();

  // "Acme hiring Product Designer in Stockholm" (LinkedIn's shape)
  const hiring = cleaned.match(/^(?<company>.+?)\s+hiring\s+(?<role>.+?)(?:\s+in\s+.+)?$/i);
  if (hiring?.groups) {
    return { title: cleanRole(hiring.groups.role), companyName: hiring.groups.company.trim() };
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
      return { title: cleanRole(role), companyName: companyFromUrl };
    }

    const candidate = separated[1];
    return { title: cleanRole(separated[0]), companyName: isSameAsBoard(candidate, boardName) ? null : candidate };
  }

  return { title: cleanRole(cleaned), companyName: companyFromUrl };
}

/**
 * Is this "employer" really the site the page is on?
 *
 * A title ending "| JobzMall" names the aggregator, not who is hiring, and the
 * board label may be a bare host ("jobzmall.com") while the title spells it
 * out — so the comparison strips the domain and any punctuation first.
 */
function isSameAsBoard(candidate: string, boardName?: string): boolean {
  if (!boardName) return false;

  const normalise = (value: string) =>
    value
      .toLowerCase()
      .replace(/\.(com|io|co|net|org|se|nl|de|fr|uk|dev)$/i, "")
      .replace(/[^a-z0-9]/g, "");

  const a = normalise(candidate);
  const b = normalise(boardName);
  return Boolean(a) && Boolean(b) && (a === b || a.includes(b) || b.includes(a));
}

/**
 * Trim the scaffolding boards wrap around a role: "UX Designer job in
 * Stockholm, Sweden" and its Swedish equivalent are both just "UX Designer".
 */
export function cleanRole(role: string): string {
  return role
    // Swedish boards prefix "vacant jobs" onto the role.
    .replace(/^(lediga\s+(jobb|tjänster)|jobb|job|vacancy|stelle)\s*:?\s+/i, "")
    .replace(/\s+jobs?\s+(in|at|near)\s+.*$/i, "")
    .replace(/\s+jobb\s+(i|hos)\s+.*$/i, "")
    .replace(/\s*,\s*[A-ZÅÄÖÉ][\w.'-]*(\s+[A-ZÅÄÖÉ][\w.'-]*){0,2}\s*$/u, (match) =>
      // Only strip a trailing ", Somewhere" when it does not look like part of
      // the role itself ("Designer, Growth" should survive).
      // A trailing comma segment is a location unless it names a
      // specialisation — "UX Designer, Payments" keeps its team.
      /\b(growth|platform|product|design|research|engineering|marketing|data|brand|content|payments|infrastructure|mobile|web|core|ops|security|search|checkout|identity|ai|ml|cloud|api|risk|fraud)\b/i.test(match)
        ? match
        : "",
    )
    .trim();
}
