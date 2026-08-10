"use client";

import * as React from "react";
import { Bookmark, BookmarkCheck, Building2, ChevronDown, ExternalLink, MapPin, Wallet } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ContactPanel } from "@/components/contact-panel";
import { cn, formatSalary, isFresh, relativeTime } from "@/lib/utils";
import { stripHtml } from "@/lib/text";
import { useSavedStore } from "@/store/use-saved-store";
import type { JobPost, Person, WorkType } from "@/types";

const WORK_TYPE_STYLE: Record<WorkType, string> = {
  Remote: "bg-[color-mix(in_oklch,var(--success)_18%,transparent)] text-[var(--success)]",
  Hybrid: "bg-[color-mix(in_oklch,var(--warning)_20%,transparent)] text-[var(--warning)]",
  "On-site": "bg-secondary text-secondary-foreground",
  Unknown: "bg-muted text-muted-foreground",
};

interface JobCardProps {
  job: JobPost;
  /**
   * Which searched role this posting answered. Set only when several were
   * searched at once, where a mixed list otherwise leaves "why is this here?"
   * unanswered on every card.
   */
  matchedRole?: string | null;
  people: Person[] | undefined;
  /** True while the people lookup for this batch is still in flight. */
  loadingPeople: boolean;
}

export function JobCard({ job, matchedRole, people, loadingPeople }: JobCardProps) {
  const [expanded, setExpanded] = React.useState(false);

  const toggle = useSavedStore((s) => s.toggle);
  const saved = useSavedStore((s) => s.opportunities.some((item) => item.job.id === job.id));

  const salary = formatSalary(job.salary);
  const posted = relativeTime(job.postedAt);
  const location = [job.city, job.region].filter(Boolean).join(", ");
  const description = job.description ? stripHtml(job.description) : null;
  const best = people?.[0] ?? null;

  return (
    <Card className="animate-in-up flex flex-col overflow-hidden transition-shadow hover:shadow-md">
      <div className="flex flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base leading-snug font-semibold text-balance">{job.title}</h3>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <Building2 className="size-3.5 shrink-0" />
              <span className="truncate">{job.companyName}</span>
            </p>
          </div>

          <Button
            variant="ghost"
            size="icon"
            aria-label={saved ? "Remove from saved" : "Save this opportunity"}
            aria-pressed={saved}
            onClick={() => toggle(job, best)}
            className="shrink-0"
          >
            {saved ? <BookmarkCheck className="text-[var(--success)]" /> : <Bookmark />}
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {matchedRole && (
            <Badge className="border-transparent bg-primary/15 font-medium text-primary">{matchedRole}</Badge>
          )}

          <Badge className={cn("font-medium", WORK_TYPE_STYLE[job.workType])}>{job.workType}</Badge>

          {location && (
            <Badge variant="outline" className="gap-1 font-normal">
              <MapPin className="size-3" />
              {location}
            </Badge>
          )}

          {salary && (
            <Badge variant="outline" className="gap-1 font-normal">
              <Wallet className="size-3" />
              {salary}
            </Badge>
          )}

          {posted && (
            <Badge
              variant="outline"
              className={cn(
                "font-normal",
                isFresh(job.postedAt) &&
                  "border-transparent bg-[color-mix(in_oklch,var(--success)_18%,transparent)] text-[var(--success)]",
              )}
            >
              {posted}
            </Badge>
          )}
        </div>

        <p className="text-sm leading-relaxed text-muted-foreground">{job.summary}</p>

        {description && (
          <div className="grid gap-2">
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              aria-expanded={expanded}
              className="flex w-fit items-center gap-1.5 text-sm font-medium text-foreground transition-colors hover:text-primary"
            >
              <ChevronDown className={cn("size-4 transition-transform", expanded && "rotate-180")} />
              {expanded ? "Hide full description" : "Read full description"}
            </button>

            {expanded && (
              <p className="max-h-72 overflow-auto rounded-md bg-muted/50 p-3 text-sm leading-relaxed whitespace-pre-line text-muted-foreground">
                {description}
              </p>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          {job.applyUrl ? (
            <a
              href={job.applyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground transition-colors hover:text-primary"
            >
              <ExternalLink className="size-4" />
              View posting
            </a>
          ) : (
            <span />
          )}
          <span className="shrink-0">{job.source}</span>
        </div>
      </div>

      <ContactPanel
        job={job}
        people={people ?? []}
        loading={loadingPeople}
      />
    </Card>
  );
}
