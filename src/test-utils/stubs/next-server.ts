// Minimal `next/server` stand-in for `node --test`.
//
// Kept thin on purpose: real route contracts are status codes, JSON bodies,
// and headers — all of which live on the standard `Response`. Subclassing
// keeps `instanceof Response` true while adding the two APIs routes use:
// `NextRequest.nextUrl` and `NextResponse.json()` / `NextResponse.redirect()`.
import type { NextURL } from "next/dist/server/web/next-url";
import type { RequestCookies } from "next/dist/server/web/spec-extension/cookies";

export class NextRequest extends Request {
  // Runtime is a plain URL (routes only read `.searchParams`); typed as
  // NextURL so the stub stays assignable to the real Next request type.
  get nextUrl(): NextURL {
    return new URL(this.url) as unknown as NextURL;
  }

  // Real Next exposes request cookies; routes under test only touch
  // `request.headers` and `request.nextUrl`, so this is a placeholder that
  // keeps the shape without pulling in Next internals at runtime (the cast
  // keeps it assignable to the real `RequestCookies` type under `tsc`).
  get cookies(): RequestCookies {
    return {
      get: () => undefined,
      getAll: () => [] as Array<{ name: string; value: string }>,
    } as unknown as RequestCookies;
  }

  // Deprecated Next.js surface kept so the stub stays structurally
  // assignable to the real `NextRequest` type under `tsc` (the runtime
  // loader swaps `next/server` for this stub only in `node --test`).
  get page(): void {
    return undefined as unknown as void;
  }

  get ua(): void {
    return undefined as unknown as void;
  }
}

type JsonInit = ResponseInit & { headers?: HeadersInit };

export class NextResponse extends Response {
  static json(data: unknown, init?: JsonInit): NextResponse {
    const headers = new Headers(init?.headers);
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    return new NextResponse(JSON.stringify(data), { ...init, headers });
  }

  static redirect(url: string | URL, init?: number | ResponseInit): NextResponse {
    const status = typeof init === "number" ? init : (init?.status ?? 307);
    const headers = new Headers(typeof init === "object" ? init?.headers : undefined);
    headers.set("Location", String(url));
    if (typeof init === "number" || init === undefined) {
      return new NextResponse(null, { status, headers });
    }
    return new NextResponse(null, { ...init, status, headers });
  }
}
