import type { ContactPerson, JobPost } from "@/types";

export interface MailDraft {
  to: string;
  subject: string;
  body: string;
}

function firstName(fullName: string | null | undefined): string {
  if (!fullName) return "there";
  return fullName.trim().split(/\s+/)[0] || "there";
}

/**
 * The default outreach draft. Deliberately short and specific: it names the
 * role and the company, states one reason for the fit, and asks a single
 * question — the shape most likely to get a reply from a recruiter's inbox.
 */
export function buildMailDraft(
  job: JobPost,
  contact: ContactPerson | null,
  senderName = "[Your name]",
): MailDraft {
  const greetingName = firstName(contact?.name);
  const location = job.city ? `${job.city}` : job.workType === "Remote" ? "remote" : job.country ?? "";
  const locationClause = location ? ` (${location})` : "";

  const subject = `${job.title} at ${job.companyName} — quick question`;

  const body = [
    `Hi ${greetingName},`,
    "",
    `I saw the ${job.title} opening at ${job.companyName}${locationClause} and wanted to reach out directly rather than disappear into the applicant pile.`,
    "",
    `In short: [one sentence on the most relevant thing you have shipped]. It lines up closely with what the role calls for, and I would be glad to walk through the specifics.`,
    "",
    `Are you the right person to speak with about this req — and is it still open?`,
    "",
    "Thanks for your time,",
    senderName,
  ].join("\n");

  return { to: contact?.email ?? "", subject, body };
}

/** `mailto:` URL for the draft, safe for very long bodies via encodeURIComponent. */
export function mailtoUrl(draft: MailDraft): string {
  const params = new URLSearchParams({ subject: draft.subject, body: draft.body });
  return `mailto:${draft.to}?${params.toString().replace(/\+/g, "%20")}`;
}
