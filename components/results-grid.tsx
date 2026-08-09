"use client";

import { AlertTriangle, FlaskConical, SearchX, Target } from "lucide-react";

import { JobCard } from "@/components/job-card";
import { ResultsSkeletonGrid } from "@/components/job-card-skeleton";
import { Badge } from "@/components/ui/badge";
import { countryName } from "@/lib/countries";
import { useSearchStore } from "@/store/use-search-store";

const PROVIDER_LABELS: Record<string, string> = {
  jsearch: "JSearch",
  theirstack: "TheirStack",
  apollo: "Apollo.io",
  hunter: "Hunter.io",
  demo: "Demo data",
};

export function ResultsGrid() {
  const status = useSearchStore((s) => s.status);
  const error = useSearchStore((s) => s.error);
  const results = useSearchStore((s) => s.results);
  const demo = useSearchStore((s) => s.demo);
  const jobProvider = useSearchStore((s) => s.jobProvider);
  const contactProvider = useSearchStore((s) => s.contactProvider);
  const lastQuery = useSearchStore((s) => s.lastQuery);

  if (status === "idle") {
    return (
      <EmptyState
        icon={<Target className="size-6" />}
        title="Search a role to see who is hiring for it"
        description="Enter a job title and country. You get the live postings plus the recruiter or hiring manager behind each one — name, LinkedIn, work email and phone where available."
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
    return (
      <EmptyState
        icon={<SearchX className="size-6" />}
        title="No postings matched that search"
        description={
          lastQuery
            ? `Nothing active for “${lastQuery.designation}” in ${countryName(lastQuery.country)} right now. Try a broader title or a different country.`
            : "Try a broader title or a different country."
        }
      />
    );
  }

  const enriching = status === "enriching";

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{results.length}</span> opening
          {results.length === 1 ? "" : "s"}
          {lastQuery ? ` for “${lastQuery.designation}” in ${countryName(lastQuery.country)}` : ""}
          {enriching ? " · finding decision makers…" : ""}
        </p>

        <div className="flex flex-wrap items-center gap-1.5">
          {demo && (
            <Badge variant="warning" title="No provider API keys configured — results are synthetic sample data.">
              <FlaskConical />
              Demo data
            </Badge>
          )}
          {jobProvider && <Badge variant="muted">Jobs: {PROVIDER_LABELS[jobProvider] ?? jobProvider}</Badge>}
          {contactProvider && (
            <Badge variant="muted">Contacts: {PROVIDER_LABELS[contactProvider] ?? contactProvider}</Badge>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {results.map((result) => (
          <JobCard key={result.job.id} result={result} enriching={enriching} />
        ))}
      </div>
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
