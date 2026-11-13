// SIG-1314: the parsed tournament PGN ("All rounds" in the games sidebar), per tourId, in memory and outside
// React state. A leaf module (no imports) so `leaveLive` can clear it without an import cycle.
import type { LiveGame } from "@/src/lib/live/types";

/** Only what a row needs; the notation is fetched when a board opens. */
export type TourGameRow = Pick<LiveGame, "id" | "roundId" | "white" | "black" | "result">;

const games = new Map<string, TourGameRow[]>();
const inFlight = new Map<string, Promise<TourGameRow[]>>();
let epoch = 0;

export function cachedTourGames(tourId: string): TourGameRow[] | undefined {
  return games.get(tourId);
}

export function pendingTourGames(tourId: string): Promise<TourGameRow[]> | undefined {
  return inFlight.get(tourId);
}

/** Remember a request in flight, so a second caller joins it; stores the result unless the cache was cleared meanwhile. */
export function trackTourGames(tourId: string, request: Promise<TourGameRow[]>): Promise<TourGameRow[]> {
  const started = epoch;
  const tracked = request.then((rows) => {
    if (started === epoch) {
      games.set(tourId, rows);
    }
    return rows;
  });
  inFlight.set(tourId, tracked);
  const done = () => {
    if (inFlight.get(tourId) === tracked) {
      inFlight.delete(tourId);
    }
  };
  tracked.then(done, done);
  return tracked;
}

/** Leaving Live: drops the rows and forgets requests in flight (their result is not stored). */
export function clearTourGamesCache(): void {
  epoch += 1;
  games.clear();
  inFlight.clear();
}
