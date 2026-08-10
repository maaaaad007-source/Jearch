"use client";

import * as React from "react";
import Link from "next/link";
import {
  Bookmark,
  Building2,
  CloudOff,
  Download,
  Mail,
  MapPin,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CopyButton } from "@/components/copy-button";
import { LinkedInIcon } from "@/components/icons/linkedin";
import { MailDraftDialog } from "@/components/mail-draft-dialog";
import { Textarea } from "@/components/ui/textarea";
import { formatSalary, relativeTime } from "@/lib/utils";
import { useSavedStore } from "@/store/use-saved-store";
import type { SavedOpportunity } from "@/types";

function toCsv(opportunities: SavedOpportunity[]): string {
  const headers = [
    "Job title",
    "Company",
    "Location",
    "Work type",
    "Salary",
    "Posted",
    "Apply URL",
    "Contact name",
    "Contact title",
    "LinkedIn",
    "Email",
    "Email confidence",
    "Notes",
  ];

  const escape = (value: string | null | undefined) => `"${(value ?? "").replaceAll('"', '""')}"`;

  const rows = opportunities.map((item) =>
    [
      item.job.title,
      item.job.companyName,
      [item.job.city, item.job.region].filter(Boolean).join(", "),
      item.job.workType,
      formatSalary(item.job.salary) ?? "",
      item.job.postedAt ?? "",
      item.job.applyUrl ?? "",
      item.person?.name ?? "",
      item.person?.title ?? "",
      item.person?.linkedinUrl ?? "",
      item.person?.email ?? "",
      item.person?.emailIsPattern ? "pattern guess" : item.person?.email ? "found" : "",
      item.notes ?? "",
    ]
      .map(escape)
      .join(","),
  );

  return [headers.map(escape).join(","), ...rows].join("\n");
}

export function SavedDashboard() {
  const hydrated = useSavedStore((s) => s.hydrated);
  const opportunities = useSavedStore((s) => s.opportunities);
  const remoteEnabled = useSavedStore((s) => s.remoteEnabled);
  const remove = useSavedStore((s) => s.remove);
  const clear = useSavedStore((s) => s.clear);
  const setNotes = useSavedStore((s) => s.setNotes);
  const syncFromRemote = useSavedStore((s) => s.syncFromRemote);

  React.useEffect(() => {
    if (hydrated) void syncFromRemote();
  }, [hydrated, syncFromRemote]);

  function exportCsv() {
    const blob = new Blob([toCsv(opportunities)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `jearch-saved-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (!hydrated) {
    return <p className="text-sm text-muted-foreground">Loading your saved opportunities…</p>;
  }

  if (opportunities.length === 0) {
    return (
      <EmptyState />
    );
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{opportunities.length}</span> saved opportunit
          {opportunities.length === 1 ? "y" : "ies"}
          {remoteEnabled === false && (
            <span className="ml-2 inline-flex items-center gap-1 text-xs">
              <CloudOff className="size-3" />
              stored in this browser only
            </span>
          )}
        </p>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download />
            Export CSV
          </Button>
          <Button variant="ghost" size="sm" onClick={clear} className="text-[var(--destructive)]">
            <Trash2 />
            Clear all
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {opportunities.map((item) => (
          <SavedCard key={item.id} item={item} onRemove={remove} onNotes={setNotes} />
        ))}
      </div>
    </div>
  );
}

function SavedCard({
  item,
  onRemove,
  onNotes,
}: {
  item: SavedOpportunity;
  onRemove: (jobId: string) => void;
  onNotes: (jobId: string, notes: string) => void;
}) {
  const [notes, setLocalNotes] = React.useState(item.notes ?? "");
  const location = [item.job.city, item.job.region].filter(Boolean).join(", ");
  const salary = formatSalary(item.job.salary);

  return (
    <Card className="grid grid-cols-1 gap-3 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base leading-snug font-semibold text-balance">{item.job.title}</h3>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <Building2 className="size-3.5 shrink-0" />
            <span className="truncate">{item.job.companyName}</span>
          </p>
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => onRemove(item.job.id)}
          aria-label={`Remove ${item.job.title} at ${item.job.companyName}`}
          className="shrink-0 text-muted-foreground hover:text-[var(--destructive)]"
        >
          <Trash2 />
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="muted">{item.job.workType}</Badge>
        {location && (
          <Badge variant="outline">
            <MapPin />
            {location}
          </Badge>
        )}
        {salary && <Badge variant="outline">{salary}</Badge>}
        <Badge variant="muted">Saved {relativeTime(item.savedAt) ?? "recently"}</Badge>
      </div>

      {item.person ? (
        <div className="grid grid-cols-1 gap-2 rounded-md border border-border bg-muted/40 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{item.person.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {item.person.title ?? "Title unavailable"}
              </p>
            </div>

            <div className="flex items-center gap-1">
              {item.person.linkedinUrl && (
                <Button asChild variant="ghost" size="icon" className="size-7">
                  <a
                    href={item.person.linkedinUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`LinkedIn profile for ${item.person.name}`}
                  >
                    <LinkedInIcon className="size-3.5" />
                  </a>
                </Button>
              )}
            </div>
          </div>

          {item.person.email && (
            <div className="flex items-center gap-2 text-xs">
              <Mail className="size-3.5 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{item.person.email}</span>
              <CopyButton value={item.person.email} label="Copy email" />
            </div>
          )}

          {item.person.emailIsPattern && item.person.email && (
            <p className="text-xs text-[var(--warning)]">
              Address was built from a naming pattern, not confirmed.
            </p>
          )}

          <MailDraftDialog job={item.job} person={item.person} />
        </div>
      ) : (
        <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          No contact was attached when this opportunity was saved.
        </p>
      )}

      <div className="grid grid-cols-1 gap-1.5">
        <label htmlFor={`notes-${item.id}`} className="text-xs font-medium text-muted-foreground">
          Notes
        </label>
        <Textarea
          id={`notes-${item.id}`}
          value={notes}
          rows={2}
          placeholder="Followed up on the 12th, referred by…"
          onChange={(event) => setLocalNotes(event.target.value)}
          onBlur={() => onNotes(item.job.id, notes)}
          className="min-h-16 text-xs"
        />
      </div>

      {item.job.applyUrl && (
        <Button asChild variant="outline" size="sm">
          <Link href={item.job.applyUrl} target="_blank" rel="noopener noreferrer">
            View original posting
          </Link>
        </Button>
      )}
    </Card>
  );
}

function EmptyState() {
  return (
    <div className="grid place-items-center gap-3 rounded-lg border border-dashed border-border px-6 py-16 text-center">
      <Bookmark className="size-6 text-muted-foreground" />
      <div className="grid gap-1">
        <p className="font-medium">No saved opportunities yet</p>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">
          Bookmark a job from the search results and it will show up here with whoever we found to
          contact, ready for outreach.
        </p>
      </div>
    </div>
  );
}
