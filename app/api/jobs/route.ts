import { NextResponse } from "next/server";
import { z } from "zod";

import { findJobs } from "@/lib/providers";
import { isValidCountryCode } from "@/lib/countries";
import type { JobsApiResponse } from "@/types";

export const runtime = "nodejs";

const querySchema = z
  .object({
    designation: z.string().trim().max(120),
    company: z.string().trim().max(120),
    country: z
      .string()
      .trim()
      .length(2, "Country must be an ISO 3166-1 alpha-2 code")
      .refine(isValidCountryCode, "Unsupported country code"),
    page: z.coerce.number().int().min(1).max(20).optional().default(1),
  })
  // Either field alone is a valid search — title only, company only, or both.
  .refine((value) => value.designation.length >= 2 || value.company.length >= 2, {
    message: "Enter a job title or a company name (at least 2 characters)",
  });

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const parsed = querySchema.safeParse({
    designation: searchParams.get("designation") ?? "",
    company: searchParams.get("company") ?? "",
    country: searchParams.get("country") ?? "",
    page: searchParams.get("page") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid search parameters" },
      { status: 400 },
    );
  }

  try {
    const { jobs, provider, demo, hasMore } = await findJobs({
      designation: parsed.data.designation,
      company: parsed.data.company || undefined,
      country: parsed.data.country,
      page: parsed.data.page,
    });

    const body: JobsApiResponse = {
      jobs,
      provider,
      demo,
      page: parsed.data.page,
      // 20 is the schema's page ceiling — stop offering "load more" there even
      // if the provider would keep going.
      hasMore: hasMore && parsed.data.page < 20,
    };

    return NextResponse.json(body);
  } catch (error) {
    console.error("[api/jobs]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Job search failed" },
      { status: 502 },
    );
  }
}
