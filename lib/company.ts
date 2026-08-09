/**
 * How a company is identified across the jobs → contacts handoff.
 *
 * Domain-based enrichment (Hunter, Apollo) needs a website; search-based
 * enrichment (Serper) only needs a name, and some job sources supply no domain
 * at all. So companies travel as a name plus an optional domain, keyed by
 * whichever identifier exists — the domain when we have one, since two
 * spellings of the same employer share it, and the normalized name otherwise.
 */

export interface CompanyRef {
  companyName: string;
  domain: string | null;
}

export function slugifyCompany(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    // Drop legal suffixes so "Acme Ltd" and "Acme" are one company.
    .replace(/\b(inc|llc|ltd|limited|gmbh|bv|nv|sa|ag|plc|corp|corporation|co|company|group|holdings)\b/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function companyKey(company: CompanyRef): string {
  if (company.domain) return company.domain;
  return `name:${slugifyCompany(company.companyName)}`;
}
