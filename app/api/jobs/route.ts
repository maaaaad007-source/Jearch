import { NextResponse } from "next/server";
import { z } from "zod";

import { findJobs } from "@/lib/providers";
import { isValidCountryCode } from "@/lib/countries";
import type { JobsApiResponse } from "@/types";

export const runtime = "nodejs";

const querySchema = z.object({
  designation: z.string().trim().min(2, "Enter a job title of at least 2 characters").max(120),
  country: z
    .string()
    .trim()
    .length(2, "Country must be an ISO 3166-1 alpha-2 code")
    .refine(isValidCountryCode, "Unsupported country code"),
  page: z.coerce.number().int().min(1).max(20).optional().default(1),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const parsed = querySchema.safeParse({
    designation: searchParams.get("designation") ?? "",
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
    const { jobs, provider, demo } = await findJobs(parsed.data);

    const body: JobsApiResponse = {
      jobs,
      provider,
      demo,
      page: parsed.data.page,
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
