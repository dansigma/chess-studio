import { create } from "zustand";
import type { BroadcastStandingRow } from "@/src/lib/live/types";

export type StandingsEntry = {
  rows: readonly BroadcastStandingRow[] | null;
  status: "loading" | "ready" | "error";
  requestedAt: number;
  revision: number;
  refreshedAt?: number;
};

export const useStandingsCache = create<Record<string, StandingsEntry>>(() => ({}));

export function clearStandingsCache(): void {
  useStandingsCache.setState({}, true);
}
