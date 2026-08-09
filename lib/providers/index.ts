import type { ContactPerson, JobPost, SearchParams } from "@/types";
import {
  resolveContactProvider,
  resolveJobProvider,
  serverEnv,
  type ContactProvider,
  type JobProvider,
} from "@/lib/env";
import { companyKey, slugifyCompany, type CompanyRef } from "@/lib/company";
import { scoreTitle } from "@/lib/providers/constants";
import { demoContacts, demoJobs } from "@/lib/providers/demo";
import { searchJSearch } from "@/lib/providers/jsearch";
import { PAGE_SIZE as THEIRSTACK_PAGE_SIZE, searchTheirStack } from "@/lib/providers/theirstack";
import { searchApolloContacts } from "@/lib/providers/apollo";
import { searchHunterContacts } from "@/lib/providers/hunter";
import { searchSerperContacts, searchSerperJobs } from "@/lib/providers/serper";
import {
  PAGE_SIZE as JOBTECH_PAGE_SIZE,
  searchJobTech,
  supportsCountry as jobtechSupportsCountry,
} from "@/lib/providers/jobtech";

export interface JobSearchResult {
  jobs: JobPost[];
  provider: JobProvider;
  demo: boolean;
  /** Whether asking for the next page is likely to return anything. */
  hasMore: boolean;
  /** Explains a fallback, e.g. one source was empty so another answered. */
  notice: string | null;
}

export interface ContactSearchResult {
  contactsByDomain: Record<string, ContactPerson[]>;
  provider: ContactProvider;
  demo: boolean;
  /**
   * Set when every lookup in the batch failed — almost always a bad or
   * exhausted API key. Distinguishes "your key is wrong" from "this company
   * has no contacts", which otherwise look identical on a card.
   */
  error: string | null;
}

async function runJobProvider(
  provider: JobProvider,
  params: SearchParams,
  signal?: AbortSignal,
): Promise<JobSearchResult> {
  if (provider === "jobtech") {
    const jobs = await searchJobTech(params, serverEnv.jobtechKey, signal);
    return { jobs, provider, demo: false, hasMore: jobs.length >= JOBTECH_PAGE_SIZE, notice: null };
  }

  if (provider === "jsearch") {
    const jobs = await searchJSearch(params, serverEnv.jsearchKey!, signal);
    // JSearch reports no total, so a non-empty page is the only signal that
    // another one might exist.
    return { jobs, provider, demo: false, hasMore: jobs.length > 0, notice: null };
  }

  if (provider === "theirstack") {
    const jobs = await searchTheirStack(params, serverEnv.theirstackKey!, signal);
    return { jobs, provider, demo: false, hasMore: jobs.length >= THEIRSTACK_PAGE_SIZE, notice: null };
  }

  if (provider === "serper") {
    const jobs = await searchSerperJobs(params, serverEnv.serperKey!, signal);
    // A Google page holds ~10 usable results; a full one implies another.
    return { jobs, provider, demo: false, hasMore: jobs.length >= 8, notice: null };
  }

  const { jobs, hasMore } = demoJobs(params);
  return { jobs, provider: "demo", demo: true, hasMore, notice: null };
}

/**
 * Every usable job source for this search, best first.
 *
 * A national job board leads wherever one covers the country: it is a jobs
 * database rather than an index of web pages, so it answers "every UX Designer
 * ad in Sweden" with every ad, while a search engine answers with whatever
 * ranked. Search-based sources follow as the fallback for markets no board
 * covers. An explicit JOB_PROVIDER pins one source and disables the chain.
 */
function jobProviderChain(country: string): JobProvider[] {
  if (serverEnv.jobProviderOverride) return [resolveJobProvider()];

  const chain: JobProvider[] = [];
  const add = (provider: JobProvider) => {
    if (!chain.includes(provider)) chain.push(provider);
  };

  if (serverEnv.jobtechEnabled && jobtechSupportsCountry(country)) add("jobtech");

  add(resolveJobProvider());

  if (serverEnv.jsearchKey) add("jsearch");
  if (serverEnv.serperKey) add("serper");
  if (serverEnv.theirstackKey) add("theirstack");

  // Demo only leads when nothing real is configured; as a tail it would mask a
  // genuine empty result with sample data.
  const real = chain.filter((provider) => provider !== "demo");
  return real.length > 0 ? real : ["demo"];
}

const PROVIDER_NAMES: Record<JobProvider, string> = {
  jobtech: "Platsbanken (JobTech)",
  jsearch: "JSearch",
  theirstack: "TheirStack",
  serper: "LinkedIn via Serper",
  demo: "demo data",
};

/**
 * Search the configured job sources in order, moving on when one comes back
 * empty or broken.
 *
 * One provider returning nothing for a real query is common — they index
 * different boards — and a blank screen is the least useful thing to show when
 * another configured source would have answered. Paging stays on whichever
 * provider produced page one, and the fallback is reported so the results
 * header can say where the postings actually came from.
 */
export async function findJobs(params: SearchParams, signal?: AbortSignal): Promise<JobSearchResult> {
  const chain = jobProviderChain(params.country);
  const failures: string[] = [];
  // "Empty" and "broken" are different things to be told about, so the notice
  // distinguishes them rather than calling every skip "returned nothing".
  const skipped: Array<{ provider: JobProvider; reason: "empty" | "failed" }> = [];
  let firstEmpty: JobSearchResult | null = null;

  for (const provider of chain) {
    try {
      const result = await runJobProvider(provider, params, signal);

      if (result.jobs.length > 0) {
        const explained = skipped
          .map(({ provider: p, reason }) =>
            reason === "empty" ? `${PROVIDER_NAMES[p]} had no match` : `${PROVIDER_NAMES[p]} could not be reached`,
          )
          .join(", ");

        return {
          ...result,
          notice: explained ? `${explained} — these results come from ${PROVIDER_NAMES[provider]}.` : null,
        };
      }

      firstEmpty ??= result;
      skipped.push({ provider, reason: "empty" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[jobs] ${provider} failed:`, message);
      failures.push(`${PROVIDER_NAMES[provider]}: ${message}`);
      skipped.push({ provider, reason: "failed" });
    }
  }

  // Something answered, just with nothing in it.
  if (firstEmpty) {
    const searched = chain.map((p) => PROVIDER_NAMES[p]).join(" and ");
    return {
      ...firstEmpty,
      notice:
        chain.length > 1
          ? `Searched ${searched} — no match in either.${failures.length > 0 ? ` (${failures.join(" · ")})` : ""}`
          : null,
    };
  }

  // Nothing answered at all: every source threw.
  throw new Error(failures.join(" · "));
}

/**
 * Rank decision makers so the card can show the single most useful person.
 * Title relevance dominates; a reachable email breaks ties, because a perfect
 * title with no address is not actionable.
 */
export function rankContacts(contacts: ContactPerson[]): ContactPerson[] {
  return [...contacts].sort((a, b) => {
    const byTitle = scoreTitle(b.title) - scoreTitle(a.title);
    if (byTitle !== 0) return byTitle;

    const byEmail = Number(Boolean(b.email)) - Number(Boolean(a.email));
    if (byEmail !== 0) return byEmail;

    const verificationRank = { verified: 2, guess: 1, unverified: 0 } as const;
    const byVerification = verificationRank[b.emailStatus] - verificationRank[a.emailStatus];
    if (byVerification !== 0) return byVerification;

    return (b.confidence ?? 0) - (a.confidence ?? 0);
  });
}

/**
 * Apollo and Hunter look a company up by website; Serper looks it up by name.
 * A job source that supplies no domain (LinkedIn results via Serper, say) is
 * therefore still enrichable — but only by a provider that does not need one.
 */
class MissingDomainError extends Error {
  constructor(provider: string) {
    super(
      `${provider} needs a company website to find contacts, and this posting did not include one. Switch CONTACT_PROVIDER to serper, which searches by company name instead.`,
    );
    this.name = "MissingDomainError";
  }
}

async function fetchForCompany(
  provider: ContactProvider,
  company: CompanyRef,
  signal?: AbortSignal,
): Promise<ContactPerson[]> {
  if (provider === "serper") {
    return searchSerperContacts(company, serverEnv.serperKey!, signal);
  }

  if (provider === "apollo") {
    if (!company.domain) throw new MissingDomainError("Apollo.io");
    return searchApolloContacts(company.domain, serverEnv.apolloKey!, signal);
  }

  if (provider === "hunter") {
    if (!company.domain) throw new MissingDomainError("Hunter.io");
    return searchHunterContacts(company.domain, serverEnv.hunterKey!, signal);
  }

  return demoContacts(company.domain ?? slugifyCompany(company.companyName), company.companyName);
}

/**
 * Enrich a batch of companies in parallel.
 *
 * Enrichment APIs are per-credit and rate limited, so callers pass in a
 * deduplicated list and one failing company never fails the batch — the card
 * for that employer simply renders without a contact.
 */
export async function findContacts(
  companies: CompanyRef[],
  signal?: AbortSignal,
): Promise<ContactSearchResult> {
  const provider = resolveContactProvider();
  const unique = new Map<string, CompanyRef>();
  for (const entry of companies) {
    const key = companyKey(entry);
    if (!unique.has(key)) unique.set(key, entry);
  }

  const results = await Promise.allSettled(
    [...unique.entries()].map(async ([key, company]) => {
      const contacts = await fetchForCompany(provider, company, signal);
      return [key, rankContacts(contacts)] as const;
    }),
  );

  const contactsByDomain: Record<string, ContactPerson[]> = {};
  const failures: string[] = [];

  for (const result of results) {
    if (result.status === "fulfilled") {
      const [key, contacts] = result.value;
      contactsByDomain[key] = contacts;
    } else {
      console.error("[contacts] enrichment failed:", result.reason);
      failures.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
    }
  }

  // One failed domain is routine and stays silent; all of them failing is a
  // configuration problem the user needs to see.
  const error = failures.length > 0 && failures.length === results.length ? failures[0] : null;

  return { contactsByDomain, provider, demo: provider === "demo", error };
}
