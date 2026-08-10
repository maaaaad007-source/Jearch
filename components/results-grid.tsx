"use client";

import { AlertTriangle, Info, SearchX, Settings2 } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { JobCard } from "@/components/job-card";
import { JobCardSkeleton } from "@/components/job-card-skeleton";
import { countryName } from "@/lib/countries";
import { useSearchStore } from "@/store/use-search-store";
import type { RankedJob } from "@/types";

export function ResultsGrid() {
  const status = useSearchStore((s) => s.status);
  const error = useSearchStore((s) => s.error);
  const exact = useSearchStore((s) => s.exact);
  const close = useSearchStore((s) => s.close);
  const elsewhere = useSearchStore((s) => s.elsewhere);
  const employersFound = useSearchStore((s) => s.employersFound);
  const excluded = useSearchStore((s) => s.excluded);
  const roles = useSearchStore((s) => s.roles);
  const sources = useSearchStore((s) => s.sources);
  const examined = useSearchStore((s) => s.examined);
  const blocked = useSearchStore((s) => s.blocked);
  const searched = useSearchStore((s) => s.searched);
  const peopleByCompany = useSearchStore((s) => s.peopleByCompany);
  const peopleStatus = useSearchStore((s) => s.peopleStatus);
  const peopleError = useSearchStore((s) => s.peopleError);

  if (status === "idle") return <EmptyState />;

  if (status === "searching") {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <JobCardSkeleton key={index} />
        ))}
      </div>
    );
  }

  if (status === "error") {
    return (
      <Notice tone="error" icon={<AlertTriangle className="size-4" />}>
        {error ?? "That search did not go through."}
      </Notice>
    );
  }

  if (blocked) {
    return (
      <div className="grid grid-cols-1 gap-3">
        <Notice tone="warning" icon={<Settings2 className="size-4" />}>
          {blocked}
        </Notice>
        <div>
          <Button asChild variant="outline" size="sm">
            <Link href="/setup">Open setup check</Link>
          </Button>
        </div>
      </div>
    );
  }

  const total = exact.length + close.length;
  // Built from the roles the server actually searched, not the raw text, so a
  // capped or de-duplicated list cannot claim more than it looked for.
  const roleLabel =
    roles.length > 0 ? roles.map((role) => `“${role}”`).join(" or ") : searched?.designation ? `“${searched.designation}”` : "";
  const label = searched
    ? [roleLabel, searched.company && `at ${searched.company}`, `in ${countryName(searched.country) ?? searched.country}`]
        .filter(Boolean)
        .join(" ")
    : "";

  const loadingPeople = peopleStatus === "loading";

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{total}</span> {total === 1 ? "match" : "matches"}{" "}
          for {label}
          {examined > total && (
            <span className="text-muted-foreground"> · {examined} distinct postings considered</span>
          )}
        </p>

        <div className="flex flex-wrap gap-1.5">
          {sources.map((source) => (
            <Badge key={source.id} variant={source.error ? "destructive" : "outline"} className="font-normal">
              {source.label}
              {source.error ? " unavailable" : ` · ${source.contributed} fetched`}
            </Badge>
          ))}
        </div>
      </div>

      {sources
        .filter((source) => source.error)
        .map((source) => (
          <Notice key={source.id} tone="warning" icon={<AlertTriangle className="size-4" />}>
            {source.error}
          </Notice>
        ))}

      {peopleError && (
        <Notice tone="warning" icon={<AlertTriangle className="size-4" />}>
          Contact lookup failed: {peopleError}
        </Notice>
      )}

      {total === 0 && (
        <Notice tone="info" icon={<SearchX className="size-4" />}>
          <EmptyExplanation
            label={label}
            examined={examined}
            excluded={excluded}
            company={searched?.company ?? ""}
            employers={employersFound}
          />
        </Notice>
      )}

      {exact.length > 0 && (
        <Tier
          title="Matches"
          jobs={exact}
          peopleByCompany={peopleByCompany}
          loadingPeople={loadingPeople}
        />
      )}

      {close.length > 0 && (
        <Tier
          title="Close matches"
          description="Related roles that did not match the title exactly — shown so nothing useful is hidden."
          jobs={close}
          peopleByCompany={peopleByCompany}
          loadingPeople={loadingPeople}
        />
      )}

      {elsewhere.length > 0 && (
        <Tier
          title={`Same role at other employers`}
          description={`Nothing came up at ${searched?.company ?? "that company"}, so here is the role elsewhere in the same country.`}
          jobs={elsewhere}
          peopleByCompany={peopleByCompany}
          loadingPeople={loadingPeople}
        />
      )}
    </div>
  );
}

/**
 * Why a search came back empty.
 *
 * "0 results" out of 88 postings is the least useful thing the app can say —
 * it hides whether the role does not exist, the employer is spelled
 * differently, or everything was stale. Each of those has a different fix, so
 * each gets named.
 */
function EmptyExplanation({
  label,
  examined,
  excluded,
  company,
  employers,
}: {
  label: string;
  examined: number;
  excluded: { company: number; stale: number; title: number };
  company: string;
  employers: string[];
}) {
  if (examined === 0) {
    return <span>No postings came back at all for {label}. Try a broader job title.</span>;
  }

  if (company && excluded.company > 0) {
    return (
      <span>
        No postings at <strong>{company}</strong>, but {excluded.company} of the {examined} postings
        considered were the right role at other employers — they are listed below.
        {employers.length > 0 && (
          <>
            {" "}
            The employers found were: {employers.join(", ")}. If one of those is the company you meant,
            search it by the name shown here.
          </>
        )}
      </span>
    );
  }

  const reasons = [
    excluded.title > 0 && `${excluded.title} were a different role`,
    excluded.stale > 0 && `${excluded.stale} were older than 90 days`,
  ].filter(Boolean);

  return (
    <span>
      Nothing matched {label}. Of {examined} postings considered, {reasons.join(" and ")}.
    </span>
  );
}

function Tier({
  title,
  description,
  jobs,
  peopleByCompany,
  loadingPeople,
}: {
  title: string;
  description?: string;
  jobs: RankedJob[];
  peopleByCompany: Record<string, import("@/types").Person[]>;
  loadingPeople: boolean;
}) {
  return (
    <section className="grid grid-cols-1 gap-3">
      <div className="grid gap-0.5">
        <h2 className="text-sm font-semibold tracking-tight">
          {title} <span className="text-muted-foreground">({jobs.length})</span>
        </h2>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {jobs.map(({ job, matchedRole }) => (
          <JobCard
            key={job.id}
            job={job}
            matchedRole={matchedRole}
            people={peopleByCompany[job.companyName]}
            loadingPeople={loadingPeople && !peopleByCompany[job.companyName]}
          />
        ))}
      </div>
    </section>
  );
}

function EmptyState() {
  return (
    <div className="grid place-items-center gap-3 rounded-lg border border-dashed border-border px-6 py-16 text-center">
      <SearchX className="size-8 text-muted-foreground" />
      <div className="grid gap-1">
        <p className="font-medium">Search a job title and country to begin.</p>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">
          Postings come from Adzuna and, for Sweden, Platsbanken — real job databases, several pages at a
          time. Contacts come from LinkedIn via Serper.
        </p>
      </div>
      <Button asChild variant="ghost" size="sm">
        <Link href="/setup">Check what&rsquo;s connected</Link>
      </Button>
    </div>
  );
}

function Notice({
  tone,
  icon,
  children,
}: {
  tone: "info" | "warning" | "error";
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const style = {
    info: "border-border bg-muted/40 text-muted-foreground",
    warning: "border-[var(--warning)]/40 bg-[color-mix(in_oklch,var(--warning)_10%,transparent)] text-foreground",
    error: "border-destructive/40 bg-destructive/10 text-foreground",
  }[tone];

  return (
    <div className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${style}`}>
      <span className="mt-0.5 shrink-0">{icon ?? <Info className="size-4" />}</span>
      <span>{children}</span>
    </div>
  );
}
