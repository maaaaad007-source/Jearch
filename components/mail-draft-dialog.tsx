"use client";

import * as React from "react";
import { ExternalLink, Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/copy-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { buildMailDraft, mailtoUrl } from "@/lib/email-template";
import type { ContactPerson, JobPost } from "@/types";

interface MailDraftDialogProps {
  job: JobPost;
  contact: ContactPerson | null;
  trigger?: React.ReactNode;
}

/**
 * 1-click draft: opens with the template pre-filled from the job and contact,
 * stays editable, and hands off to the user's mail client via `mailto:`.
 */
export function MailDraftDialog({ job, contact, trigger }: MailDraftDialogProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="default" disabled={!contact?.email}>
            <Mail />
            Send Email
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-xl">
        {/* Mounted only while open, so each visit starts from a fresh draft
            rather than whatever was typed last time. */}
        <DraftForm job={job} contact={contact} onSent={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function DraftForm({
  job,
  contact,
  onSent,
}: {
  job: JobPost;
  contact: ContactPerson | null;
  onSent: () => void;
}) {
  const initial = React.useMemo(() => buildMailDraft(job, contact), [job, contact]);

  const [to, setTo] = React.useState(initial.to);
  const [subject, setSubject] = React.useState(initial.subject);
  const [body, setBody] = React.useState(initial.body);

  const fullText = `To: ${to}\nSubject: ${subject}\n\n${body}`;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Outreach draft</DialogTitle>
        <DialogDescription>
          Pre-filled for {job.title} at {job.companyName}. Edit anything, then open it in your mail client.
        </DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-1 gap-3">
        <div className="grid grid-cols-1 gap-1.5">
          <Label htmlFor="mail-to">To</Label>
          <Input
            id="mail-to"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            placeholder="name@company.com"
          />
        </div>

        <div className="grid grid-cols-1 gap-1.5">
          <Label htmlFor="mail-subject">Subject</Label>
          <Input id="mail-subject" value={subject} onChange={(event) => setSubject(event.target.value)} />
        </div>

        <div className="grid grid-cols-1 gap-1.5">
          <Label htmlFor="mail-body">Message</Label>
          <Textarea
            id="mail-body"
            value={body}
            rows={12}
            onChange={(event) => setBody(event.target.value)}
            className="min-h-56 font-mono text-xs leading-relaxed"
          />
        </div>
      </div>

      <DialogFooter className="items-center gap-2 sm:justify-between">
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <CopyButton value={fullText} label="Copy draft" />
          Copy the whole draft
        </span>

        <Button asChild disabled={!to}>
          <a href={mailtoUrl({ to, subject, body })} onClick={onSent}>
            <ExternalLink />
            Open in mail client
          </a>
        </Button>
      </DialogFooter>
    </>
  );
}
