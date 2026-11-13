import { importPgn, titleFromHeaders } from "./pgn";
import { pgnGameChunks } from "./pgn-clean";

export function splitPgnGames(text: string): string[] {
  // SIG-1218: keep [%clk] so games opened from a file keep per-move clocks.
  return pgnGameChunks(text, { keepClocks: true });
}

export type ParsedFileGame = {
  id: string;
  white: string;
  black: string;
  result: string;
  event: string;
  date: string;
  pgn: string;
  title: string;
};

export function parsePgnCollection(text: string, limit = 500): {
  games: ParsedFileGame[];
  skipped: number;
} {
  const chunks = splitPgnGames(text);
  const games: ParsedFileGame[] = [];
  let skipped = 0;
  for (const chunk of chunks) {
    if (games.length >= limit) {
      skipped += 1;
      continue;
    }
    const imported = importPgn(chunk);
    // importPgn keeps the declared headers/FEN and warnings even when no move
    // was playable, so playability alone decides the skip (headers no longer
    // imply an openable game).
    if (imported.tree.children.length === 0) {
      skipped += 1;
      continue;
    }
    games.push({
      id: crypto.randomUUID(),
      white: imported.headers.White ?? "White",
      black: imported.headers.Black ?? "Black",
      result: imported.headers.Result ?? "*",
      event: imported.headers.Event ?? "",
      date: imported.headers.Date ?? "",
      pgn: chunk,
      title: titleFromHeaders(imported.headers),
    });
  }
  return { games, skipped };
}

export type ParsePgnProgress = { done: number; total: number };

export type ParsePgnCollectionOptions = {
  limit?: number;
  batchSize?: number;
  signal?: AbortSignal;
  onProgress?: (progress: ParsePgnProgress) => void;
};

export type ParsedPgnCollection = {
  games: ParsedFileGame[];
  /** Chunks that held no playable game. */
  unreadable: number;
  /** Chunks left unread because the limit was reached. */
  overLimit: number;
};

function abortError(): Error {
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}

/** Lets the event loop paint and handle input between batches. */
function yieldToEventLoop(): Promise<void> {
  const scheduler = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  if (scheduler && typeof scheduler.yield === "function") {
    return scheduler.yield();
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function parseChunk(chunk: string): ParsedFileGame | null {
  const imported = importPgn(chunk);
  if (imported.tree.children.length === 0) {
    return null;
  }
  return {
    id: crypto.randomUUID(),
    white: imported.headers.White ?? "White",
    black: imported.headers.Black ?? "Black",
    result: imported.headers.Result ?? "*",
    event: imported.headers.Event ?? "",
    date: imported.headers.Date ?? "",
    pgn: chunk,
    title: titleFromHeaders(imported.headers),
  };
}

/**
 * Chunked, abortable twin of `parsePgnCollection` for big files: parses in
 * batches, yields between them and reports progress. Over-limit chunks are
 * counted apart from unreadable ones and never parsed.
 */
export async function parsePgnCollectionAsync(
  text: string,
  { limit = 5000, batchSize = 50, signal, onProgress }: ParsePgnCollectionOptions = {},
): Promise<ParsedPgnCollection> {
  if (signal?.aborted) {
    throw abortError();
  }
  const chunks = splitPgnGames(text);
  const total = chunks.length;
  const games: ParsedFileGame[] = [];
  let unreadable = 0;
  let index = 0;
  onProgress?.({ done: 0, total });
  while (index < total && games.length < limit) {
    const end = Math.min(index + batchSize, total);
    for (; index < end && games.length < limit; index += 1) {
      const game = parseChunk(chunks[index]);
      if (game) {
        games.push(game);
      } else {
        unreadable += 1;
      }
    }
    onProgress?.({ done: index, total });
    if (index < total && games.length < limit) {
      await yieldToEventLoop();
      if (signal?.aborted) {
        throw abortError();
      }
    }
  }
  if (signal?.aborted) {
    throw abortError();
  }
  const overLimit = total - index;
  if (overLimit > 0) {
    onProgress?.({ done: total, total });
  }
  return { games, unreadable, overLimit };
}
