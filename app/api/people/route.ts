import { NextResponse } from "next/server";
import { z } from "zod";

import { findPeople } from "@/lib/people/serper";

export const runtime = "nodejs";

const schema = z.object({
  companies: z
    .array(
      z.object({
        companyName: z.string().trim().min(1).max(160),
        domain: z.string().trim().max(160).nullable().optional(),
      }),
    )
    // One search per company, so the batch is capped to keep credits sane.
    .min(1)
    .max(12),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid company list" }, { status: 400 });
  }

  const { peopleByCompany, error } = await findPeople(
    parsed.data.companies.map((entry) => ({ companyName: entry.companyName, domain: entry.domain ?? null })),
    request.signal,
  );

  return NextResponse.json({ peopleByCompany, error });
}
