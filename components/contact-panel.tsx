"use client";

import * as React from "react";
import { AlertCircle, ChevronDown, Loader2, Mail, UserSearch } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/copy-button";
import { LinkedInIcon } from "@/components/icons/linkedin";
import { MailDraftDialog } from "@/components/mail-draft-dialog";
import { cn } from "@/lib/utils";
import type { JobPost, Person } from "@/types";

/**
 * Who to contact, ordered by what we can actually stand behind.
 *
 * The LinkedIn profile leads because it was genuinely found — you can open it
 * and see a real person. The email follows and is labelled as constructed
 * whenever it was assembled from a naming convention, because the earlier
 * design showed a guessed address in the same style as a confirmed one and
 * that quietly invited people to mail strangers.
 */

interface ContactPanelProps {
  job: JobPost;
  people: Person[];
  loading: boolean;
}

export function ContactPanel({ job, people, loading }: ContactPanelProps) {
  const [showAll, setShowAll] = React.useState(false);

  const best = people[0] ?? null;
  const others = people.slice(1, 4);

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
          No named recruiter found at {job.companyName.replace(/\.+$/, "")}. The posting link still goes
          straight to their application page.
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

      {person.email ? (
        <div className="grid grid-cols-1 gap-1.5">
          <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2">
            <Mail className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate font-mono text-xs">{person.email}</span>
            <CopyButton value={person.email} label="Copy email" />
          </div>

          {person.emailIsPattern && (
            <p className="flex items-start gap-1.5 text-xs text-[var(--warning)]">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
              <span>
                Built from this company&rsquo;s usual first.last pattern — not confirmed. Worth trying, but
                LinkedIn is the reliable route.
              </span>
            </p>
          )}

          {primary && (
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              <MailDraftDialog job={job} person={person} />
              <Badge variant="outline" className="font-normal">
                {person.source}
              </Badge>
            </div>
          )}
        </div>
      ) : (
        primary && (
          <p className="text-xs text-muted-foreground">
            No email address found — the LinkedIn profile above is the way in.
          </p>
        )
      )}
    </div>
  );
}
