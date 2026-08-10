import { NextResponse } from "next/server";
import { z } from "zod";

import { isValidCountryCode } from "@/lib/countries";
import { search } from "@/lib/sources";

export const runtime = "nodejs";

const schema = z
  .object({
    designation: z.string().trim().max(120),
    company: z.string().trim().max(120),
    country: z
      .string()
      .trim()
      .length(2, "Country must be an ISO 3166-1 alpha-2 code")
      .refine(isValidCountryCode, "Unsupported country code"),
  })
  // Either field alone is a valid search — title only, company only, or both.
  .refine((value) => value.designation.length >= 2 || value.company.length >= 2, {
    message: "Enter a job title or a company name (at least 2 characters)",
  });

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const parsed = schema.safeParse({
    designation: searchParams.get("designation") ?? "",
    company: searchParams.get("company") ?? "",
    country: searchParams.get("country") ?? "",
  });

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid search" }, { status: 400 });
  }

  try {
    const result = await search(parsed.data, request.signal);
    return NextResponse.json(result);
  } catch (error) {
    // Reaching here means something outside a single source broke; per-source
    // failures are reported inside the response instead.
    const message = error instanceof Error ? error.message : "The search could not be completed.";
    console.error("[search]", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
