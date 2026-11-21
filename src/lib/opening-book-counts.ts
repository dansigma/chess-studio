import { decodeCountsBook, type CountsBook } from "@/src/chess/opening-book-counts-format";
import { OPENING_BOOK_MANIFEST } from "@/src/chess/opening-book-manifest";

const manifest: { file: string; countsFile?: string } = OPENING_BOOK_MANIFEST;
const WAIT_MS = 3_000;
const RETRY_MS = 5 * 60_000;
let loaded: CountsBook | null = null;
let loading: Promise<CountsBook | null> | null = null;
let failedAt: number | null = null;

async function download(file: string): Promise<CountsBook | null> {
  try {
    const response = await fetch(`/book/${file}`);
    if (!response.ok || !response.body) {
      return null;
    }
    const inflated = response.body.pipeThrough(new DecompressionStream("gzip"));
    return decodeCountsBook(new Uint8Array(await new Response(inflated).arrayBuffer()));
  } catch {
    return null;
  }
}

/** Loads the optional counts book on demand, sharing the download across callers. */
export async function loadCountsBook(): Promise<CountsBook | null> {
  const file = manifest.countsFile;
  if (!file || loaded) {
    return loaded;
  }
  const now = Date.now();
  if (failedAt !== null && now - failedAt < RETRY_MS) {
    return null;
  }
  loading ??= download(file).then((book) => {
    loaded = book;
    failedAt = book ? null : now;
    loading = null;
    return book;
  });
  const pending = loading;
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), WAIT_MS);
    void pending.then((book) => {
      clearTimeout(timer);
      resolve(book);
    });
  });
}
