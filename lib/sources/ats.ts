import type { SearchParams, WorkType } from "@/types";
import { locationCountry } from "@/lib/countries";
import { companyTokens } from "@/lib/ranking";

/**
 * Shared plumbing for applicant-tracking boards (Greenhouse, Lever, Ashby).
 *
 * These are the employer's own listings — the primary record an aggregator is
 * a copy of — published as free, unauthenticated JSON. Two things make them
 * different from a jobs database, and both are handled here rather than three
 * times over:
 *
 * 1. They are addressed by a board token, not searched. The token is a slug
 *    the company chose, so it has to be guessed from the name they typed.
 * 2. Each board is worldwide. A search scoped to the Netherlands must not be
 *    handed the New York opening, so locations are filtered by country.
 */

/**
 * Plausible board tokens for a company name, best guess first.
 *
 * "Booking.com" could be published as `bookingcom` or `booking`; there is no
 * lookup that maps one to the other, so a handful of candidates are tried and
 * the first board that exists wins. Capped at four so a wrong name costs four
 * cheap 404s rather than an unbounded fan-out.
 */
export function boardCandidates(company: string): string[] {
  const tokens = companyTokens(company);
  if (tokens.length === 0) return [];

  const joined = tokens.join("");

  const candidates = [
    joined,
    tokens.join("-"),
    tokens[0],
    // A dot-com in the name rarely survives into the board token: Booking.com
    // publishes as `booking` as readily as `bookingcom`, and there is no way
    // to know which without asking.
    joined.replace(/com$/, ""),
    company.toLowerCase().replace(/[^a-z0-9]/g, ""),
  ];

  return [...new Set(candidates.filter((candidate) => candidate.length >= 2))].slice(0, 4);
}

/** Is this posting in the country that was searched? */
export function inCountry(location: string | null, country: string): boolean {
  const found = locationCountry(location);

  // Unplaceable locations are kept: "Remote", "EMEA" and a town too small for
  // the city table are all real postings, and dropping them to be tidy would
  // repeat the mistake that made searches feel empty.
  if (!found) return true;

  return found.toUpperCase() === country.toUpperCase();
}

/** "Amsterdam, Netherlands" → city "Amsterdam", region "Netherlands". */
export function splitLocation(location: string | null): { city: string | null; region: string | null } {
  if (!location) return { city: null, region: null };

  const parts = location.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return { city: null, region: null };

  return { city: parts[0], region: parts.slice(1).join(", ") || null };
}

export function workTypeFrom(location: string | null, text: string): WorkType {
  const haystack = `${location ?? ""} ${text}`.toLowerCase();
  if (/\bhybrid\b/.test(haystack)) return "Hybrid";
  if (/\bremote\b|\bwork from home\b/.test(haystack)) return "Remote";
  if (location) return "On-site";
  return "Unknown";
}

/**
 * Fetch a board, treating "no such board" as an answer rather than an error.
 *
 * A guessed token that does not exist is the expected case, not a failure —
 * reporting it as one would fill the results header with noise every time a
 * company does not use that particular ATS.
 */
export async function fetchBoard<T>(url: string, signal?: AbortSignal): Promise<T | null> {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    signal,
    next: { revalidate: 300 },
  });

  if (response.status === 404 || response.status === 403 || response.status === 410) return null;
  if (!response.ok) return null;

  return (await response.json().catch(() => null)) as T | null;
}

/**
 * Try each candidate token and take the first board that answers.
 *
 * Candidates run in parallel — they are independent and mostly 404s — but the
 * winner is chosen by candidate order, so the best guess still wins when two
 * tokens both resolve.
 */
export async function firstBoardThatAnswers<T>(
  params: SearchParams,
  toUrl: (token: string) => string,
  extract: (payload: T, token: string) => unknown[],
  signal?: AbortSignal,
): Promise<{ token: string; records: unknown[] } | null> {
  const candidates = boardCandidates(params.company ?? "");
  if (candidates.length === 0) return null;

  const settled = await Promise.all(
    candidates.map(async (token) => {
      const payload = await fetchBoard<T>(toUrl(token), signal).catch(() => null);
      if (!payload) return null;

      const records = extract(payload, token);
      return records.length > 0 ? { token, records } : null;
    }),
  );

  return settled.find((entry): entry is { token: string; records: unknown[] } => entry !== null) ?? null;
}
