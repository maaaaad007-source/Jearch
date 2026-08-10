import { NextResponse } from "next/server";

import {
  configWarnings,
  deploymentInfo,
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
  const { environment } = deploymentInfo();

  // The scoping trap: a branch that is not the production branch builds as a
  // Preview, and a variable ticked for Production only is simply not here. It
  // reads as a typo, so say which environment is asking.
  const scope =
    environment && environment !== "production"
      ? ` This is the ${environment} environment, not production — an environment variable only reaches this build if it is ticked for ${environment} in Vercel's settings.`
      : "";

  if (order[0] === "demo") {
    return `No job-search source detected — the app is on sample data. Check the variable names above, and remember that new environment variables only apply after a redeploy.${scope}`;
  }

  return `Searches for ${country} use these sources in order: ${order.join(" → ")}. If a source you configured is missing from that list, its environment variables were not detected — check the spelling above and redeploy.${scope}`;
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

  return NextResponse.json(
    {
      // Which build is answering: the environment decides which variables
      // exist, and the commit shows whether a redeploy actually took effect.
      deployment: deploymentInfo(),
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
    },
    // A cached copy of this answer is worse than none: it would report the
    // configuration of a build that is no longer running.
    { headers: { "cache-control": "no-store" } },
  );
}
