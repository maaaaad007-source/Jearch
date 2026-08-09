/**
 * Provider failures, translated into something a user can act on.
 *
 * The raw text these APIs return ranges from a bare status code to a blob of
 * JSON, none of which tells someone what to actually do. Every adapter throws
 * one of these instead, and the message goes straight to the screen.
 */

export type ProviderKind = "jobs" | "contacts";

interface ProviderErrorOptions {
  provider: string;
  kind: ProviderKind;
  status: number;
  body: string;
  /** Env var the user would need to fix, e.g. "RAPIDAPI_KEY". */
  envVar: string;
  /** Extra provider-specific hint for auth failures. */
  authHint?: string;
}

/** Pull the human part out of a JSON error body, falling back to raw text. */
function extractDetail(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return "";

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const candidate =
      parsed.message ??
      parsed.error ??
      parsed.detail ??
      (Array.isArray(parsed.errors) ? (parsed.errors[0] as Record<string, unknown>)?.details : undefined);

    if (typeof candidate === "string" && candidate) return candidate;
    if (candidate && typeof candidate === "object") return JSON.stringify(candidate).slice(0, 300);
  } catch {
    // Not JSON — fall through to the raw body.
  }

  return trimmed.replace(/\s+/g, " ").slice(0, 300);
}

function explain({ provider, kind, status, envVar, authHint }: ProviderErrorOptions): string {
  const what = kind === "jobs" ? "job search" : "contact lookup";

  if (status === 401 || status === 403) {
    return [
      `${provider} rejected the ${what} key.`,
      `Check that ${envVar} is set to the right value${authHint ? `, and ${authHint}` : ""}.`,
      "Remember that environment variables only take effect after a redeploy.",
    ].join(" ");
  }

  if (status === 429) {
    return `${provider} rate-limited the ${what} — you have hit the request or monthly quota for your plan. Wait for it to reset, or upgrade the plan.`;
  }

  if (status === 402) {
    return `${provider} says this ${what} needs a paid plan. The endpoint is not available on your current tier.`;
  }

  if (status === 404) {
    return `${provider} returned "not found" for the ${what}. The API may have moved — this usually means the adapter needs updating rather than anything you configured.`;
  }

  if (status >= 500) {
    return `${provider} is having trouble on their end (${status}). This is usually temporary — try the search again shortly.`;
  }

  return `${provider} refused the ${what} (HTTP ${status}).`;
}

export class ProviderError extends Error {
  readonly status: number;
  readonly provider: string;

  constructor(options: ProviderErrorOptions) {
    const detail = extractDetail(options.body);
    const explanation = explain(options);

    super(detail ? `${explanation} (${options.provider} said: ${detail})` : explanation);

    this.name = "ProviderError";
    this.status = options.status;
    this.provider = options.provider;
  }
}
