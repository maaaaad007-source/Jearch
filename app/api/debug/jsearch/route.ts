import { NextResponse } from "next/server";

import { serverEnv } from "@/lib/env";
import { describeShape, findJobArray } from "@/lib/providers/jsearch-shape";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HOST = "jsearch.p.rapidapi.com";

/**
 * Reports the *structure* of a live JSearch response — which endpoint answered,
 * where the job array sits, and what fields the first record carries.
 *
 * This exists because the adapter cannot be tested against the real API from
 * the development environment, so when JSearch changes its response format the
 * fastest fix is for whoever has a key to open this URL and share the output.
 *
 * It describes shapes rather than dumping the body: keys and types, with string
 * values truncated. No API key is ever included.
 */
export async function GET(request: Request) {
  const apiKey = serverEnv.jsearchKey;
  if (!apiKey) {
    return NextResponse.json(
      { error: "No JSearch key configured — set RAPIDAPI_KEY and redeploy." },
      { status: 400 },
    );
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query")?.trim() || "software engineer";
  const country = (searchParams.get("country")?.trim() || "us").toLowerCase();
  const paths = searchParams.get("path")?.trim()
    ? [searchParams.get("path")!.trim()]
    : ["/search-v2", "/search"];

  const attempts: unknown[] = [];

  for (const path of paths) {
    const url = new URL(`https://${HOST}${path}`);
    url.searchParams.set("query", query);
    url.searchParams.set("country", country);
    url.searchParams.set("page", "1");
    url.searchParams.set("num_pages", "1");

    try {
      const response = await fetch(url, {
        headers: { "X-RapidAPI-Key": apiKey, "X-RapidAPI-Host": HOST },
        cache: "no-store",
      });

      if (!response.ok) {
        attempts.push({
          path,
          status: response.status,
          body: (await response.text().catch(() => "")).slice(0, 300),
        });
        continue;
      }

      const payload = await response.json();
      const { jobs, path: arrayPath, emptyResult } = findJobArray(payload);

      attempts.push({
        path,
        status: response.status,
        jobArrayFoundAt: arrayPath,
        jobCount: jobs?.length ?? 0,
        emptyResultFromKnownContainer: emptyResult,
        firstRecordFields: jobs?.[0] ? Object.keys(jobs[0]).sort() : null,
        responseShape: describeShape(payload),
      });
    } catch (error) {
      attempts.push({ path, error: error instanceof Error ? error.message : String(error) });
    }
  }

  return NextResponse.json({
    note: "Structure only — no key, and string values are truncated. Safe to share.",
    query,
    country,
    attempts,
  });
}
