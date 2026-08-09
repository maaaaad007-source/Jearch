"use client";

import { AlertTriangle, FlaskConical, Loader2, Plus, SearchX, Target } from "lucide-react";

import { JobCard } from "@/components/job-card";
import { ResultsSkeletonGrid } from "@/components/job-card-skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { countryName } from "@/lib/countries";
import { useSearchStore } from "@/store/use-search-store";

const JOB_PROVIDER_LABELS: Record<string, string> = {
  jsearch: "JSearch",
  theirstack: "TheirStack",
  serper: "Job boards via Serper",
  demo: "Demo data",
};

const CONTACT_PROVIDER_LABELS: Record<string, string> = {
  apollo: "Apollo.io",
  hunter: "Hunter.io",
  serper: "LinkedIn via Serper",
  demo: "Demo data",
};

/** "Growth Marketer at Spotify in Germany" — whichever parts were filled in. */
function describeQuery(query: { designation: string; company: string; country: string }): string {
  const parts: string[] = [];
  if (query.designation) parts.push(`“${query.designation}”`);
  if (query.company) parts.push(`at ${query.company}`);
  parts.push(`in ${countryName(query.country)}`);
  return parts.join(" ");
}

export function ResultsGrid() {
  const status = useSearchStore((s) => s.status);
  const error = useSearchStore((s) => s.error);
  const results = useSearchStore((s) => s.results);
  const demo = useSearchStore((s) => s.demo);
  const jobProvider = useSearchStore((s) => s.jobProvider);
  const contactProvider = useSearchStore((s) => s.contactProvider);
  const lastQuery = useSearchStore((s) => s.lastQuery);
  const hasMore = useSearchStore((s) => s.hasMore);
  const notice = useSearchStore((s) => s.notice);
  const loadMore = useSearchStore((s) => s.loadMore);

  if (status === "idle") {
    return (
      <EmptyState
        icon={<Target className="size-6" />}
        title="Search a role to see who is hiring for it"
        description="Enter a job title, a company, or both. You get the live postings plus the recruiter or hiring manager behind each one — name, LinkedIn, work email and phone where available."
      />
    );
  }

  if (status === "error") {
    return (
      <EmptyState
        icon={<AlertTriangle className="size-6 text-[var(--destructive)]" />}
        title="That search did not go through"
        description={error ?? "Something went wrong. Try again in a moment."}
      />
    );
  }

  if (status === "loading-jobs") {
    return <ResultsSkeletonGrid />;
  }

  if (results.length === 0) {
    // The provider badges belong here most of all: "no results" is meaningless
    // without knowing which source was actually asked.
    return (
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {demo && (
            <Badge variant="warning">
              <FlaskConical />
              Demo data
            </Badge>
          )}
          {jobProvider && <Badge variant="muted">Searched: {JOB_PROVIDER_LABELS[jobProvider] ?? jobProvider}</Badge>}
        </div>

        <EmptyState
          icon={<SearchX className="size-6" />}
          title="No postings matched that search"
          description={
            notice ??
            (lastQuery
              ? `Nothing active for ${describeQuery(lastQuery)} right now. Try a broader title, drop the company filter, or pick another country.`
              : "Try a broader title or a different country.")
          }
        />
      </div>
    );
  }

  const enriching = status === "enriching";
  const loadingMore = status === "loading-more";

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{results.length}</span> opening
          {results.length === 1 ? "" : "s"}
          {lastQuery ? ` for ${describeQuery(lastQuery)}` : ""}
          {enriching ? " · finding decision makers…" : ""}
        </p>

        <div className="flex flex-wrap items-center gap-1.5">
          {demo && (
            <Badge variant="warning" title="No provider API keys configured — results are synthetic sample data.">
              <FlaskConical />
              Demo data
            </Badge>
          )}
          {jobProvider && <Badge variant="muted">Jobs: {JOB_PROVIDER_LABELS[jobProvider] ?? jobProvider}</Badge>}
          {contactProvider && (
            <Badge variant="muted">Contacts: {CONTACT_PROVIDER_LABELS[contactProvider] ?? contactProvider}</Badge>
          )}
        </div>
      </div>

      {(error || notice) && (
        <p className="rounded-md border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          {error ?? notice}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {results.map((result) => (
          <JobCard key={result.job.id} result={result} enriching={enriching || loadingMore} />
        ))}
      </div>

      {hasMore && (
        <div className="flex justify-center pt-2">
          <Button variant="outline" size="lg" onClick={() => void loadMore()} disabled={loadingMore}>
            {loadingMore ? <Loader2 className="animate-spin" /> : <Plus />}
            {loadingMore ? "Loading…" : "Load more results"}
          </Button>
        </div>
      )}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="grid place-items-center rounded-lg border border-dashed border-border bg-card/50 px-6 py-16 text-center">
      <div className="grid max-w-md gap-2">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
          {icon}
        </span>
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
