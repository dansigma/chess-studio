import { BOOK_RULE } from "@/src/chess/opening-theory";

// SIG-1225: one request per review to the book route. Resolves to the number of
// leading theory moves, or null when the book is unavailable (network error,
// timeout, 429, server without a Lichess token); the caller then scores every
// position. Lines that do not start from the standard position (FEN games,
// Chess960) have no book and make no request.

export const STANDARD_START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
/** A little over the server's own 8 s budget. */
export const BOOK_CLIENT_TIMEOUT_MS = 10_000;
const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

export async function fetchOpeningBook(
  startFen: string,
  ucis: readonly string[],
  signal?: AbortSignal,
): Promise<{ plies: number } | null> {
  if (startFen !== STANDARD_START_FEN || ucis.length === 0) {
    return { plies: 0 };
  }
  // The book cannot continue past a null move or an unreadable token.
  const invalid = ucis.findIndex((uci) => !UCI.test(uci));
  const moves = ucis.slice(0, Math.min(invalid === -1 ? ucis.length : invalid, BOOK_RULE.maxPlies));
  if (moves.length === 0) {
    return { plies: 0 };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BOOK_CLIENT_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);
  try {
    const response = await fetch("/api/explorer/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ moves }),
      signal: controller.signal,
    });
    if (!response.ok) {
      return null;
    }
    const payload = (await response.json()) as { available?: unknown; plies?: unknown };
    if (payload.available !== true || typeof payload.plies !== "number") {
      return null;
    }
    return { plies: Math.max(0, Math.min(moves.length, Math.floor(payload.plies))) };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}
