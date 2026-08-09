"use client";

import { create } from "zustand";

import { DEFAULT_COUNTRY } from "@/lib/countries";
import type { ContactPerson, ContactsApiResponse, JobWithContact, JobsApiResponse } from "@/types";

type SearchStatus = "idle" | "loading-jobs" | "enriching" | "success" | "error";

interface SearchState {
  designation: string;
  country: string;
  status: SearchStatus;
  error: string | null;
  results: JobWithContact[];
  jobProvider: string | null;
  contactProvider: string | null;
  /** True when either side of the pipeline fell back to seeded sample data. */
  demo: boolean;
  lastQuery: { designation: string; country: string } | null;

  setDesignation: (value: string) => void;
  setCountry: (value: string) => void;
  search: (params?: { designation?: string; country?: string }) => Promise<void>;
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

/**
 * The search pipeline runs in two visible phases so the grid can paint job
 * cards as soon as the board responds, then fill in decision-maker panels when
 * enrichment lands. Waiting for both would double the perceived latency.
 */
export const useSearchStore = create<SearchState>((set, get) => ({
  designation: "",
  country: DEFAULT_COUNTRY,
  status: "idle",
  error: null,
  results: [],
  jobProvider: null,
  contactProvider: null,
  demo: false,
  lastQuery: null,

  setDesignation: (value) => set({ designation: value }),
  setCountry: (value) => set({ country: value }),

  search: async (params) => {
    const designation = (params?.designation ?? get().designation).trim();
    const country = params?.country ?? get().country;

    if (designation.length < 2) {
      set({ status: "error", error: "Enter a job title with at least 2 characters." });
      return;
    }

    set({
      status: "loading-jobs",
      error: null,
      results: [],
      designation,
      country,
      lastQuery: { designation, country },
    });

    let jobsPayload: JobsApiResponse;
    try {
      const query = new URLSearchParams({ designation, country });
      const response = await fetch(`/api/jobs?${query.toString()}`);
      if (!response.ok) {
        throw new Error(await readError(response, "Job search failed"));
      }
      jobsPayload = (await response.json()) as JobsApiResponse;
    } catch (error) {
      set({
        status: "error",
        error: error instanceof Error ? error.message : "Job search failed",
      });
      return;
    }

    const baseResults: JobWithContact[] = jobsPayload.jobs.map((job) => ({
      job,
      contact: null,
      alternateContacts: [],
      contactError: null,
    }));

    if (baseResults.length === 0) {
      set({
        status: "success",
        results: [],
        jobProvider: jobsPayload.provider,
        demo: jobsPayload.demo,
      });
      return;
    }

    set({
      status: "enriching",
      results: baseResults,
      jobProvider: jobsPayload.provider,
      demo: jobsPayload.demo,
    });

    const companies = jobsPayload.jobs
      .filter((job) => job.companyDomain)
      .map((job) => ({ domain: job.companyDomain as string, companyName: job.companyName }));

    if (companies.length === 0) {
      set({
        status: "success",
        results: baseResults.map((result) => ({
          ...result,
          contactError: "No company website on this posting, so we could not look up contacts.",
        })),
      });
      return;
    }

    try {
      const response = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companies }),
      });
      if (!response.ok) {
        throw new Error(await readError(response, "Contact enrichment failed"));
      }

      const payload = (await response.json()) as ContactsApiResponse;

      // Only mark the run as demo data if the job side was already synthetic —
      // real postings with demo contacts would be misleading in the banner.
      set({
        status: "success",
        contactProvider: payload.provider,
        demo: jobsPayload.demo || payload.demo,
        results: baseResults.map((result) => {
          const domain = result.job.companyDomain;
          const contacts: ContactPerson[] = domain ? (payload.contactsByDomain[domain] ?? []) : [];

          return {
            ...result,
            contact: contacts[0] ?? null,
            alternateContacts: contacts.slice(1),
            contactError:
              contacts.length > 0
                ? null
                : domain
                  ? "No decision maker found for this company."
                  : "No company website on this posting, so we could not look up contacts.",
          };
        }),
      });
    } catch (error) {
      // Enrichment is additive — a failure leaves the job cards intact.
      const message = error instanceof Error ? error.message : "Contact enrichment failed";
      set({
        status: "success",
        results: baseResults.map((result) => ({ ...result, contactError: message })),
      });
    }
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
    }),
}));
