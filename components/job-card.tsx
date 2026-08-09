"use client";

import * as React from "react";
import {
  Bookmark,
  BookmarkCheck,
  Building2,
  ChevronDown,
  ExternalLink,
  MapPin,
  Sparkles,
  Wallet,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ContactPanel } from "@/components/contact-panel";
import { cn, formatSalary, isFresh, relativeTime } from "@/lib/utils";
import { stripHtml } from "@/lib/text";
import { useSavedStore } from "@/store/use-saved-store";
import type { JobWithContact, WorkType } from "@/types";

const WORK_TYPE_STYLE: Record<WorkType, string> = {
  Remote: "bg-[color-mix(in_oklch,var(--success)_18%,transparent)] text-[var(--success)]",
  Hybrid: "bg-[color-mix(in_oklch,var(--warning)_20%,transparent)] text-[var(--warning)]",
  "On-site": "bg-secondary text-secondary-foreground",
  Unknown: "bg-muted text-muted-foreground",
};

interface JobCardProps {
  result: JobWithContact;
  /** True while contact enrichment for this batch is still in flight. */
  enriching: boolean;
}

export function JobCard({ result, enriching }: JobCardProps) {
  const { job, contact, alternateContacts, contactError } = result;
  const [expanded, setExpanded] = React.useState(false);

  const toggle = useSavedStore((s) => s.toggle);
  const saved = useSavedStore((s) => s.opportunities.some((item) => item.job.id === job.id));

  const salary = formatSalary(job.salary);
  const posted = relativeTime(job.postedAt);
  const location = [job.city, job.country].filter(Boolean).join(", ");
  const fullDescription = job.description ? stripHtml(job.description) : null;

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
            type="button"
            variant={saved ? "secondary" : "ghost"}
            size="icon"
            onClick={() => toggle(job, contact)}
            aria-pressed={saved}
            aria-label={saved ? "Remove from saved opportunities" : "Save this opportunity"}
            title={saved ? "Saved" : "Save opportunity"}
            className="shrink-0"
          >
            {saved ? <BookmarkCheck className="text-primary" /> : <Bookmark />}
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="muted" className={cn(WORK_TYPE_STYLE[job.workType])}>
            {job.workType}
          </Badge>

          {location && (
            <Badge variant="outline">
              <MapPin />
              {location}
            </Badge>
          )}

          {salary && (
            <Badge variant="outline">
              <Wallet />
              {salary}
            </Badge>
          )}

          {posted && (
            <Badge variant={isFresh(job.postedAt) ? "success" : "muted"}>
              {isFresh(job.postedAt) && <Sparkles />}
              {isFresh(job.postedAt) ? `New · ${posted}` : posted}
            </Badge>
          )}
        </div>

        <p className="text-sm leading-relaxed text-muted-foreground">{job.summary}</p>

        {(fullDescription || job.applyUrl) && (
          <div className="flex flex-wrap items-center gap-2">
            {fullDescription && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setExpanded((value) => !value)}
                aria-expanded={expanded}
                className="h-7 px-2 text-xs text-muted-foreground"
              >
                <ChevronDown className={cn("transition-transform", expanded && "rotate-180")} />
                {expanded ? "Hide full description" : "Key responsibilities"}
              </Button>
            )}

            {job.applyUrl && (
              <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground">
                <a href={job.applyUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink />
                  View posting
                </a>
              </Button>
            )}
          </div>
        )}

        {expanded && fullDescription && (
          <div className="max-h-72 overflow-y-auto rounded-md border border-border bg-muted/50 p-3 text-xs leading-relaxed whitespace-pre-line text-muted-foreground">
            {fullDescription}
          </div>
        )}
      </div>

      <div className="mt-auto">
        <ContactPanel
          job={job}
          contact={contact}
          alternateContacts={alternateContacts}
          error={contactError}
          loading={enriching && !contact && !contactError}
        />
      </div>
    </Card>
  );
}
