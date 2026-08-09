"use client";

import * as React from "react";
import { BadgeCheck, ChevronDown, CircleHelp, Mail, Phone, UserSearch } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { LinkedInIcon } from "@/components/icons/linkedin";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/copy-button";
import { MailDraftDialog } from "@/components/mail-draft-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, initials } from "@/lib/utils";
import type { ContactPerson, JobPost, VerificationStatus } from "@/types";

const VERIFICATION_LABEL: Record<VerificationStatus, string> = {
  verified: "Verified",
  guess: "Guess / Unverified",
  unverified: "Unverified",
};

function VerificationBadge({ status, confidence }: { status: VerificationStatus; confidence: number | null }) {
  const variant = status === "verified" ? "success" : status === "guess" ? "warning" : "muted";
  const Icon = status === "verified" ? BadgeCheck : CircleHelp;

  return (
    <Badge variant={variant} title={confidence != null ? `Provider confidence: ${confidence}%` : undefined}>
      <Icon />
      {VERIFICATION_LABEL[status]}
      {confidence != null && status !== "unverified" ? ` · ${confidence}%` : ""}
    </Badge>
  );
}

interface ContactPanelProps {
  job: JobPost;
  contact: ContactPerson | null;
  alternateContacts: ContactPerson[];
  error: string | null;
  loading: boolean;
}

export function ContactPanel({ job, contact, alternateContacts, error, loading }: ContactPanelProps) {
  const [showAlternates, setShowAlternates] = React.useState(false);

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-3 border-t border-border bg-muted/40 p-5">
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-full" />
          <div className="grid flex-1 gap-1.5">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-2/3" />
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="flex items-start gap-3 border-t border-border bg-muted/40 p-5 text-sm text-muted-foreground">
        <UserSearch className="mt-0.5 size-4 shrink-0" />
        <p>{error ?? "No decision maker found for this company."}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 border-t border-border bg-muted/40 p-5">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/15 text-sm font-semibold text-primary"
        >
          {initials(contact.name)}
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{contact.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {contact.title ?? "Title unavailable"}
            {contact.companyName ? ` · ${contact.companyName}` : ""}
          </p>
        </div>

        {contact.linkedinUrl && (
          <Button asChild variant="outline" size="sm" className="shrink-0">
            <a href={contact.linkedinUrl} target="_blank" rel="noopener noreferrer">
              <LinkedInIcon />
              LinkedIn
            </a>
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2">
        <ContactRow
          icon={<Mail className="size-4 text-muted-foreground" />}
          value={contact.email}
          emptyLabel="No email found"
          copyLabel="Copy email"
        />
        <ContactRow
          icon={<Phone className="size-4 text-muted-foreground" />}
          value={
            contact.phone
              ? contact.phoneExtension
                ? `${contact.phone} ext. ${contact.phoneExtension}`
                : contact.phone
              : null
          }
          emptyLabel="No direct phone found"
          copyLabel="Copy phone"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <VerificationBadge status={contact.emailStatus} confidence={contact.confidence} />
          <span className="text-[11px] text-muted-foreground">via {contact.source}</span>
        </div>

        <MailDraftDialog job={job} contact={contact} />
      </div>

      {alternateContacts.length > 0 && (
        <div className="border-t border-border pt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowAlternates((value) => !value)}
            className="h-7 px-2 text-xs text-muted-foreground"
            aria-expanded={showAlternates}
          >
            <ChevronDown className={cn("transition-transform", showAlternates && "rotate-180")} />
            {alternateContacts.length} other contact{alternateContacts.length > 1 ? "s" : ""} at this company
          </Button>

          {showAlternates && (
            <ul className="mt-2 grid grid-cols-1 gap-2">
              {alternateContacts.map((alternate) => (
                <li
                  key={alternate.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-card px-3 py-2 text-xs"
                >
                  <span className="min-w-0">
                    <span className="font-medium">{alternate.name}</span>
                    <span className="text-muted-foreground"> · {alternate.title ?? "Title unavailable"}</span>
                  </span>

                  <span className="flex items-center gap-1">
                    {alternate.linkedinUrl && (
                      <a
                        href={alternate.linkedinUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                        aria-label={`LinkedIn profile for ${alternate.name}`}
                      >
                        <LinkedInIcon className="size-3.5" />
                      </a>
                    )}
                    {alternate.email && <CopyButton value={alternate.email} label="Copy email" />}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function ContactRow({
  icon,
  value,
  emptyLabel,
  copyLabel,
}: {
  icon: React.ReactNode;
  value: string | null;
  emptyLabel: string;
  copyLabel: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2">
      {icon}
      <span className={cn("min-w-0 flex-1 truncate text-xs", !value && "text-muted-foreground italic")}>
        {value ?? emptyLabel}
      </span>
      {value && <CopyButton value={value} label={copyLabel} />}
    </div>
  );
}
