import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Human readable "3 days ago" style label for a posting date. */
export function relativeTime(iso: string | null): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;

  const minutes = Math.round((Date.now() - then) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;

  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;

  return `${Math.round(months / 12)}y ago`;
}

/** Postings younger than a week get the "fresh" treatment in the UI. */
export function isFresh(iso: string | null, days = 7): boolean {
  if (!iso) return false;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return false;
  return Date.now() - then < days * 24 * 60 * 60 * 1000;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  INR: "₹",
  CAD: "C$",
  AUD: "A$",
  SGD: "S$",
  AED: "AED ",
};

export function formatSalary(
  salary: { min: number | null; max: number | null; currency: string | null; period: string | null } | null,
): string | null {
  if (!salary) return null;
  const { min, max, currency, period } = salary;
  if (min == null && max == null) return null;

  const symbol = currency ? (CURRENCY_SYMBOLS[currency] ?? `${currency} `) : "";
  const compact = (n: number) => {
    if (n >= 1_000_000) return `${Math.round(n / 100_000) / 10}M`.replace(".0M", "M");
    if (n >= 1000) return `${Math.round(n / 100) / 10}k`.replace(".0k", "k");
    return `${n}`;
  };

  const amount =
    min != null && max != null && min !== max
      ? `${symbol}${compact(min)} – ${symbol}${compact(max)}`
      : `${symbol}${compact((min ?? max)!)}`;

  const suffix = period ? `/${period.toLowerCase().replace("year", "yr").replace("month", "mo")}` : "";
  return `${amount}${suffix}`;
}

/**
 * Best-effort domain extraction. Enrichment providers key off the company
 * domain, so a bad guess here is worse than no guess — we only accept things
 * that already look like hostnames or URLs.
 */
export function normalizeDomain(input: string | null | undefined): string | null {
  if (!input) return null;
  let value = input.trim().toLowerCase();
  if (!value) return null;

  if (value.includes("@")) value = value.split("@").pop() ?? "";
  value = value.replace(/^https?:\/\//, "").replace(/^www\./, "");
  value = value.split("/")[0].split("?")[0].split(":")[0];

  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(value)) return null;
  return value;
}

export function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
