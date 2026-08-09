/**
 * Job descriptions arrive as HTML soup or markdown-ish plain text depending on
 * the provider. These helpers get them down to something a card can show.
 */

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

export function stripHtml(input: string): string {
  return input
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&[a-z#0-9]+;/gi, (entity) => HTML_ENTITIES[entity.toLowerCase()] ?? " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const HEADING_WORDS =
  "what you'?ll do|what you will do|responsibilities|key responsibilities|the role|role overview|about the role|your impact|key duties|day-to-day";

/**
 * Only treat these as headings when they sit on their own line or are followed
 * by a colon — the same words appear mid-sentence often enough ("drive the
 * day-to-day execution of…") that an unanchored match slices the summary in
 * half.
 */
const RESPONSIBILITY_HEADINGS = [
  new RegExp(`(?:^|\\n)[\\s•\\-*#]*(?:${HEADING_WORDS})[\\s:]*(?=\\n|$)`, "i"),
  new RegExp(`(?:^|\\n|\\.\\s)[\\s•\\-*#]*(?:${HEADING_WORDS})\\s*:`, "i"),
];

/**
 * Pull a ~2 sentence gist of the responsibilities out of a description.
 *
 * Prefers the text right after a "What you'll do"-style heading, since that is
 * where the actual duties live; falls back to the opening of the description.
 */
export function summarizeResponsibilities(description: string | null, maxSentences = 2): string {
  if (!description) return "No description provided by the job board for this posting.";

  const text = stripHtml(description);
  if (!text) return "No description provided by the job board for this posting.";

  let startIndex = 0;
  for (const pattern of RESPONSIBILITY_HEADINGS) {
    const match = text.match(pattern);
    if (match?.index != null) {
      startIndex = match.index + match[0].length;
      break;
    }
  }

  const region = text.slice(startIndex).replace(/^[\s:•\-–]+/, "");

  const sentences = region
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.replace(/^[•\-–*\s]+/, "").trim())
    .filter((s) => s.length > 25);

  const picked = sentences.slice(0, maxSentences).join(" ");
  const summary = picked || text.slice(0, 220);

  return truncate(summary, 320);
}

export function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}
