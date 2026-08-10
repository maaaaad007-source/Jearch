/**
 * Server-side configuration. Every key is optional: when a provider is not
 * configured the app degrades to seeded demo data rather than erroring out, so
 * a fresh clone runs with `npm run dev` and nothing else.
 */

export type JobProvider = "jobtech" | "adzuna" | "jsearch" | "theirstack" | "serper" | "demo";
export type ContactProvider = "apollo" | "hunter" | "serper" | "demo";

/** `ADZUNA_APP_KEY`, `adzuna-app-key` and `AdzunaAppKey` all reduce to this. */
function canonical(name: string): string {
  return name.replace(/[^a-z0-9]/gi, "").toUpperCase();
}

/**
 * Environment lookup that forgives how the name was typed.
 *
 * A key rejected over a hyphen instead of an underscore, or lowercase instead
 * of upper, is indistinguishable from a key that was never set — and costs a
 * redeploy to discover. Matching on the canonical form removes that whole
 * class of failure, at the cost of one lazy pass over process.env.
 */
let canonicalEnv: Map<string, string> | null = null;

function envByCanonicalName(): Map<string, string> {
  if (canonicalEnv) return canonicalEnv;

  canonicalEnv = new Map();
  for (const [name, value] of Object.entries(process.env)) {
    if (typeof value === "string" && value.trim()) {
      canonicalEnv.set(canonical(name), value.trim());
    }
  }
  return canonicalEnv;
}

function read(name: string): string | undefined {
  const exact = process.env[name];
  if (exact && exact.trim()) return exact.trim();

  return envByCanonicalName().get(canonical(name));
}

/**
 * Provider-related variable names present in the environment, so a typo is
 * visible rather than inferred. Names only — never values, so this is safe to
 * share when reporting a problem.
 */
export function providerEnvNamesSeen(): string[] {
  return Object.keys(process.env)
    .filter((name) => /adzuna|serper|jobtech|hunter|apollo|rapidapi|jsearch|theirstack|supabase/i.test(name))
    .sort();
}

export interface DeploymentInfo {
  /** "production" | "preview" | "development" on Vercel, else null. */
  environment: string | null;
  /** Branch this build came from. */
  branch: string | null;
  /** Short commit sha, so a stale deployment is obvious. */
  commit: string | null;
  host: string | null;
}

/**
 * Which deployment is answering.
 *
 * Environment variables are scoped per environment, and a branch that is not
 * the production branch builds as a Preview — so a variable ticked for
 * Production only is genuinely absent here, which is indistinguishable from a
 * typo without knowing which environment this is. All four values are
 * non-secret build metadata.
 */
export function deploymentInfo(): DeploymentInfo {
  const short = (sha?: string) => (sha ? sha.slice(0, 7) : null);

  return {
    environment: read("VERCEL_ENV") ?? (process.env.NODE_ENV === "production" ? null : "local"),
    branch: read("VERCEL_GIT_COMMIT_REF") ?? null,
    commit: short(read("VERCEL_GIT_COMMIT_SHA")),
    host: read("VERCEL_URL") ?? null,
  };
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
  /**
   * Adzuna's dashboard calls these "Application ID" and "Application Keys",
   * so the obvious variable names differ from person to person. Accepting the
   * plausible spellings costs nothing and saves a redeploy spent guessing.
   */
  get adzunaAppId() {
    return read("ADZUNA_APP_ID") ?? read("ADZUNA_ID") ?? read("ADZUNA_APPLICATION_ID");
  },
  get adzunaAppKey() {
    return read("ADZUNA_APP_KEY") ?? read("ADZUNA_API_KEY") ?? read("ADZUNA_KEY");
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

/**
 * Credentials that are half-present.
 *
 * A provider needing two values is skipped when only one is set, which looks
 * exactly like a provider that was never configured — the user sees results
 * from somewhere else and no explanation. Naming the missing half turns a
 * silent skip into an instruction.
 */
export function configWarnings(): string[] {
  const warnings: string[] = [];

  if (serverEnv.adzunaAppId && !serverEnv.adzunaAppKey) {
    warnings.push(
      "Adzuna is being skipped: ADZUNA_APP_ID is set but ADZUNA_APP_KEY is missing. Both the Application ID and the Application Key are required — add the key and redeploy.",
    );
  }

  if (serverEnv.adzunaAppKey && !serverEnv.adzunaAppId) {
    warnings.push(
      "Adzuna is being skipped: ADZUNA_APP_KEY is set but ADZUNA_APP_ID is missing. Both values are required — add the id and redeploy.",
    );
  }

  if (isSupabaseConfiguredPartially()) {
    warnings.push(
      "Supabase sync is off: only one of NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY is set. Bookmarks stay in this browser until both are.",
    );
  }

  return warnings;
}

function isSupabaseConfiguredPartially(): boolean {
  return Boolean(serverEnv.supabaseUrl) !== Boolean(serverEnv.supabaseAnonKey);
}

export function isSupabaseConfigured(): boolean {
  return Boolean(serverEnv.supabaseUrl && serverEnv.supabaseAnonKey);
}
