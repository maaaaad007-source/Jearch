"use client";

import * as React from "react";
import { MessageSquareText } from "lucide-react";

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
import { LinkedInIcon } from "@/components/icons/linkedin";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { buildMessage } from "@/lib/message-template";
import type { JobPost, Person } from "@/types";

interface MessageDraftDialogProps {
  job: JobPost;
  person: Person | null;
  trigger?: React.ReactNode;
}

/**
 * 1-click draft: opens with the message pre-filled from the job and person,
 * stays editable, and is copied into LinkedIn — the one channel that reaches
 * the person for certain.
 */
export function MessageDraftDialog({ job, person, trigger }: MessageDraftDialogProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline">
            <MessageSquareText />
            Draft message
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-xl">
        {/* Mounted only while open, so each visit starts from a fresh draft
            rather than whatever was typed last time. */}
        <DraftForm job={job} person={person} />
      </DialogContent>
    </Dialog>
  );
}

function DraftForm({ job, person }: { job: JobPost; person: Person | null }) {
  const initial = React.useMemo(() => buildMessage(job, person), [job, person]);
  const [body, setBody] = React.useState(initial);

  return (
    <>
      <DialogHeader>
        <DialogTitle>Message draft</DialogTitle>
        <DialogDescription>
          Pre-filled for {job.title} at {job.companyName}. Edit it, copy it, and send it on LinkedIn
          {person ? ` to ${person.name}` : ""}.
        </DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-1 gap-1.5">
        <Label htmlFor="message-body">Message</Label>
        <Textarea
          id="message-body"
          value={body}
          rows={10}
          onChange={(event) => setBody(event.target.value)}
          className="min-h-48 font-mono text-xs leading-relaxed"
        />
        <p className="text-xs text-muted-foreground">
          {body.length} characters — a connection note allows 300, a message after connecting has no such limit.
        </p>
      </div>

      <DialogFooter className="items-center gap-2 sm:justify-between">
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <CopyButton value={body} label="Copy message" />
          Copy the message
        </span>

        {person?.linkedinUrl && (
          <Button asChild>
            <a href={person.linkedinUrl} target="_blank" rel="noopener noreferrer">
              <LinkedInIcon />
              Open LinkedIn profile
            </a>
          </Button>
        )}
      </DialogFooter>
    </>
  );
}
