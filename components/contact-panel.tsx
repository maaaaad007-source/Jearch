"use client";

import * as React from "react";
import { ChevronDown, Loader2, UserSearch } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LinkedInIcon } from "@/components/icons/linkedin";
import { MessageDraftDialog } from "@/components/message-draft-dialog";
import { cn } from "@/lib/utils";
import type { ContactKind, JobPost, Person } from "@/types";

/**
 * Who to contact at the employer, most useful first: the recruiters, the
 * early-careers team for an internship, and the people the hire would work
 * for.
 *
 * Only LinkedIn profiles are shown. Email addresses built from a
 * "first.last@domain" pattern used to sit here too, and were wrong often
 * enough that they are gone — a profile was genuinely found and reaches the
 * person for certain.
 */

const KIND_STYLE: Record<ContactKind, string> = {
  Recruiting: "bg-primary/15 text-primary",
  "Early careers": "bg-[color-mix(in_oklch,var(--success)_18%,transparent)] text-[var(--success)]",
  "Hiring team": "bg-[color-mix(in_oklch,var(--warning)_20%,transparent)] text-[var(--warning)]",
  Leadership: "bg-secondary text-secondary-foreground",
};

/** Beyond the first, how many more to offer. The rest are rarely the right person. */
const MORE_LIMIT = 5;

interface ContactPanelProps {
  job: JobPost;
  people: Person[];
  loading: boolean;
}

export function ContactPanel({ job, people, loading }: ContactPanelProps) {
  const [showAll, setShowAll] = React.useState(false);

  const best = people[0] ?? null;
  const others = people.slice(1, 1 + MORE_LIMIT);

  if (loading) {
    return (
      <div className="flex items-center gap-2 border-t border-border bg-muted/30 px-5 py-4 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Looking for who is hiring…
      </div>
    );
  }

  if (!best) {
    return (
      <div className="flex items-start gap-2 border-t border-border bg-muted/30 px-5 py-4 text-sm text-muted-foreground">
        <UserSearch className="mt-0.5 size-4 shrink-0" />
        <span>
          {/* Trailing dot trimmed: "Booking.com B.V." plus a full stop reads as
              an ellipsis-by-accident. */}
          No recruiter or hiring manager found at {job.companyName.replace(/\.+$/, "")}. The posting link
          still goes straight to their application page.
        </span>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 border-t border-border bg-muted/30 px-5 py-4">
      <PersonRow person={best} job={job} primary />

      {others.length > 0 && (
        <div className="grid grid-cols-1 gap-3">
          <button
            type="button"
            onClick={() => setShowAll((value) => !value)}
            aria-expanded={showAll}
            className="flex w-fit items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronDown className={cn("size-3.5 transition-transform", showAll && "rotate-180")} />
            {showAll ? "Hide" : `${others.length} more at ${job.companyName}`}
          </button>

          {showAll && others.map((person) => <PersonRow key={person.id} person={person} job={job} />)}
        </div>
      )}
    </div>
  );
}

function PersonRow({ person, job, primary = false }: { person: Person; job: JobPost; primary?: boolean }) {
  const initials = person.name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return (
    <div className={cn("grid grid-cols-1 gap-2.5", !primary && "border-t border-border/60 pt-3")}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold",
              primary ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
            )}
            aria-hidden
          >
            {initials}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{person.name}</p>
            <p className="truncate text-xs text-muted-foreground">{person.title ?? "Role not stated"}</p>
          </div>
        </div>

        {person.linkedinUrl && (
          <Button asChild size="sm" variant={primary ? "default" : "outline"} className="shrink-0">
            <a href={person.linkedinUrl} target="_blank" rel="noopener noreferrer">
              <LinkedInIcon />
              {primary ? "Message on LinkedIn" : "Profile"}
            </a>
          </Button>
        )}
      </div>

      {(primary || person.kind) && (
      <div className="flex flex-wrap items-center gap-2">
        {person.kind && (
          <Badge className={cn("border-transparent font-medium", KIND_STYLE[person.kind])}>{person.kind}</Badge>
        )}
        {primary && (
          <>
            <MessageDraftDialog job={job} person={person} />
            <Badge variant="outline" className="font-normal">
              {person.source}
            </Badge>
          </>
        )}
      </div>
      )}
    </div>
  );
}
