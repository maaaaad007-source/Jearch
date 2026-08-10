"use client";

import { create } from "zustand";

import type { PeopleResponse, Person, RankedJob, SearchResponse, SourceReport } from "@/types";

/**
 * Search state, in two phases.
 *
 * Jobs paint as soon as the databases answer; the people lookup is a second,
 * slower round trip that fills the contact panels afterwards. Waiting for both
 * before showing anything made every search feel broken, and the postings are
 * useful on their own.
 */

type Status = "idle" | "searching" | "ready" | "error";
type PeopleStatus = "idle" | "loading" | "done";

/** How many employers to look people up for. Each one is a paid search. */
const PEOPLE_BUDGET = 12;

interface SearchState {
  designation: string;
  company: string;
  country: string;

  status: Status;
  error: string | null;

  exact: RankedJob[];
  close: RankedJob[];
  sources: SourceReport[];
  examined: number;
  blocked: string | null;
  /** The query the visible results answer, so headings cannot drift. */
  searched: { designation: string; company: string; country: string } | null;

  peopleByCompany: Record<string, Person[]>;
  peopleStatus: PeopleStatus;
  peopleError: string | null;

  setDesignation: (value: string) => void;
  setCompany: (value: string) => void;
  setCountry: (value: string) => void;
  search: () => Promise<void>;
  /** Phase two of `search`; not meant to be called on its own. */
  lookUpPeople: (controller: AbortController) => Promise<void>;
}

let inFlight: AbortController | null = null;

export const useSearchStore = create<SearchState>((set, get) => ({
  designation: "",
  company: "",
  country: "NL",

  status: "idle",
  error: null,

  exact: [],
  close: [],
  sources: [],
  examined: 0,
  blocked: null,
  searched: null,

  peopleByCompany: {},
  peopleStatus: "idle",
  peopleError: null,

  setDesignation: (value) => set({ designation: value }),
  setCompany: (value) => set({ company: value }),
  setCountry: (value) => set({ country: value }),

  search: async () => {
    const { designation, company, country } = get();

    if (designation.trim().length < 2 && company.trim().length < 2) {
      set({ status: "error", error: "Enter a job title or a company name." });
      return;
    }

    // A second search while one is running should replace it, not race it.
    inFlight?.abort();
    const controller = new AbortController();
    inFlight = controller;

    set({
      status: "searching",
      error: null,
      exact: [],
      close: [],
      sources: [],
      examined: 0,
      blocked: null,
      peopleByCompany: {},
      peopleStatus: "idle",
      peopleError: null,
      searched: { designation: designation.trim(), company: company.trim(), country },
    });

    const query = new URLSearchParams({
      designation: designation.trim(),
      company: company.trim(),
      country,
    });

    try {
      const response = await fetch(`/api/search?${query}`, { signal: controller.signal });
      const payload = (await response.json()) as SearchResponse & { error?: string };

      if (!response.ok) throw new Error(payload.error ?? "The search could not be completed.");

      set({
        status: "ready",
        exact: payload.exact,
        close: payload.close,
        sources: payload.sources,
        examined: payload.examined,
        blocked: payload.blocked,
      });

      void get().lookUpPeople(controller);
    } catch (error) {
      if (controller.signal.aborted) return;
      set({
        status: "error",
        error: error instanceof Error ? error.message : "The search could not be completed.",
      });
    }
  },

  lookUpPeople: async (controller) => {
    const { exact, close } = get();

    // Exact matches first — if the budget runs out, it should run out on the
    // results the user is least likely to act on.
    const companies: Array<{ companyName: string; domain: string | null }> = [];
    const seen = new Set<string>();

    for (const { job } of [...exact, ...close]) {
      if (companies.length >= PEOPLE_BUDGET) break;
      if (job.companyName === "Unknown company" || seen.has(job.companyName)) continue;

      seen.add(job.companyName);
      companies.push({ companyName: job.companyName, domain: job.companyDomain });
    }

    if (companies.length === 0) {
      set({ peopleStatus: "done" });
      return;
    }

    set({ peopleStatus: "loading" });

    try {
      const response = await fetch("/api/people", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ companies }),
        signal: controller.signal,
      });

      const payload = (await response.json()) as PeopleResponse & { error?: string };

      set({
        peopleStatus: "done",
        peopleByCompany: payload.peopleByCompany ?? {},
        peopleError: payload.error ?? null,
      });
    } catch (error) {
      if (controller.signal.aborted) return;
      set({
        peopleStatus: "done",
        peopleError: error instanceof Error ? error.message : "Contact lookup failed.",
      });
    }
  },
}));
