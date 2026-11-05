// SIG-1225: one Lichess games-explorer lookup for the opening book.
import { readCapped } from "./read-capped.ts";
import { UA, lichessToken } from "./players/shared.ts";
import { bookFilterQuery, type BookPosition } from "@/src/chess/opening-theory";

export const BOOK_UPSTREAM_MAX_BYTES = 256 * 1024;
/** Per-request timeout (the route also enforces a total budget). */
export const BOOK_REQUEST_TIMEOUT_MS = 2500;

type RawMove = { uci?: string; white?: number; draws?: number; black?: number };
type RawPosition = { white?: number; draws?: number; black?: number; moves?: RawMove[] };

export function bookEndpoints(fen: string): string[] {
  const query = `variant=standard&fen=${encodeURIComponent(fen)}${bookFilterQuery()}&moves=30&topGames=0&recentGames=0`;
  return [`https://explorer.lichess.ovh/lichess?${query}`, `https://explorer.lichess.org/lichess?${query}`];
}

export function toBookPosition(raw: RawPosition): BookPosition {
  const count = (entry: { white?: number; draws?: number; black?: number }) =>
    (entry.white ?? 0) + (entry.draws ?? 0) + (entry.black ?? 0);
  return {
    total: count(raw),
    moves: (raw.moves ?? []).flatMap((move) => (move.uci ? [{ uci: move.uci, games: count(move) }] : [])),
  };
}

/** Null on any failure (no token, timeout, 429, bad payload): the caller treats it as "book unavailable". */
export async function fetchBookPosition(fen: string, timeoutMs: number): Promise<BookPosition | null> {
  const token = lichessToken();
  if (!token) {
    return null;
  }
  const deadline = Date.now() + timeoutMs;
  for (const endpoint of bookEndpoints(fen)) {
    const left = Math.min(BOOK_REQUEST_TIMEOUT_MS, deadline - Date.now());
    if (left <= 0) {
      break;
    }
    try {
      const response = await fetch(endpoint, {
        headers: { Accept: "application/json", "User-Agent": UA, Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal: AbortSignal.timeout(left),
      });
      if (response.status === 429) {
        return null;
      }
      if (response.ok) {
        const raw = JSON.parse(await readCapped(response, BOOK_UPSTREAM_MAX_BYTES)) as RawPosition;
        return toBookPosition(raw);
      }
    } catch {
      // try the fallback host
    }
  }
  return null;
}
