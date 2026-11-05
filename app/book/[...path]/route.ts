// SIG-1226: serves the local opening book from the R2 bucket that already holds
// the full engine builds (`chess-studio-engine`, binding ENGINE), under the key
// prefix `book/`. Files are versioned (opening-book-v<N>.bin.gz), so they are
// immutable and cached for a year. The book is NOT in git (size, Workers' 25 MiB
// asset limit); only the tiny fixture under public/book/ is, and static assets
// win over this route (see app/engine/[...path]/route.ts for the same rule).
// Errors are no-store so a missing book is retried as soon as it is uploaded.
import { env } from "cloudflare:workers";

type R2ObjectLike = {
  body: ReadableStream;
  httpEtag: string;
  size: number;
  writeHttpMetadata(headers: Headers): void;
};

type BookBucket = {
  get(key: string): Promise<R2ObjectLike | null>;
};

const IMMUTABLE = "public, max-age=31536000, immutable";
const NO_STORE = "no-store";
/** One flat, versioned file name; nothing else is ever read from the bucket. */
const BOOK_FILE = /^opening-book-[A-Za-z0-9._-]+\.bin\.gz$/;

function errorResponse(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: {
      "Cache-Control": NO_STORE,
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  if (path.length !== 1 || !BOOK_FILE.test(path[0])) {
    return errorResponse("Not found", 404);
  }
  const bucket = (env as unknown as { ENGINE?: BookBucket }).ENGINE;
  if (!bucket) {
    return errorResponse("Book bucket not configured", 503);
  }
  let object: R2ObjectLike | null;
  try {
    object = await bucket.get(`book/${path[0]}`);
  } catch {
    return errorResponse("Book unavailable", 500);
  }
  if (!object) {
    return errorResponse("Not found", 404);
  }
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  // Served as opaque bytes (the client inflates the gzip itself), so no
  // Content-Encoding: proxies must not re-encode or "fix" it.
  headers.set("Content-Type", "application/octet-stream");
  headers.delete("Content-Encoding");
  headers.set("Cache-Control", IMMUTABLE);
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  headers.set("ETag", object.httpEtag);
  headers.set("Content-Length", String(object.size));
  return new Response(object.body, { headers });
}
