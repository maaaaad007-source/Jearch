import { NextResponse } from "next/server";

import { setupReport } from "@/lib/config";
import { isValidCountryCode } from "@/lib/countries";
import { sourcesFor } from "@/lib/sources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * What this deployment can currently do.
 *
 * Booleans and variable *names* only — never a value, never a prefix of one —
 * so it is safe to open on a public URL and safe to paste when asking for help.
 * The deployment block is here because "the variable is set" and "the variable
 * is set in the build that is answering" are different claims.
 */
export async function GET(request: Request) {
  const requested = new URL(request.url).searchParams.get("country")?.trim().toUpperCase();
  const country = requested && isValidCountryCode(requested) ? requested : "NL";

  return NextResponse.json(
    { ...setupReport(), country, sources: sourcesFor(country) },
    // A cached copy would describe a build that is no longer running.
    { headers: { "cache-control": "no-store" } },
  );
}
