/**
 * Server-side configuration. Every key is optional: when a provider is not
 * configured the app degrades to seeded demo data rather than erroring out, so
 * a fresh clone runs with `npm run dev` and nothing else.
 */

export type JobProvider = "jobtech" | "adzuna" | "jsearch" | "theirstack" | "serper" | "demo";
export type ContactProvider = "apollo" | "hunter" | "serper" | "demo";

function read(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : undefined;
}

export const serverEnv = {
  get jsearchKey() {
    return read("RAPIDAPI_KEY") ?? read("JSEARCH_API_KEY");
  },
  get theirstackKey() {
    return read("THEIRSTACK_API_KEY");
  },
  get apolloKey() {
    return read("APOLLO_API_KEY");
  },
  get hunterKey() {
    return read("HUNTER_API_KEY");
  },
  get serperKey() {
    return read("SERPER_API_KEY");
  },
  /** Optional: JobTech has been open, and the adapter works without a key. */
  get jobtechKey() {
    return read("JOBTECH_API_KEY");
  },
  /** JobTech covers Sweden only, so it is enabled per-country, not per-key. */
  get jobtechEnabled() {
    return read("JOBTECH_DISABLED")?.toLowerCase() !== "true";
  },
  get adzunaAppId() {
    return read("ADZUNA_APP_ID");
  },
  get adzunaAppKey() {
    return read("ADZUNA_APP_KEY");
  },
  get supabaseUrl() {
    return read("NEXT_PUBLIC_SUPABASE_URL");
  },
  get supabaseAnonKey() {
    return read("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  },
  /** Force a provider regardless of which keys happen to be present. */
  get jobProviderOverride() {
    return read("JOB_PROVIDER") as JobProvider | undefined;
  },
  get contactProviderOverride() {
    return read("CONTACT_PROVIDER") as ContactProvider | undefined;
  },
};

export function resolveJobProvider(): JobProvider {
  const override = serverEnv.jobProviderOverride;
  if (override === "demo") return "demo";
  if (override === "jsearch" && serverEnv.jsearchKey) return "jsearch";
  if (override === "theirstack" && serverEnv.theirstackKey) return "theirstack";
  if (override === "serper" && serverEnv.serperKey) return "serper";
  if (override === "jobtech") return "jobtech";
  if (override === "adzuna" && serverEnv.adzunaAppId) return "adzuna";

  if (serverEnv.jsearchKey) return "jsearch";
  if (serverEnv.theirstackKey) return "theirstack";
  if (serverEnv.serperKey) return "serper";
  return "demo";
}

export function resolveContactProvider(): ContactProvider {
  const override = serverEnv.contactProviderOverride;
  if (override === "demo") return "demo";
  if (override === "apollo" && serverEnv.apolloKey) return "apollo";
  if (override === "hunter" && serverEnv.hunterKey) return "hunter";
  if (override === "serper" && serverEnv.serperKey) return "serper";

  // Serper is preferred when present: it costs a fraction of the enrichment
  // vendors and works from a company name alone, so it returns something for
  // employers the domain-based services have never heard of.
  if (serverEnv.serperKey) return "serper";
  if (serverEnv.apolloKey) return "apollo";
  if (serverEnv.hunterKey) return "hunter";
  return "demo";
}

export function isSupabaseConfigured(): boolean {
  return Boolean(serverEnv.supabaseUrl && serverEnv.supabaseAnonKey);
}
