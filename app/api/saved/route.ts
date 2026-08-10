import { NextResponse } from "next/server";
import { z } from "zod";

import { getSupabase, SAVED_JOBS_TABLE } from "@/lib/supabase";
import type { SavedOpportunity } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Optional server-side persistence for bookmarked opportunities.
 *
 * When Supabase is not configured every handler returns `configured: false` and
 * the client keeps using its local persisted store — the app stays fully
 * functional, it just does not sync across devices.
 */

const jobSchema = z.object({
  id: z.string(),
  title: z.string(),
  companyName: z.string(),
  companyDomain: z.string().nullable(),
  city: z.string().nullable(),
  region: z.string().nullable(),
  workType: z.enum(["Remote", "Hybrid", "On-site", "Unknown"]),
  salary: z
    .object({
      min: z.number().nullable(),
      max: z.number().nullable(),
      currency: z.string().nullable(),
      period: z.string().nullable(),
    })
    .nullable(),
  postedAt: z.string().nullable(),
  applyUrl: z.string().nullable(),
  summary: z.string(),
  description: z.string().nullable(),
  source: z.string(),
});

const personSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    title: z.string().nullable(),
    linkedinUrl: z.string().nullable(),
    email: z.string().nullable(),
    emailIsPattern: z.boolean(),
    companyName: z.string().nullable(),
    source: z.string(),
  })
  .nullable();

const saveSchema = z.object({
  ownerId: z.string().min(8).max(64),
  opportunity: z.object({
    id: z.string(),
    job: jobSchema,
    person: personSchema,
    savedAt: z.string(),
    notes: z.string().nullable(),
  }),
});

const notConfigured = NextResponse.json({ configured: false, opportunities: [] as SavedOpportunity[] });

export async function GET(request: Request) {
  const supabase = getSupabase();
  if (!supabase) return notConfigured;

  const ownerId = new URL(request.url).searchParams.get("ownerId");
  if (!ownerId) {
    return NextResponse.json({ error: "ownerId is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from(SAVED_JOBS_TABLE)
    .select("id, job, person, saved_at, notes")
    .eq("owner_id", ownerId)
    .order("saved_at", { ascending: false });

  if (error) {
    console.error("[api/saved] read failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 502 });
  }

  const opportunities: SavedOpportunity[] = (data ?? []).map((row) => ({
    id: row.id as string,
    job: row.job as SavedOpportunity["job"],
    person: row.person as SavedOpportunity["person"],
    savedAt: row.saved_at as string,
    notes: (row.notes as string | null) ?? null,
  }));

  return NextResponse.json({ configured: true, opportunities });
}

export async function POST(request: Request) {
  const supabase = getSupabase();
  if (!supabase) return notConfigured;

  const parsed = saveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request body" },
      { status: 400 },
    );
  }

  const { ownerId, opportunity } = parsed.data;

  const { error } = await supabase.from(SAVED_JOBS_TABLE).upsert(
    {
      id: opportunity.id,
      owner_id: ownerId,
      job: opportunity.job,
      person: opportunity.person,
      saved_at: opportunity.savedAt,
      notes: opportunity.notes,
    },
    { onConflict: "id" },
  );

  if (error) {
    console.error("[api/saved] write failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 502 });
  }

  return NextResponse.json({ configured: true, ok: true });
}

export async function DELETE(request: Request) {
  const supabase = getSupabase();
  if (!supabase) return notConfigured;

  const { searchParams } = new URL(request.url);
  const ownerId = searchParams.get("ownerId");
  const id = searchParams.get("id");

  if (!ownerId || !id) {
    return NextResponse.json({ error: "ownerId and id are required" }, { status: 400 });
  }

  const { error } = await supabase
    .from(SAVED_JOBS_TABLE)
    .delete()
    .eq("owner_id", ownerId)
    .eq("id", id);

  if (error) {
    console.error("[api/saved] delete failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 502 });
  }

  return NextResponse.json({ configured: true, ok: true });
}
