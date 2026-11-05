import { walkLocalBook } from "@/src/chess/opening-book";
import { decodeBook, type OpeningBook } from "@/src/chess/opening-book-format";
import { OPENING_BOOK_MANIFEST } from "@/src/chess/opening-book-manifest";
import { fetchOpeningBook, STANDARD_START_FEN } from "./book-client";

// SIG-1226: the review's opening book. The local book (built offline from the
// Lichess open database, served versioned and immutable from /book/) is checked
// first; the SIG-1225 explorer route is only asked when the file is not
// available in time, or when the game is still in book at the last ply the file
// covers. The file is fetched lazily on the first review (never for users who
// do not review), kept in memory for the session, and cached by the browser.

/** A review never waits longer than this for the file; the download goes on in the background. */
export const LOCAL_BOOK_WAIT_MS = 3_000;
/** After a failed download the next review retries only after this long. */
export const LOCAL_BOOK_RETRY_MS = 5 * 60_000;

let loaded: OpeningBook | null = null;
let loading: Promise<OpeningBook | null> | null = null;
let failedAt = 0;

export function _resetLocalBookForTest(): void {
  loaded = null;
  loading = null;
  failedAt = 0;
}

export function localBookUrl(): string {
  return `/book/${process.env.NEXT_PUBLIC_OPENING_BOOK_FILE || OPENING_BOOK_MANIFEST.file}`;
}

async function download(): Promise<OpeningBook | null> {
  try {
    const response = await fetch(localBookUrl());
    if (!response.ok || !response.body) {
      return null;
    }
    const inflated = response.body.pipeThrough(new DecompressionStream("gzip"));
    return decodeBook(new Uint8Array(await new Response(inflated).arrayBuffer()));
  } catch {
    return null;
  }
}

function startLoad(now: number): Promise<OpeningBook | null> | null {
  if (loaded) {
    return Promise.resolve(loaded);
  }
  if (loading) {
    return loading;
  }
  if (failedAt && now - failedAt < LOCAL_BOOK_RETRY_MS) {
    return null;
  }
  loading = download().then((book) => {
    loading = null;
    if (book) {
      loaded = book;
      failedAt = 0;
    } else {
      failedAt = now;
    }
    return book;
  });
  return loading;
}

function withinMs<T>(promise: Promise<T>, ms: number, signal?: AbortSignal): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    const done = (value: T | null) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve(value);
    };
    const onAbort = () => done(null);
    signal?.addEventListener("abort", onAbort);
    promise.then(done, () => done(null));
  });
}

export type ResolveBookOptions = { waitMs?: number; now?: () => number };

/**
 * Leading theory plies of a line, or null when no book is available at all (the
 * caller then scores every position and shows the "book unavailable" note).
 */
export async function resolveBook(
  startFen: string,
  ucis: readonly string[],
  signal?: AbortSignal,
  options: ResolveBookOptions = {},
): Promise<{ plies: number } | null> {
  if (startFen !== STANDARD_START_FEN || ucis.length === 0) {
    return { plies: 0 };
  }
  const pending = startLoad((options.now ?? Date.now)());
  const book = loaded ?? (pending ? await withinMs(pending, options.waitMs ?? LOCAL_BOOK_WAIT_MS, signal) : null);
  if (!book) {
    return fetchOpeningBook(startFen, ucis, signal);
  }
  const walk = walkLocalBook(book, startFen, ucis);
  if (!walk.needsMore) {
    return { plies: walk.plies };
  }
  // Still in book where the file stops: the explorer knows how far theory goes.
  const explorer = await fetchOpeningBook(startFen, ucis, signal);
  return { plies: Math.max(walk.plies, explorer?.plies ?? 0) };
}
