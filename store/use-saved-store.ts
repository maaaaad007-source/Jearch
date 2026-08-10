"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

import type { JobPost, Person, SavedOpportunity } from "@/types";

interface SavedState {
  opportunities: SavedOpportunity[];
  /** Anonymous per-browser id used to scope rows when Supabase is configured. */
  ownerId: string;
  /** null until the first sync attempt resolves. */
  remoteEnabled: boolean | null;
  hydrated: boolean;

  isSaved: (jobId: string) => boolean;
  setHydrated: () => void;
  save: (job: JobPost, person: Person | null) => void;
  remove: (jobId: string) => void;
  toggle: (job: JobPost, person: Person | null) => void;
  setNotes: (jobId: string, notes: string) => void;
  clear: () => void;
  syncFromRemote: () => Promise<void>;
}

function newOwnerId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `owner-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

/** Fire-and-forget remote mirroring; local state is always the source of truth. */
async function pushRemote(path: string, init: RequestInit): Promise<boolean | null> {
  try {
    const response = await fetch(path, init);
    if (!response.ok) return null;
    const payload = (await response.json()) as { configured?: boolean };
    return payload.configured ?? null;
  } catch {
    return null;
  }
}

export const useSavedStore = create<SavedState>()(
  persist(
    (set, get) => ({
      opportunities: [],
      ownerId: newOwnerId(),
      remoteEnabled: null,
      hydrated: false,

      isSaved: (jobId) => get().opportunities.some((item) => item.job.id === jobId),

      setHydrated: () => set({ hydrated: true }),

      save: (job, person) => {
        if (get().isSaved(job.id)) return;

        const opportunity: SavedOpportunity = {
          id: job.id,
          job,
          person,
          savedAt: new Date().toISOString(),
          notes: null,
        };

        set((state) => ({ opportunities: [opportunity, ...state.opportunities] }));

        void pushRemote("/api/saved", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ownerId: get().ownerId, opportunity }),
        }).then((configured) => {
          if (configured != null) set({ remoteEnabled: configured });
        });
      },

      remove: (jobId) => {
        set((state) => ({
          opportunities: state.opportunities.filter((item) => item.job.id !== jobId),
        }));

        const query = new URLSearchParams({ ownerId: get().ownerId, id: jobId });
        void pushRemote(`/api/saved?${query.toString()}`, { method: "DELETE" });
      },

      toggle: (job, person) => {
        if (get().isSaved(job.id)) get().remove(job.id);
        else get().save(job, person);
      },

      setNotes: (jobId, notes) => {
        set((state) => ({
          opportunities: state.opportunities.map((item) =>
            item.job.id === jobId ? { ...item, notes: notes.trim() ? notes : null } : item,
          ),
        }));

        const updated = get().opportunities.find((item) => item.job.id === jobId);
        if (!updated) return;

        void pushRemote("/api/saved", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ownerId: get().ownerId, opportunity: updated }),
        });
      },

      clear: () => {
        const ids = get().opportunities.map((item) => item.job.id);
        set({ opportunities: [] });

        for (const id of ids) {
          const query = new URLSearchParams({ ownerId: get().ownerId, id });
          void pushRemote(`/api/saved?${query.toString()}`, { method: "DELETE" });
        }
      },

      /**
       * Merge server rows into local state. Union rather than replace: a device
       * that saved something while Supabase was unreachable should not lose it.
       */
      syncFromRemote: async () => {
        try {
          const query = new URLSearchParams({ ownerId: get().ownerId });
          const response = await fetch(`/api/saved?${query.toString()}`);
          if (!response.ok) return;

          const payload = (await response.json()) as {
            configured?: boolean;
            opportunities?: SavedOpportunity[];
          };

          set({ remoteEnabled: Boolean(payload.configured) });
          if (!payload.configured || !payload.opportunities) return;

          const byId = new Map(get().opportunities.map((item) => [item.id, item]));
          for (const remote of payload.opportunities) {
            if (!byId.has(remote.id)) byId.set(remote.id, remote);
          }

          set({
            opportunities: [...byId.values()].sort(
              (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime(),
            ),
          });
        } catch {
          set({ remoteEnabled: false });
        }
      },
    }),
    {
      name: "jearch:saved-opportunities",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ opportunities: state.opportunities, ownerId: state.ownerId }),
      // `hydrated` gates rendering of persisted counts, so the server markup and
      // the first client paint agree before localStorage is read in.
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
      },
    },
  ),
);
