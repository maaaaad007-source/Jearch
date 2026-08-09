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

export interface JobSearchResult {
  jobs: JobPost[];
  provider: JobProvider;
  demo: boolean;
  /** Whether asking for the next page is likely to return anything. */
  hasMore: boolean;
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

export async function findJobs(params: SearchParams, signal?: AbortSignal): Promise<JobSearchResult> {
  const provider = resolveJobProvider();

  if (provider === "jsearch") {
    const jobs = await searchJSearch(params, serverEnv.jsearchKey!, signal);
    // JSearch reports no total, so a non-empty page is the only signal that
    // another one might exist.
    return { jobs, provider, demo: false, hasMore: jobs.length > 0 };
  }

  if (provider === "theirstack") {
    const jobs = await searchTheirStack(params, serverEnv.theirstackKey!, signal);
    return { jobs, provider, demo: false, hasMore: jobs.length >= THEIRSTACK_PAGE_SIZE };
  }

  if (provider === "serper") {
    const jobs = await searchSerperJobs(params, serverEnv.serperKey!, signal);
    // A Google page holds ~10 usable results; a full one implies another.
    return { jobs, provider, demo: false, hasMore: jobs.length >= 8 };
  }

  const { jobs, hasMore } = demoJobs(params);
  return { jobs, provider: "demo", demo: true, hasMore };
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
