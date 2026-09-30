import type { JobPost, Person } from "@/types";
import { isInternship } from "@/lib/ranking";

function firstName(fullName: string | null | undefined): string {
  if (!fullName) return "there";
  return fullName.trim().split(/\s+/)[0] || "there";
}

/**
 * The default LinkedIn message. Deliberately short and specific: it names the
 * role and the company, states one reason for the fit, and asks a single
 * question — the shape most likely to get a reply. Short enough to fit a
 * connection note once the placeholder is filled in.
 */
export function buildMessage(job: JobPost, person: Person | null, senderName = "[Your name]"): string {
  const greetingName = firstName(person?.name);
  const internship = isInternship(job.title);
  const opening = internship ? `the ${job.title} internship` : `the ${job.title} role`;

  return [
    `Hi ${greetingName},`,
    "",
    `I came across ${opening} at ${job.companyName} and wanted to reach out directly.`,
    internship
      ? "I'm [studying X at Y] and [one sentence on the most relevant project you have done]."
      : "In short: [one sentence on the most relevant thing you have shipped].",
    "",
    "Are you the right person to speak with about it — and is it still open?",
    "",
    `Thanks, ${senderName}`,
  ].join("\n");
}
