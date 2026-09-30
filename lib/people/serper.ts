import type { ContactKind, Person } from "@/types";
import { config } from "@/lib/config";
import { sameCompany } from "@/lib/ranking";

/**
 * Finding the people to contact, via Google (Serper) over LinkedIn.
 *
 * A LinkedIn profile is a fact — it was found, it exists, you can open it.
 * Earlier versions also assembled a "first.last@domain" address for each
 * person; those were wrong often enough to do more harm than good, so they are
 * gone and the profile is the one way in.
 *
 * Two searches per employer: one for the people who run hiring (recruiters,
 * talent acquisition, and for internships the early-careers team), one for the
 * people the hire would work for (a manager or lead in the posting's field).
 * The second is often the better contact and was previously never looked for.
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

/** Who runs internship and graduate hiring — often a separate team from the recruiters. */
const EARLY_CAREERS = /\b(university|campus|early[- ]careers?|emerging talent|graduate|intern(ship)?s?|student|apprentice(ship)?s?)\b/i;
const RECRUITING = /\b(talent acquisition|technical recruiter|recruiter|recruitment|recruiting|sourcer|talent (partner|lead|manager|specialist)|people partner|hr business partner|human resources)\b/i;
const HIRING_MANAGER = /\bhiring manager\b/i;
const SENIOR = /\b(head|director|manager|lead|principal|vp|vice president|chief|supervisor|team lead)\b/i;
const LEADERSHIP = /\b(founder|co-?founder|ceo|cto|coo|chief|managing director|head of|vp|vice president|director|owner)\b/i;

/** Words in a role that say nothing about its field. */
const NOT_A_FIELD = new Set([
  "senior", "junior", "sr", "jr", "lead", "principal", "staff", "mid", "level", "i", "ii", "iii",
  "intern", "interns", "internship", "trainee", "graduate", "apprentice", "working", "student",
  "werkstudent", "stagiair", "praktikant", "summer", "thesis", "and", "or", "the", "of", "for", "a",
  "an", "m", "f", "d", "x", "w", "in", "at", "to",
]);

/**
 * The field a role belongs to, as search words: "UX Design Intern" → "UX Design".
 * Capped at two words — "Senior Backend Software Engineer" as an exact phrase
 * finds no one, "Backend Software" or "Software Engineer" still does.
 */
export function fieldOf(role: string | null): string[] {
  if (!role) return [];

  const words = role
    .replace(/\(.*?\)/g, " ")
    .split(/[^A-Za-zÀ-ÿ0-9+#]+/)
    .filter((word) => word.length >= 2 && !NOT_A_FIELD.has(word.toLowerCase()));

  return words.slice(0, 2);
}

function stem(word: string): string {
  return word.toLowerCase().replace(/(ers?|ing|ors?|ists?|ment)$/, "");
}

/** Does this headline sit in the same field as the role? "Design Manager" for a UX Design Intern. */
function inField(title: string, field: string[]): boolean {
  const lower = title.toLowerCase();
  return field.some((word) => {
    const root = stem(word);
    return root.length >= 3 && lower.includes(root);
  });
}

/** Why this person is worth contacting, from their headline alone. */
export function classify(title: string | null, field: string[]): ContactKind | null {
  if (!title) return null;

  if (EARLY_CAREERS.test(title) && (RECRUITING.test(title) || /\b(talent|program|programme|hiring)\b/i.test(title))) {
    return "Early careers";
  }
  if (RECRUITING.test(title)) return "Recruiting";
  if (HIRING_MANAGER.test(title)) return "Hiring team";
  if (SENIOR.test(title) && inField(title, field)) return "Hiring team";
  if (LEADERSHIP.test(title)) return "Leadership";
  return null;
}

/** Most useful first. The early-careers team outranks everyone for an internship, and only then. */
function score(person: Person, field: string[], internship: boolean): number {
  const base = {
    "Early careers": internship ? 110 : 70,
    Recruiting: 100,
    "Hiring team": 95,
    Leadership: 50,
  } as const;

  if (person.kind) return base[person.kind];
  return person.title && inField(person.title, field) ? 30 : 10;
}

function mapProfile(result: SerperResult, companyName: string, field: string[]): Person | null {
  const link = result.link ?? "";
  if (!/linkedin\.com\/in\//i.test(link)) return null;

  const parsed = parseProfile(result.title ?? "");
  if (!parsed) return null;
  if (!companyAgrees(parsed.companyName, companyName)) return null;

  return {
    id: `serper:${link}`,
    name: parsed.name,
    title: parsed.title,
    linkedinUrl: link.split("?")[0],
    kind: classify(parsed.title, field),
    companyName: parsed.companyName ?? companyName,
    source: "LinkedIn via Serper",
  };
}

/** How many people come back per employer — the card shows the first and folds the rest. */
const PEOPLE_PER_COMPANY = 8;

export interface CompanyQuery {
  companyName: string;
  /** The role being hired for, so the hiring team can be looked for by field. */
  role: string | null;
  /** True when any of this employer's results is an internship. */
  internship: boolean;
}

function recruitingQuery(query: CompanyQuery): string {
  const titles = [
    "recruiter",
    '"talent acquisition"',
    '"hiring manager"',
    '"talent partner"',
    '"people partner"',
    ...(query.internship
      ? ['"university recruiter"', '"campus recruiter"', '"early careers"', '"graduate recruitment"', '"emerging talent"']
      : []),
  ];

  return `${query.companyName} (${titles.join(" OR ")}) site:linkedin.com/in`;
}

function teamQuery(query: CompanyQuery, field: string[]): string | null {
  if (field.length === 0) return null;

  return `${query.companyName} "${field.join(" ")}" (manager OR lead OR "head of" OR director) site:linkedin.com/in`;
}

async function findForCompany(query: CompanyQuery, signal?: AbortSignal): Promise<Person[]> {
  const field = fieldOf(query.role);
  const team = teamQuery(query, field);

  // The recruiting search is the one that must work; the team search only adds
  // to it, so its failure is not worth losing the recruiters over.
  const [recruiting, hiringTeam] = await Promise.all([
    serper(recruitingQuery(query), 10, signal),
    team ? serper(team, 10, signal).catch(() => []) : Promise.resolve([]),
  ]);

  const byProfile = new Map<string, Person>();
  for (const result of [...recruiting, ...hiringTeam]) {
    const person = mapProfile(result, query.companyName, field);
    if (person?.linkedinUrl && !byProfile.has(person.linkedinUrl)) byProfile.set(person.linkedinUrl, person);
  }

  return [...byProfile.values()]
    .map((person, order) => ({ person, order, score: score(person, field, query.internship) }))
    // Search order breaks ties: Google's ranking is a fair signal of relevance.
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, PEOPLE_PER_COMPANY)
    .map(({ person }) => person);
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
