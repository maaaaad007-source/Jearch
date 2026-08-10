/**
 * Configuration, and an honest account of it.
 *
 * The expensive lesson behind this file: a missing credential used to look
 * exactly like an empty search result, so hours went into debugging a query
 * that was never sent. Nothing here degrades silently — `setupReport()` is the
 * single source of truth for what the app can currently do, and the UI shows it
 * whenever a search comes up short.
 */

/** `ADZUNA_APP_KEY`, `adzuna-app-key` and `AdzunaAppKey` all reduce to this. */
function canonical(name: string): string {
  return name.replace(/[^a-z0-9]/gi, "").toUpperCase();
}

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

/**
 * Environment lookup that forgives how the name was typed. A key rejected over
 * a hyphen instead of an underscore is indistinguishable from a key that was
 * never set, and costs a redeploy to discover.
 */
function read(...names: string[]): string | undefined {
  for (const name of names) {
    const exact = process.env[name];
    if (exact && exact.trim()) return exact.trim();

    const loose = envByCanonicalName().get(canonical(name));
    if (loose) return loose;
  }
  return undefined;
}

export const config = {
  get adzunaAppId() {
    return read("ADZUNA_APP_ID", "ADZUNA_ID", "ADZUNA_APPLICATION_ID");
  },
  get adzunaAppKey() {
    return read("ADZUNA_APP_KEY", "ADZUNA_API_KEY", "ADZUNA_KEY");
  },
  get serperKey() {
    return read("SERPER_API_KEY");
  },
  /** JobTech (Swedish Platsbanken) is open data and needs no credential. */
  get jobtechDisabled() {
    return read("JOBTECH_DISABLED")?.toLowerCase() === "true";
  },
  /** Optional: mirrors saved opportunities across devices. */
  get supabaseUrl() {
    return read("NEXT_PUBLIC_SUPABASE_URL");
  },
  get supabaseAnonKey() {
    return read("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  },
  /** Test seam: point a source at a local stub instead of the real host. */
  get adzunaEndpoint() {
    return read("ADZUNA_ENDPOINT");
  },
  get jobtechEndpoint() {
    return read("JOBTECH_ENDPOINT");
  },
  get serperEndpoint() {
    return read("SERPER_ENDPOINT");
  },
};

export interface DeploymentInfo {
  environment: string | null;
  branch: string | null;
  commit: string | null;
}

/**
 * Which build is answering. Environment variables are scoped per environment,
 * so "the variable is set" and "the variable is set *here*" are different
 * claims, and only the second one matters.
 */
export function deploymentInfo(): DeploymentInfo {
  const sha = read("VERCEL_GIT_COMMIT_SHA");

  return {
    environment: read("VERCEL_ENV") ?? (process.env.NODE_ENV === "production" ? null : "local"),
    branch: read("VERCEL_GIT_COMMIT_REF") ?? null,
    commit: sha ? sha.slice(0, 7) : null,
  };
}

export interface CapabilityStatus {
  ready: boolean;
  /** Plain-language state, written for someone who does not read code. */
  detail: string;
  /** Variable names this capability needs. Names only — never values. */
  variables: string[];
}

export interface SetupReport {
  jobs: CapabilityStatus;
  people: CapabilityStatus;
  deployment: DeploymentInfo;
  /** Provider-ish variable names actually present, so a typo is visible. */
  variablesDetected: string[];
}

export function setupReport(): SetupReport {
  const id = Boolean(config.adzunaAppId);
  const key = Boolean(config.adzunaAppKey);

  let jobsDetail: string;
  if (id && key) {
    jobsDetail = "Adzuna is connected. Sweden also uses Platsbanken, which needs no key.";
  } else if (id || key) {
    // Half a credential is the worst case: it reads as configured and behaves
    // as absent, so name the missing half rather than the pair.
    const missing = id ? "ADZUNA_APP_KEY" : "ADZUNA_APP_ID";
    jobsDetail = `Adzuna is half-configured — ${missing} is missing. Both values are required.`;
  } else {
    jobsDetail =
      "No job source is connected. Add ADZUNA_APP_ID and ADZUNA_APP_KEY from developer.adzuna.com. Swedish searches work without them.";
  }

  return {
    jobs: {
      // Sweden is searchable with no credentials at all, so "can search" is
      // broader than "Adzuna is connected".
      ready: (id && key) || !config.jobtechDisabled,
      detail: jobsDetail,
      variables: ["ADZUNA_APP_ID", "ADZUNA_APP_KEY"],
    },
    people: {
      ready: Boolean(config.serperKey),
      detail: config.serperKey
        ? "Serper is connected — searches LinkedIn for the person hiring."
        : "No people source connected. Add SERPER_API_KEY from serper.dev to find who to contact.",
      variables: ["SERPER_API_KEY"],
    },
    deployment: deploymentInfo(),
    variablesDetected: Object.keys(process.env)
      .filter((name) => /adzuna|serper|jobtech/i.test(name))
      .sort(),
  };
}
