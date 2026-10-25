// SIG-1089: pure view-state precedence for the My Games sidebar body.
// Kept in a tiny dependency-free module (instead of co-located in
// `MyGamesSidebar.tsx`) because no existing `node:test` suite imports a
// `.tsx` component — the `.tsx`-adjacent suites assert on source text — so a
// pure-module import keeps the truth-table test runnable. The sidebar imports
// this; behavior is identical to the co-located shape in the plan.
import type { PlayerGame } from "@/src/lib/player-types";

export type MyGamesViewState = "signedOut" | "linkAccount" | "loading" | "empty" | "list";

/** Precedence for the sidebar body: anonymous first, loading beats hints
 * (a reload never flashes "link your account"), then hints, then list. */
export function myGamesViewState({
  user,
  linkedLoading,
  gamesLoading,
  linkedCount,
  games,
}: {
  user: unknown;
  linkedLoading: boolean;
  gamesLoading: boolean;
  linkedCount: number;
  games: PlayerGame[];
}): MyGamesViewState {
  if (!user) {
    return "signedOut";
  }
  if (linkedLoading || gamesLoading) {
    return "loading";
  }
  if (linkedCount === 0) {
    return "linkAccount";
  }
  if (games.length === 0) {
    return "empty";
  }
  return "list";
}
