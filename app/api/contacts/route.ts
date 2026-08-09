import { NextResponse } from "next/server";
import { z } from "zod";

import { findContacts } from "@/lib/providers";
import type { CompanyRef } from "@/lib/company";
import { normalizeDomain } from "@/lib/utils";
import type { ContactsApiResponse } from "@/types";

export const runtime = "nodejs";

/**
 * Enrichment calls cost credits per domain, so a single request is capped. The
 * client only ever sends domains it has not already enriched, so paging through
 * results stays within one cap per page rather than re-billing earlier pages.
 */
const MAX_DOMAINS = 25;

const bodySchema = z.object({
  companies: z
    .array(
      z.object({
        // Optional: search-based enrichment works from the name alone, and job
        // sources like LinkedIn-via-Serper never supply a website.
        domain: z.string().trim().optional().nullable(),
        companyName: z.string().trim().min(1, "A company name is required"),
      }),
    )
    .min(1, "At least one company is required")
    .max(50),
});

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request body" },
      { status: 400 },
    );
  }

  const companies: CompanyRef[] = [];
  for (const company of parsed.data.companies) {
    companies.push({
      companyName: company.companyName,
      domain: normalizeDomain(company.domain),
    });
    if (companies.length >= MAX_DOMAINS) break;
  }

  try {
    const { contactsByDomain, provider, demo, error } = await findContacts(companies);

    const body: ContactsApiResponse = { contactsByDomain, provider, demo, error };
    return NextResponse.json(body);
  } catch (error) {
    console.error("[api/contacts]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Contact enrichment failed" },
      { status: 502 },
    );
  }
}
