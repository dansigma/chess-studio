import type { LiveGame } from "@/src/lib/live/types";
import { useLiveStore, type LiveRoundInfo } from "./live-store";

/** One game of a round. Components subscribe to `(roundId, gameId)` and never know where data came from. */
export function useLiveGame(roundId: string, gameId: string): LiveGame | undefined {
  return useLiveStore((s) => s.gamesByRound[roundId]?.[gameId]);
}

/** All games of a round, by id. The object is stable until a game of that round changes. */
export function useLiveRound(roundId: string): Record<string, LiveGame> | undefined {
  return useLiveStore((s) => s.gamesByRound[roundId]);
}

export function useLiveRoundInfo(roundId: string): LiveRoundInfo | undefined {
  return useLiveStore((s) => s.roundInfo[roundId]);
}
