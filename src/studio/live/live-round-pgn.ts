// SIG-1292: one debounced PGN refetch per round, shared by every board of that round.
import { splitPgnGames } from "@/src/chess/pgn-games";
import { fetchRoundPgn } from "@/src/lib/live/lichess-broadcast";
import { parseGame } from "@/src/lib/live/parse-game";
import { enqueueLiveRequest } from "./live-store";

export const ROUND_PGN_DEBOUNCE_MS = 400;

type Pending = Promise<Map<string, string>>;
const pending = new Map<string, Pending>();

function load(roundId: string): Pending {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      enqueueLiveRequest((signal) => fetchRoundPgn(roundId, signal))
        .then((text) => {
          const games = new Map<string, string>();
          for (const chunk of text ? splitPgnGames(text) : []) {
            const parsed = parseGame(chunk, roundId);
            if (parsed) {
              games.set(parsed.id, parsed.pgn);
            }
          }
          resolve(games);
        }, reject)
        .finally(() => pending.delete(roundId));
    }, ROUND_PGN_DEBOUNCE_MS);
  });
}

/**
 * PGN of one game of a round. Calls made while a request for the round is waiting or in flight join it,
 * so N boards of a round cost one `fetchRoundPgn` through the shared 2/7 queue.
 */
export async function requestGamePgn(roundId: string, gameId: string): Promise<string | null> {
  let request = pending.get(roundId);
  if (!request) {
    request = load(roundId);
    pending.set(roundId, request);
  }
  return (await request).get(gameId) ?? null;
}
