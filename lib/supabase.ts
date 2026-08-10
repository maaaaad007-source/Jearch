import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { config } from "@/lib/config";

export const SAVED_JOBS_TABLE = "saved_jobs";

let cached: SupabaseClient | null = null;

/**
 * Returns a Supabase client, or null when the project is not configured.
 *
 * Supabase is optional in this app: without it, saved opportunities live in the
 * browser via the persisted Zustand store, and the `/api/saved` route reports
 * `configured: false` so the client knows not to expect server state.
 */
export function getSupabase(): SupabaseClient | null {
  if (!config.supabaseUrl || !config.supabaseAnonKey) return null;
  if (cached) return cached;

  cached = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { persistSession: false },
  });
  return cached;
}
