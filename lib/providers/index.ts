import type { ContactPerson, JobPost, SearchParams } from "@/types";
import {
  resolveContactProvider,
  resolveJobProvider,
  serverEnv,
  type ContactProvider,
  type JobProvider,
} from "@/lib/env";
import { scoreTitle } from "@/lib/providers/constants";
import { demoContacts, demoJobs } from "@/lib/providers/demo";
import { searchJSearch } from "@/lib/providers/jsearch";
import { searchTheirStack } from "@/lib/providers/theirstack";
import { searchApolloContacts } from "@/lib/providers/apollo";
import { searchHunterContacts } from "@/lib/providers/hunter";

export interface JobSearchResult {
  jobs: JobPost[];
  provider: JobProvider;
  demo: boolean;
}

export interface ContactSearchResult {
  contactsByDomain: Record<string, ContactPerson[]>;
  provider: ContactProvider;
  demo: boolean;
}

export async function findJobs(params: SearchParams, signal?: AbortSignal): Promise<JobSearchResult> {
  const provider = resolveJobProvider();

  if (provider === "jsearch") {
    const jobs = await searchJSearch(params, serverEnv.jsearchKey!, signal);
    return { jobs, provider, demo: false };
  }

  if (provider === "theirstack") {
    const jobs = await searchTheirStack(params, serverEnv.theirstackKey!, signal);
    return { jobs, provider, demo: false };
  }

  return { jobs: demoJobs(params), provider: "demo", demo: true };
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

async function fetchForDomain(
  provider: ContactProvider,
  domain: string,
  companyName: string | undefined,
  signal?: AbortSignal,
): Promise<ContactPerson[]> {
  if (provider === "apollo") return searchApolloContacts(domain, serverEnv.apolloKey!, signal);
  if (provider === "hunter") return searchHunterContacts(domain, serverEnv.hunterKey!, signal);
  return demoContacts(domain, companyName);
}

/**
 * Enrich a batch of company domains in parallel.
 *
 * Enrichment APIs are per-credit and rate limited, so callers pass in a
 * deduplicated domain list and one failing domain never fails the batch — the
 * card for that company simply renders without a contact.
 */
export async function findContacts(
  domains: Array<{ domain: string; companyName?: string }>,
  signal?: AbortSignal,
): Promise<ContactSearchResult> {
  const provider = resolveContactProvider();
  const unique = new Map<string, string | undefined>();
  for (const entry of domains) {
    if (entry.domain && !unique.has(entry.domain)) unique.set(entry.domain, entry.companyName);
  }

  const results = await Promise.allSettled(
    [...unique.entries()].map(async ([domain, companyName]) => {
      const contacts = await fetchForDomain(provider, domain, companyName, signal);
      return [domain, rankContacts(contacts)] as const;
    }),
  );

  const contactsByDomain: Record<string, ContactPerson[]> = {};
  for (const result of results) {
    if (result.status === "fulfilled") {
      const [domain, contacts] = result.value;
      contactsByDomain[domain] = contacts;
    } else {
      console.error("[contacts] enrichment failed:", result.reason);
    }
  }

  return { contactsByDomain, provider, demo: provider === "demo" };
}
