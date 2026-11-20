// SIG-1284: the browser queries the public Lichess tablebase directly (CORS `*`, no token).
import { fenKey } from "@/src/chess/tree";
import { createLruCache } from "../lru";
import { isTablebasePosition } from "./pieces";

export const TABLEBASE_OUTCOMES = {
  win: { label: "Win", moveLabel: "Loss" },
  loss: { label: "Loss", moveLabel: "Win" },
  draw: { label: "Draw", moveLabel: "Draw" },
  "cursed-win": { label: "Draw", moveLabel: "Draw", title: "A win without the 50-move rule." },
  "blessed-loss": { label: "Draw", moveLabel: "Draw", title: "A loss without the 50-move rule." },
  "maybe-win": { label: "Possible win", moveLabel: "Possible loss" },
  "maybe-loss": { label: "Possible loss", moveLabel: "Possible win" },
  unknown: { label: "Unknown", moveLabel: "Unknown" },
} as const satisfies Record<string, { label: string; moveLabel: string; title?: string }>;

type Category = keyof typeof TABLEBASE_OUTCOMES;
type Evaluation = { category: Category; dtz: number | null; dtm: number | null };
type Move = Evaluation & { uci: string; san: string };
type Available = Evaluation & { available: true; bestMove: Move | null; moves: Move[] };
export type TablebaseResult = Available | { available: false; reason: string };

const cache = createLruCache<string, Available>(500);
let pausedUntil = 0;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function distance(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isInteger(value));
}

function evaluation({ category, dtz, dtm }: Record<string, unknown>): Evaluation | null {
  // The API also uses Syzygy categories for decisive WDL without a DTZ value.
  if (category === "syzygy-win") category = "maybe-win";
  if (category === "syzygy-loss") category = "maybe-loss";
  if (typeof category !== "string" || !Object.hasOwn(TABLEBASE_OUTCOMES, category)
      || !distance(dtz) || !distance(dtm)) return null;
  return { category: category as Category, dtz, dtm };
}

function parseResult(value: unknown): Available | null {
  const data = record(value);
  const position = evaluation(data);
  if (!position || !Array.isArray(data.moves)) return null;

  const moves: Move[] = [];
  for (const item of data.moves) {
    const move = record(item);
    const result = evaluation(move);
    const { uci, san } = move;
    if (!result || typeof uci !== "string" || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)
        || typeof san !== "string" || !san.trim()) return null;
    // Lichess can encode castling with the rook's square as the destination.
    const castle = /^(O-O(?:-O)?)[+#]?$/.exec(san);
    const playableUci = castle ? `e${uci[1]}${castle[1] === "O-O" ? "g" : "c"}${uci[1]}` : uci;
    moves.push({ ...result, uci: playableUci, san });
  }

  return { available: true, ...position, bestMove: moves[0] ?? null, moves };
}

export async function fetchTablebase(fen: string, signal: AbortSignal): Promise<TablebaseResult> {
  if (signal.aborted) return { available: false, reason: "aborted" };
  if (!isTablebasePosition(fen)) return { available: false, reason: "ineligible" };

  const key = fenKey(fen);
  const cached = cache.get(key);
  if (cached) return cached;
  if (Date.now() < pausedUntil) return { available: false, reason: "rate-limited" };

  const timeout = AbortSignal.timeout(5000);
  try {
    const response = await fetch(`https://tablebase.lichess.ovh/standard?fen=${encodeURIComponent(fen)}`, {
      signal: AbortSignal.any([signal, timeout]),
    });
    if (response.status === 429) {
      pausedUntil = Date.now() + 60_000;
      // A concurrent request may have filled the cache while this one was in flight.
      return cache.get(key) ?? { available: false, reason: "rate-limited" };
    }
    if (!response.ok) return { available: false, reason: `http-${response.status}` };

    const result = parseResult(await response.json());
    if (signal.aborted) return { available: false, reason: "aborted" };
    if (!result) return { available: false, reason: "invalid-response" };
    cache.set(key, result);
    return result;
  } catch (error) {
    if (signal.aborted) return { available: false, reason: "aborted" };
    if (timeout.aborted) return { available: false, reason: "timeout" };
    return { available: false, reason: error instanceof SyntaxError ? "invalid-response" : "network" };
  }
}
