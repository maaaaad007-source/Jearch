import type { JobPost, SearchParams, SearchResponse, SourceReport } from "@/types";
import { dedupe, employersFound, rankJobs } from "@/lib/ranking";
import { setupReport } from "@/lib/config";
import { adzuna } from "@/lib/sources/adzuna";
import { jobtech } from "@/lib/sources/jobtech";
import { greenhouse } from "@/lib/sources/greenhouse";
import { lever } from "@/lib/sources/lever";
import { ashby } from "@/lib/sources/ashby";
import { SourceError, type JobSource } from "@/lib/sources/types";

/**
 * Collect from every source that covers the country, then rank once.
 *
 * The old design asked one source for one page and showed what came back,
 * which is how a search that LinkedIn answered with 98 roles came back with 2.
 * Here every applicable source is asked for several pages *at once* — the
 * requests are independent, so the whole fan-out costs about as long as its
 * slowest leg — and the combined pile is de-duplicated and ranked as a unit.
 *
 * Sources never compete or fall back: they are additive. Two sources covering
 * the same market produce a better list together than either alone, and
 * de-duplication makes the overlap harmless.
 */

const ALL_SOURCES: JobSource[] = [jobtech, adzuna, greenhouse, lever, ashby];

/** Sources that can take part in this particular search. */
function applicable(params: SearchParams): JobSource[] {
  return ALL_SOURCES.filter((source) => {
    if (!source.supports(params.country) || !source.ready()) return false;

    // An employer's own board cannot be searched across companies.
    return !source.requiresCompany || Boolean(params.company?.trim());
  });
}

interface Collected {
  jobs: JobPost[];
  reports: SourceReport[];
}

async function collect(params: SearchParams, signal?: AbortSignal): Promise<Collected> {
  const perSource = await Promise.all(
    applicable(params).map(async (source) => {
      const pages = Array.from({ length: source.maxPages }, (_, index) => index + 1);

      const settled = await Promise.allSettled(
        pages.map((page) => source.fetchPage(params, page, signal)),
      );

      const jobs = settled.flatMap((result) => (result.status === "fulfilled" ? result.value : []));

      // One page failing out of three is not worth reporting when the others
      // answered; every page failing is the source being down.
      const failures = settled.filter((result) => result.status === "rejected");
      const error =
        failures.length === settled.length && failures.length > 0
          ? describeFailure(failures[0] as PromiseRejectedResult, source)
          : null;

      return { source, jobs, error };
    }),
  );

  return {
    jobs: perSource.flatMap((entry) => entry.jobs),
    reports: perSource.map((entry) => ({
      id: entry.source.id,
      label: entry.source.label,
      contributed: entry.jobs.length,
      error: entry.error,
    })),
  };
}

function describeFailure(rejection: PromiseRejectedResult, source: JobSource): string {
  const reason = rejection.reason;
  if (reason instanceof SourceError) return reason.message;
  if (reason instanceof Error) return `${source.label} could not be reached: ${reason.message}`;
  return `${source.label} could not be reached.`;
}

/**
 * Why this search cannot run, in words that say what to do about it.
 *
 * Returning an empty list when nothing is configured is the failure mode this
 * whole rewrite exists to remove: it looks identical to a market with no jobs
 * in it.
 */
function blockedReason(params: SearchParams): string | null {
  if (applicable(params).length > 0) return null;

  // The employer boards are always ready, so reaching here with a company named
  // means the country has no database — worth saying, since the boards alone
  // would have answered had the country been covered.
  const covered = ALL_SOURCES.filter(
    (source) => source.supports(params.country) && !source.requiresCompany,
  );

  if (covered.length === 0) {
    return `No job database here covers ${params.country} yet. Adzuna covers 19 countries and Platsbanken covers Sweden; try one of those, or name a company to search its own careers board.`;
  }

  return setupReport().jobs.detail;
}

export async function search(params: SearchParams, signal?: AbortSignal): Promise<SearchResponse> {
  const blocked = blockedReason(params);
  if (blocked) {
    return {
      exact: [],
      close: [],
      elsewhere: [],
      employersFound: [],
      excluded: { company: 0, stale: 0, title: 0 },
      sources: [],
      examined: 0,
      blocked,
    };
  }

  const { jobs, reports } = await collect(params, signal);
  const unique = dedupe(jobs);
  const { exact, close, elsewhere, excluded } = rankJobs(unique, params);

  // Only worth listing employers when the company filter is what emptied the
  // results — otherwise it is noise about a search that worked.
  const foundNothingAtCompany = exact.length === 0 && close.length === 0;

  return {
    exact,
    close,
    elsewhere: foundNothingAtCompany ? elsewhere : [],
    employersFound: foundNothingAtCompany ? employersFound(elsewhere) : [],
    excluded,
    sources: reports,
    examined: unique.length,
    blocked: null,
  };
}

/** Which sources a country would use — for the setup page, not the search. */
export function sourcesFor(country: string): Array<{ label: string; ready: boolean; companyOnly: boolean }> {
  return ALL_SOURCES.filter((source) => source.supports(country)).map((source) => ({
    label: source.label,
    ready: source.ready(),
    companyOnly: Boolean(source.requiresCompany),
  }));
}
