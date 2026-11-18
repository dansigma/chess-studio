"use client";

import { useMemo } from "react";
import { fileDatabaseOverview } from "@/src/lib/library/file-source";
import { mergeOverviews, topPlayers } from "@/src/lib/library/overview";
import { localPlayerHit } from "@/src/lib/players/local-files";
import type { PlayerHit } from "@/src/lib/player-types";
import { useStudioStore } from "@/src/store/studio-store";

/** SIG-1405: how many frequent local players the idle Players list suggests. */
export const IDLE_LOCAL_PLAYERS = 6;

export type IdleLocalPlayers = {
  /** The most frequent players in the loaded PGN databases, as search hits. */
  top: PlayerHit[];
  /** Every local player name (trimmed, lower case), for bookmark de-duplication. */
  names: ReadonlySet<string>;
};

const EMPTY: IdleLocalPlayers = { top: [], names: new Set() };

/**
 * Frequent players from the PGN files loaded in the Library, for the idle
 * Players list (SIG-1405). Reads the same in-memory overview as the Library
 * summary (cached per database games array) and builds hits with
 * `localPlayerHit`, so an idle suggestion behaves exactly like a search hit.
 * `enabled` is false while a search is running: nothing is computed then.
 */
export function useIdleLocalPlayers(enabled: boolean): IdleLocalPlayers {
  const databases = useStudioStore((state) => state.files.databases);
  return useMemo(() => {
    if (!enabled || databases.length === 0) {
      return EMPTY;
    }
    const overview = mergeOverviews(databases.map((database) => fileDatabaseOverview(database)));
    return {
      top: topPlayers(overview, IDLE_LOCAL_PLAYERS).map(({ name }) => localPlayerHit(name)),
      names: overview.players,
    };
  }, [enabled, databases]);
}
