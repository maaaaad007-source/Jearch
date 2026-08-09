import type { Metadata } from "next";

import { SavedDashboard } from "@/components/saved-dashboard";

export const metadata: Metadata = {
  title: "Saved opportunities — Jearch",
};

export default function SavedPage() {
  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Saved opportunities</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Every job you bookmarked, with the contact card it was saved with. Add notes as you work through
          outreach, or export the whole list to CSV.
        </p>
      </div>

      <SavedDashboard />
    </div>
  );
}
