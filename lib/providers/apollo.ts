import type { ContactPerson, VerificationStatus } from "@/types";
import { DECISION_MAKER_TITLES } from "@/lib/providers/constants";
import { ProviderError } from "@/lib/providers/errors";
import { normalizeDomain } from "@/lib/utils";

const ENDPOINT = "https://api.apollo.io/api/v1/mixed_people/search";

interface ApolloPerson {
  id?: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  title?: string | null;
  linkedin_url?: string | null;
  email?: string | null;
  email_status?: string | null;
  phone_numbers?: Array<{ raw_number?: string | null; sanitized_number?: string | null; type?: string | null }> | null;
  organization?: { name?: string | null; primary_domain?: string | null; website_url?: string | null } | null;
}

/**
 * Apollo returns a placeholder address for people whose email you have not
 * spent a credit to reveal. Surfacing that as a real address would be worse
 * than showing nothing, so it is scrubbed here.
 */
function isLockedEmail(email: string | null | undefined): boolean {
  if (!email) return true;
  return email.startsWith("email_not_unlocked") || email.includes("domain.com");
}

function toVerification(status: string | null | undefined): VerificationStatus {
  switch ((status ?? "").toLowerCase()) {
    case "verified":
      return "verified";
    case "guessed":
    case "likely_to_engage":
      return "guess";
    default:
      return "unverified";
  }
}

export function mapApolloPerson(person: ApolloPerson): ContactPerson {
  const email = isLockedEmail(person.email) ? null : (person.email as string);
  const phoneEntry = person.phone_numbers?.find((p) => p.sanitized_number || p.raw_number);

  return {
    id: `apollo:${person.id ?? crypto.randomUUID()}`,
    name:
      person.name?.trim() ||
      [person.first_name, person.last_name].filter(Boolean).join(" ").trim() ||
      "Unknown contact",
    title: person.title ?? null,
    linkedinUrl: person.linkedin_url ?? null,
    email,
    emailStatus: email ? toVerification(person.email_status) : "unverified",
    phone: phoneEntry?.sanitized_number ?? phoneEntry?.raw_number ?? null,
    phoneExtension: null,
    companyName: person.organization?.name ?? null,
    companyDomain: normalizeDomain(person.organization?.primary_domain ?? person.organization?.website_url),
    confidence: null,
    source: "Apollo.io",
  };
}

export async function searchApolloContacts(
  domain: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<ContactPerson[]> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "Cache-Control": "no-cache",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      q_organization_domains_list: [domain],
      person_titles: DECISION_MAKER_TITLES,
      page: 1,
      per_page: 5,
    }),
    signal,
  });

  if (!response.ok) {
    throw new ProviderError({
      provider: "Apollo.io",
      kind: "contacts",
      status: response.status,
      body: await response.text().catch(() => ""),
      envVar: "APOLLO_API_KEY",
      authHint: "that your Apollo plan includes API access — people search is restricted on some tiers",
    });
  }

  const payload = (await response.json()) as { people?: ApolloPerson[]; contacts?: ApolloPerson[] };
  const people = [...(payload.people ?? []), ...(payload.contacts ?? [])];

  return people.map(mapApolloPerson);
}
