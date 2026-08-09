import type { ContactPerson, VerificationStatus } from "@/types";
import { HUNTER_DEPARTMENTS } from "@/lib/providers/constants";
import { ProviderError } from "@/lib/providers/errors";
import { titleCase } from "@/lib/utils";

const ENDPOINT = "https://api.hunter.io/v2/domain-search";

interface HunterEmail {
  value?: string | null;
  type?: string | null;
  confidence?: number | null;
  first_name?: string | null;
  last_name?: string | null;
  position?: string | null;
  linkedin?: string | null;
  phone_number?: string | null;
  verification?: { status?: string | null } | null;
}

interface HunterResponse {
  data?: {
    domain?: string | null;
    organization?: string | null;
    emails?: HunterEmail[];
  };
  errors?: Array<{ details?: string }>;
}

/**
 * Hunter reports both a verification status and a confidence score, and the
 * two disagree often enough that we treat confidence as the fallback signal.
 */
function toVerification(email: HunterEmail): VerificationStatus {
  const status = (email.verification?.status ?? "").toLowerCase();
  if (status === "valid") return "verified";
  if (status === "invalid" || status === "disposable") return "unverified";

  const confidence = email.confidence ?? 0;
  if (confidence >= 90) return "verified";
  if (confidence >= 60) return "guess";
  return "unverified";
}

export function mapHunterEmail(email: HunterEmail, organization: string | null, domain: string | null): ContactPerson {
  const name =
    [email.first_name, email.last_name].filter(Boolean).join(" ").trim() ||
    (email.value ? titleCase(email.value.split("@")[0].replace(/[._-]+/g, " ")) : "Unknown contact");

  return {
    id: `hunter:${email.value ?? crypto.randomUUID()}`,
    name,
    title: email.position ?? null,
    linkedinUrl: email.linkedin ?? null,
    email: email.value ?? null,
    emailStatus: toVerification(email),
    phone: email.phone_number ?? null,
    phoneExtension: null,
    companyName: organization,
    companyDomain: domain,
    confidence: email.confidence ?? null,
    source: "Hunter.io",
  };
}

export async function searchHunterContacts(
  domain: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<ContactPerson[]> {
  const url = new URL(ENDPOINT);
  url.searchParams.set("domain", domain);
  url.searchParams.set("department", HUNTER_DEPARTMENTS);
  url.searchParams.set("limit", "10");
  url.searchParams.set("api_key", apiKey);

  const response = await fetch(url, { signal });

  if (!response.ok) {
    throw new ProviderError({
      provider: "Hunter.io",
      kind: "contacts",
      status: response.status,
      body: await response.text().catch(() => ""),
      envVar: "HUNTER_API_KEY",
    });
  }

  const payload = (await response.json()) as HunterResponse;
  const emails = payload.data?.emails ?? [];

  // Hunter mixes in generic role addresses (info@, jobs@); a person's name is
  // what makes the outreach land, so personal addresses come first.
  return emails
    .filter((email) => email.type !== "generic" || Boolean(email.first_name))
    .map((email) => mapHunterEmail(email, payload.data?.organization ?? null, payload.data?.domain ?? domain));
}
