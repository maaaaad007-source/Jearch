import { NextResponse } from "next/server";

import {
  isSupabaseConfigured,
  resolveContactProvider,
  resolveJobProvider,
  serverEnv,
} from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Configuration diagnostic: which providers the app will actually use, and
 * which environment variables it can see.
 *
 * Reports booleans only — never a key, never a prefix of one — so it is safe
 * to open on a deployed URL and safe to paste into a chat when asking for
 * help. Its whole job is answering "did my key get picked up, and did I spell
 * the variable right", which is otherwise invisible from the UI.
 */
export async function GET() {
  const jobProvider = resolveJobProvider();
  const contactProvider = resolveContactProvider();

  return NextResponse.json({
    jobProvider,
    contactProvider,
    usingDemoData: jobProvider === "demo" || contactProvider === "demo",
    environmentVariablesDetected: {
      RAPIDAPI_KEY: Boolean(serverEnv.jsearchKey),
      THEIRSTACK_API_KEY: Boolean(serverEnv.theirstackKey),
      APOLLO_API_KEY: Boolean(serverEnv.apolloKey),
      HUNTER_API_KEY: Boolean(serverEnv.hunterKey),
      SERPER_API_KEY: Boolean(serverEnv.serperKey),
      JOBTECH_API_KEY: Boolean(serverEnv.jobtechKey),
      JOBTECH_ENABLED: serverEnv.jobtechEnabled,
      JOB_PROVIDER: serverEnv.jobProviderOverride ?? null,
      JSEARCH_PATH: process.env.JSEARCH_PATH?.trim() || null,
      SERPER_RESOLVE_DOMAINS: process.env.SERPER_RESOLVE_DOMAINS?.trim() || null,
      SERPER_PLAIN_QUERIES: process.env.SERPER_PLAIN_QUERIES?.trim() || null,
      CONTACT_PROVIDER: serverEnv.contactProviderOverride ?? null,
      SUPABASE: isSupabaseConfigured(),
    },
    hint:
      jobProvider === "demo"
        ? "No job-search key detected. Check the variable name, and remember that new environment variables only apply after a redeploy."
        : "Job-search key detected. If searches still fail, the key itself is being rejected — the error shown on screen will say why.",
  });
}
