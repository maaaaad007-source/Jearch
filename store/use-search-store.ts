"use client";

import { create } from "zustand";

import { DEFAULT_COUNTRY } from "@/lib/countries";
import type { ContactPerson, ContactsApiResponse, JobWithContact, JobsApiResponse } from "@/types";

type SearchStatus = "idle" | "loading-jobs" | "enriching" | "loading-more" | "success" | "error";

interface Query {
  designation: string;
  company: string;
  country: string;
}

interface SearchState {
  designation: string;
  company: string;
  country: string;
  status: SearchStatus;
  error: string | null;
  results: JobWithContact[];
  jobProvider: string | null;
  contactProvider: string | null;
  /** True when either side of the pipeline fell back to seeded sample data. */
  demo: boolean;
  lastQuery: Query | null;
  page: number;
  hasMore: boolean;

  setDesignation: (value: string) => void;
  setCompany: (value: string) => void;
  setCountry: (value: string) => void;
  search: () => Promise<void>;
  loadMore: () => Promise<void>;
  reset: () => void;
}

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload.error || fallback;
  } catch {
    return fallback;
  }
}

async function fetchJobs(query: Query, page: number): Promise<JobsApiResponse> {
  const params = new URLSearchParams({ country: query.country, page: String(page) });
  if (query.designation) params.set("designation", query.designation);
  if (query.company) params.set("company", query.company);

  const response = await fetch(`/api/jobs?${params.toString()}`);
  if (!response.ok) throw new Error(await readError(response, "Job search failed"));
  return (await response.json()) as JobsApiResponse;
}

async function fetchContacts(
  companies: Array<{ domain: string; companyName: string }>,
): Promise<ContactsApiResponse> {
  const response = await fetch("/api/contacts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companies }),
  });
  if (!response.ok) throw new Error(await readError(response, "Contact enrichment failed"));
  return (await response.json()) as ContactsApiResponse;
}

function toPendingResults(payload: JobsApiResponse): JobWithContact[] {
  return payload.jobs.map((job) => ({
    job,
    contact: null,
    alternateContacts: [],
    contactError: null,
  }));
}

const NO_DOMAIN = "No company website on this posting, so we could not look up contacts.";
const NO_CONTACT = "No decision maker found for this company.";

function applyContacts(
  results: JobWithContact[],
  contactsByDomain: Record<string, ContactPerson[]>,
): JobWithContact[] {
  return results.map((result) => {
    const domain = result.job.companyDomain;
    if (!domain) return { ...result, contactError: NO_DOMAIN };

    // A domain missing from the response was not part of this batch — leave
    // whatever the card already had rather than blanking an earlier result.
    const contacts = contactsByDomain[domain];
    if (!contacts) return result;

    return {
      ...result,
      contact: contacts[0] ?? null,
      alternateContacts: contacts.slice(1),
      contactError: contacts.length > 0 ? null : NO_CONTACT,
    };
  });
}

/**
 * The search pipeline runs in two visible phases so the grid can paint job
 * cards as soon as the board responds, then fill in decision-maker panels when
 * enrichment lands. Waiting for both would double the perceived latency.
 */
export const useSearchStore = create<SearchState>((set, get) => ({
  designation: "",
  company: "",
  country: DEFAULT_COUNTRY,
  status: "idle",
  error: null,
  results: [],
  jobProvider: null,
  contactProvider: null,
  demo: false,
  lastQuery: null,
  page: 1,
  hasMore: false,

  setDesignation: (value) => set({ designation: value }),
  setCompany: (value) => set({ company: value }),
  setCountry: (value) => set({ country: value }),

  search: async () => {
    const query: Query = {
      designation: get().designation.trim(),
      company: get().company.trim(),
      country: get().country,
    };

    if (query.designation.length < 2 && query.company.length < 2) {
      set({
        status: "error",
        error: "Enter a job title or a company name (at least 2 characters).",
      });
      return;
    }

    set({
      status: "loading-jobs",
      error: null,
      results: [],
      page: 1,
      hasMore: false,
      lastQuery: query,
      contactProvider: null,
    });

    let payload: JobsApiResponse;
    try {
      payload = await fetchJobs(query, 1);
    } catch (error) {
      set({ status: "error", error: error instanceof Error ? error.message : "Job search failed" });
      return;
    }

    const results = toPendingResults(payload);

    set({
      status: results.length > 0 ? "enriching" : "success",
      results,
      jobProvider: payload.provider,
      demo: payload.demo,
      hasMore: payload.hasMore,
    });

    if (results.length > 0) await enrich(set, get, results, payload.demo);
  },

  loadMore: async () => {
    const query = get().lastQuery;
    const status = get().status;
    if (!query || !get().hasMore || status === "loading-more" || status === "loading-jobs") return;

    const nextPage = get().page + 1;
    set({ status: "loading-more", error: null });

    let payload: JobsApiResponse;
    try {
      payload = await fetchJobs(query, nextPage);
    } catch (error) {
      set({
        status: "success",
        error: error instanceof Error ? error.message : "Could not load more results",
      });
      return;
    }

    // Boards repeat postings across pages often enough that deduping by id is
    // worth the two lines.
    const seen = new Set(get().results.map((result) => result.job.id));
    const fresh = toPendingResults(payload).filter((result) => !seen.has(result.job.id));
    const combined = [...get().results, ...fresh];

    set({
      status: fresh.length > 0 ? "enriching" : "success",
      results: combined,
      page: nextPage,
      hasMore: payload.hasMore && fresh.length > 0,
      demo: get().demo || payload.demo,
    });

    if (fresh.length > 0) await enrich(set, get, fresh, payload.demo);
  },

  reset: () =>
    set({
      status: "idle",
      error: null,
      results: [],
      jobProvider: null,
      contactProvider: null,
      demo: false,
      lastQuery: null,
      page: 1,
      hasMore: false,
    }),
}));

type Setter = (partial: Partial<SearchState>) => void;
type Getter = () => SearchState;

/**
 * Enrich a slice of results in place. Only the domains in `pending` are sent,
 * so paging never re-bills a domain that was already looked up.
 */
async function enrich(set: Setter, get: Getter, pending: JobWithContact[], jobsAreDemo: boolean) {
  const alreadyEnriched = new Set(
    get()
      .results.filter((result) => result.contact || result.contactError)
      .map((result) => result.job.companyDomain),
  );

  const companies = pending
    .filter((result) => result.job.companyDomain && !alreadyEnriched.has(result.job.companyDomain))
    .map((result) => ({
      domain: result.job.companyDomain as string,
      companyName: result.job.companyName,
    }));

  if (companies.length === 0) {
    set({
      status: "success",
      results: get().results.map((result) =>
        result.job.companyDomain ? result : { ...result, contactError: NO_DOMAIN },
      ),
    });
    return;
  }

  try {
    const payload = await fetchContacts(companies);

    set({
      status: "success",
      contactProvider: payload.provider,
      // Only flag the run as demo when the job side was synthetic too — real
      // postings with demo contacts would make the banner misleading.
      demo: jobsAreDemo || payload.demo,
      results: applyContacts(get().results, payload.contactsByDomain),
    });
  } catch (error) {
    // Enrichment is additive — a failure leaves the job cards intact.
    const message = error instanceof Error ? error.message : "Contact enrichment failed";
    const pendingIds = new Set(pending.map((result) => result.job.id));

    set({
      status: "success",
      results: get().results.map((result) =>
        pendingIds.has(result.job.id) && !result.contact ? { ...result, contactError: message } : result,
      ),
    });
  }
}
