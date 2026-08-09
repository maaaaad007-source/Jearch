import { NextResponse } from "next/server";

import {
  configWarnings,
  isSupabaseConfigured,
  providerEnvNamesSeen,
  resolveContactProvider,
  resolveJobProvider,
  serverEnv,
} from "@/lib/env";
import { isValidCountryCode } from "@/lib/countries";
import { jobProviderChain } from "@/lib/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function buildHint(country: string): string {
  const warnings = configWarnings();
  if (warnings.length > 0) return warnings.join(" ");

  const order = jobProviderChain(country);

  if (order[0] === "demo") {
    return "No job-search source detected — the app is on sample data. Check the variable names above, and remember that new environment variables only apply after a redeploy.";
  }

  return `Searches for ${country} use these sources in order: ${order.join(" → ")}. If a source you configured is missing from that list, its environment variables were not detected — check the spelling above and redeploy.`;
}

/**
 * Configuration diagnostic: which providers the app will actually use, and
 * which environment variables it can see.
 *
 * Reports booleans only — never a key, never a prefix of one — so it is safe
 * to open on a deployed URL and safe to paste into a chat when asking for
 * help. Its whole job is answering "did my key get picked up, and did I spell
 * the variable right", which is otherwise invisible from the UI.
 */
export async function GET(request: Request) {
  const jobProvider = resolveJobProvider();
  const contactProvider = resolveContactProvider();

  // Which sources a given country would actually use, in order. This is the
  // question when a provider was configured but the results came from
  // somewhere else — a key that is not detected is invisible otherwise.
  const requested = new URL(request.url).searchParams.get("country")?.trim().toUpperCase();
  const country = requested && isValidCountryCode(requested) ? requested : "NL";

  return NextResponse.json({
    jobProvider,
    contactProvider,
    jobSourcesFor: { country, order: jobProviderChain(country) },
    warnings: configWarnings(),
    // Names only, never values — a typo is visible here and nowhere else.
    providerVariablesPresent: providerEnvNamesSeen(),
    usingDemoData: jobProvider === "demo" || contactProvider === "demo",
    environmentVariablesDetected: {
      RAPIDAPI_KEY: Boolean(serverEnv.jsearchKey),
      THEIRSTACK_API_KEY: Boolean(serverEnv.theirstackKey),
      APOLLO_API_KEY: Boolean(serverEnv.apolloKey),
      HUNTER_API_KEY: Boolean(serverEnv.hunterKey),
      SERPER_API_KEY: Boolean(serverEnv.serperKey),
      JOBTECH_API_KEY: Boolean(serverEnv.jobtechKey),
      JOBTECH_ENABLED: serverEnv.jobtechEnabled,
      ADZUNA_APP_ID: Boolean(serverEnv.adzunaAppId),
      ADZUNA_APP_KEY: Boolean(serverEnv.adzunaAppKey),
      JOB_PROVIDER: serverEnv.jobProviderOverride ?? null,
      JSEARCH_PATH: process.env.JSEARCH_PATH?.trim() || null,
      SERPER_RESOLVE_DOMAINS: process.env.SERPER_RESOLVE_DOMAINS?.trim() || null,
      SERPER_PLAIN_QUERIES: process.env.SERPER_PLAIN_QUERIES?.trim() || null,
      CONTACT_PROVIDER: serverEnv.contactProviderOverride ?? null,
      SUPABASE: isSupabaseConfigured(),
    },
    hint: buildHint(country),
  });
}
