import { NextResponse } from "next/server";

import { serverEnv } from "@/lib/env";
import { countryName, isValidCountryCode } from "@/lib/countries";
import { matchJobBoard, looksLikeListingPage, parseBoardTitle } from "@/lib/providers/job-boards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Shows what Serper returns for a real job search, and the verdict on each
 * result: kept as a posting, or rejected and why.
 *
 * Zero results can mean the search found nothing or that the filters discarded
 * everything, and from the outside those look identical. This separates them.
 * It reports titles and URLs — public search results — and never the API key.
 */
export async function GET(request: Request) {
  const apiKey = serverEnv.serperKey;
  if (!apiKey) {
    return NextResponse.json(
      { error: "No Serper key configured — set SERPER_API_KEY and redeploy." },
      { status: 400 },
    );
  }

  const { searchParams } = new URL(request.url);
  const designation = searchParams.get("designation")?.trim() || "UX Designer";
  const countryCode = (searchParams.get("country")?.trim() || "SE").toUpperCase();
  if (!isValidCountryCode(countryCode)) {
    return NextResponse.json({ error: `Unknown country code: ${countryCode}` }, { status: 400 });
  }

  const country = countryName(countryCode);
  const queries = [
    [designation, "jobs", country, "linkedin hiring apply"].join(" "),
    [designation, "jobs", country, "apply careers"].join(" "),
    `site:linkedin.com/jobs/view "${designation}" ${country}`,
  ];

  const attempts = [];

  for (const query of queries) {
    try {
      const response = await fetch(process.env.SERPER_ENDPOINT?.trim() || "https://google.serper.dev/search", {
        method: "POST",
        headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ q: query, gl: countryCode.toLowerCase(), num: 20 }),
        cache: "no-store",
      });

      if (!response.ok) {
        attempts.push({
          query,
          status: response.status,
          body: (await response.text().catch(() => "")).slice(0, 300),
        });
        continue;
      }

      const payload = (await response.json()) as { organic?: Array<Record<string, unknown>>; credits?: number };
      const organic = payload.organic ?? [];

      const verdicts = organic.map((result) => {
        const link = typeof result.link === "string" ? result.link : "";
        const title = typeof result.title === "string" ? result.title : "";
        const match = matchJobBoard(link);

        if (!match) return { title, link, verdict: "rejected: URL is not a recognised job posting" };
        if (looksLikeListingPage(title)) {
          return { title, link, verdict: `rejected: title reads as a listing page (${match.board})` };
        }

        const parsed = parseBoardTitle(title, match.companyFromUrl);
        return {
          title,
          link,
          verdict: "KEPT",
          board: match.board,
          parsedRole: parsed.title,
          parsedCompany: parsed.companyName,
        };
      });

      attempts.push({
        query,
        status: 200,
        creditsUsed: payload.credits ?? null,
        resultCount: organic.length,
        keptCount: verdicts.filter((v) => v.verdict === "KEPT").length,
        results: verdicts,
      });
    } catch (error) {
      attempts.push({ query, error: error instanceof Error ? error.message : String(error) });
    }
  }

  return NextResponse.json({
    note: "Search results and per-result verdicts. No API key is included — safe to share.",
    designation,
    country,
    attempts,
  });
}
