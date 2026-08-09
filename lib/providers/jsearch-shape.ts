/**
 * Locating the job list inside a JSearch response.
 *
 * JSearch has moved the array around across endpoint versions — `/search`
 * returned `{ data: [...] }`, while the cursor-paginated `/search-v2` wraps it
 * (`{ data: { jobs: [...], cursor } }` and similar). Hardcoding one shape is
 * what broke this adapter once already, so instead we look in the known
 * places and then fall back to finding any array of job-looking records.
 */

/** Fields that identify a record as a job posting rather than something else. */
const JOB_MARKERS = ["job_id", "job_title", "employer_name", "job_apply_link", "job_description"];

function looksLikeJob(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value as Record<string, unknown>);
  return JOB_MARKERS.some((marker) => keys.includes(marker));
}

function asJobArray(value: unknown): Record<string, unknown>[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  return looksLikeJob(value[0]) ? (value as Record<string, unknown>[]) : null;
}

/**
 * An empty array is a legitimate "no results" answer, so it has to be
 * distinguishable from "no array anywhere" — hence the two-field return rather
 * than a bare array-or-null.
 */
export interface JobArrayLookup {
  jobs: Record<string, unknown>[] | null;
  /** Where it was found, for diagnostics. */
  path: string | null;
  /** True when a known container held an empty array — a real zero-result. */
  emptyResult: boolean;
}

const KNOWN_PATHS: Array<[string, (payload: Record<string, unknown>) => unknown]> = [
  ["data", (p) => p.data],
  ["jobs", (p) => p.jobs],
  ["results", (p) => p.results],
  ["data.jobs", (p) => (p.data as Record<string, unknown>)?.jobs],
  ["data.data", (p) => (p.data as Record<string, unknown>)?.data],
  ["data.results", (p) => (p.data as Record<string, unknown>)?.results],
  ["data.items", (p) => (p.data as Record<string, unknown>)?.items],
];

export function findJobArray(payload: unknown): JobArrayLookup {
  if (!payload || typeof payload !== "object") {
    return { jobs: null, path: null, emptyResult: false };
  }

  const root = payload as Record<string, unknown>;
  let sawEmptyArray = false;

  for (const [path, get] of KNOWN_PATHS) {
    const value = get(root);
    if (Array.isArray(value)) {
      if (value.length === 0) {
        sawEmptyArray = true;
        continue;
      }
      const jobs = asJobArray(value);
      if (jobs) return { jobs, path, emptyResult: false };
    }
  }

  // Nothing in a known location: sweep the top level and one level down for
  // any array whose first element looks like a job posting.
  for (const [key, value] of Object.entries(root)) {
    const jobs = asJobArray(value);
    if (jobs) return { jobs, path: key, emptyResult: false };

    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const [innerKey, innerValue] of Object.entries(value as Record<string, unknown>)) {
        const innerJobs = asJobArray(innerValue);
        if (innerJobs) return { jobs: innerJobs, path: `${key}.${innerKey}`, emptyResult: false };
      }
    }
  }

  return { jobs: null, path: null, emptyResult: sawEmptyArray };
}

/**
 * Compact description of a payload's structure, for the debug endpoint and for
 * error messages — enough to correct the mapping without dumping the body.
 */
export function describeShape(payload: unknown, depth = 0): unknown {
  if (payload === null) return "null";
  if (Array.isArray(payload)) {
    return depth >= 2
      ? `array(${payload.length})`
      : { type: `array(${payload.length})`, first: payload.length ? describeShape(payload[0], depth + 1) : null };
  }

  const kind = typeof payload;
  if (kind !== "object") {
    if (kind === "string") {
      const text = payload as string;
      return `string: ${text.length > 60 ? `${text.slice(0, 60)}…` : text}`;
    }
    return `${kind}: ${String(payload)}`;
  }

  if (depth >= 2) return `object(${Object.keys(payload as object).length} keys)`;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    out[key] = describeShape(value, depth + 1);
  }
  return out;
}
