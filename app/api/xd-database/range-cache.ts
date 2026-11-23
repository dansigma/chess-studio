import { XD_DATABASE_VERSION } from "@/src/lib/xd-database/manifest";
import type { XdRangeSource } from "@/src/lib/xd-database/reader";

export function xdEdgeCache() {
  return (globalThis.caches as (CacheStorage & { default?: Cache }) | undefined)?.default;
}

export function cacheXdRanges(origin: string, source: XdRangeSource): XdRangeSource {
  return async (file, range) => {
    if (!range || (file !== "tree.bin" && file !== "games.bin")) return source(file, range);

    const key = `${origin}/api/xd-database/__range/v${XD_DATABASE_VERSION}/${file}/${range.start}-${range.end}`;
    const edge = xdEdgeCache();
    if (!edge) return source(file, range);

    try {
      const cached = await edge.match(key);
      if (cached?.ok) {
        const bytes = await cached.arrayBuffer();
        if (bytes.byteLength === range.end - range.start) return new Uint8Array(bytes);
      }
    } catch {
      // A failed cache read can be served from R2.
    }

    const bytes = await source(file, range);
    if (bytes.byteLength === range.end - range.start) {
      try {
        await edge.put(key, new Response(bytes as Uint8Array<ArrayBuffer>, {
          headers: { "Cache-Control": "public, max-age=31536000, immutable" },
        }));
      } catch {
        // A failed cache write does not affect the response.
      }
    }
    return bytes;
  };
}
