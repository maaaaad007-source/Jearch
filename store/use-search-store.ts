"use client";

import { create } from "zustand";

import { isInternship } from "@/lib/ranking";
import type { JobType, PeopleResponse, Person, RankedJob, SearchResponse, SourceReport } from "@/types";

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
  jobType: JobType;

  status: Status;
  error: string | null;

  exact: RankedJob[];
  close: RankedJob[];
  elsewhere: RankedJob[];
  employersFound: string[];
  excluded: { company: number; stale: number; title: number; type: number };
  sources: SourceReport[];
  examined: number;
  /** The roles the results actually answer, after parsing and capping. */
  roles: string[];
  blocked: string | null;
  /** The query the visible results answer, so headings cannot drift. */
  searched: { designation: string; company: string; country: string; jobType: JobType } | null;

  peopleByCompany: Record<string, Person[]>;
  peopleStatus: PeopleStatus;
  peopleError: string | null;

  setDesignation: (value: string) => void;
  setCompany: (value: string) => void;
  setCountry: (value: string) => void;
  setJobType: (value: JobType) => void;
  search: () => Promise<void>;
  /** Phase two of `search`; not meant to be called on its own. */
  lookUpPeople: (controller: AbortController) => Promise<void>;
}

let inFlight: AbortController | null = null;

export const useSearchStore = create<SearchState>((set, get) => ({
  designation: "",
  company: "",
  country: "NL",
  jobType: "all",

  status: "idle",
  error: null,

  exact: [],
  close: [],
  elsewhere: [],
  employersFound: [],
  excluded: { company: 0, stale: 0, title: 0, type: 0 },
  sources: [],
  examined: 0,
  roles: [],
  blocked: null,
  searched: null,

  peopleByCompany: {},
  peopleStatus: "idle",
  peopleError: null,

  setDesignation: (value) => set({ designation: value }),
  setCompany: (value) => set({ company: value }),
  setCountry: (value) => set({ country: value }),
  setJobType: (value) => set({ jobType: value }),

  search: async () => {
    const { designation, company, country, jobType } = get();

    if (designation.trim().length < 2 && company.trim().length < 2 && jobType !== "internships") {
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
      elsewhere: [],
      employersFound: [],
      excluded: { company: 0, stale: 0, title: 0, type: 0 },
      sources: [],
      examined: 0,
      roles: [],
      blocked: null,
      peopleByCompany: {},
      peopleStatus: "idle",
      peopleError: null,
      searched: { designation: designation.trim(), company: company.trim(), country, jobType },
    });

    const query = new URLSearchParams({
      designation: designation.trim(),
      company: company.trim(),
      country,
      type: jobType,
    });

    try {
      const response = await fetch(`/api/search?${query}`, { signal: controller.signal });
      const payload = (await response.json()) as SearchResponse & { error?: string };

      if (!response.ok) throw new Error(payload.error ?? "The search could not be completed.");

      set({
        status: "ready",
        exact: payload.exact,
        close: payload.close,
        elsewhere: payload.elsewhere ?? [],
        employersFound: payload.employersFound ?? [],
        excluded: payload.excluded ?? { company: 0, stale: 0, title: 0, type: 0 },
        sources: payload.sources,
        examined: payload.examined,
        roles: payload.roles ?? [],
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
    const { exact, close, elsewhere } = get();

    // Exact matches first — if the budget runs out, it should run out on the
    // results the user is least likely to act on. Other-employer results are
    // last but still included: they are the only cards on screen when a
    // company search comes up empty, and a card without a contact is half a
    // card.
    const companies: Array<{ companyName: string; role: string | null; internship: boolean }> = [];
    const byName = new Map<string, (typeof companies)[number]>();
    const { roles } = get();

    for (const { job, matchedRole } of [...exact, ...close, ...elsewhere]) {
      if (job.companyName === "Unknown company") continue;

      const internship = isInternship(job.title);
      const known = byName.get(job.companyName);
      if (known) {
        // One internship among an employer's results is enough to look for
        // the early-careers team there too.
        known.internship ||= internship;
        continue;
      }
      if (companies.length >= PEOPLE_BUDGET) continue;

      // The role the hiring team is looked up by: what was searched when that
      // is known, the posting's own title for a company-only search.
      const entry = { companyName: job.companyName, role: matchedRole ?? roles[0] ?? job.title, internship };
      byName.set(job.companyName, entry);
      companies.push(entry);
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
