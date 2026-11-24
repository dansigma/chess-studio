import { XD_DATABASE_VERSION } from "@/src/lib/xd-database/manifest";
import type { XdFileName, XdRangeSource } from "@/src/lib/xd-database/reader";
import { deferCacheWrite, recordCache } from "./timing";

export function xdEdgeCache() {
  return (globalThis.caches as (CacheStorage & { default?: Cache }) | undefined)?.default;
}

const RANGED_FILES = new Set<XdFileName>([
  "tree.bin", "games.bin", "players.bin", "player-games.bin", "position-games.bin",
]);
const WHOLE_FILES = new Set<XdFileName>(["tree.idx", "games.idx", "players.idx"]);

/** All files are immutable per version, so ranges and whole index files are cached at the edge. */
export function cacheXdRanges(origin: string, source: XdRangeSource): XdRangeSource {
  return async (file, range) => {
    if (range ? !RANGED_FILES.has(file) : !WHOLE_FILES.has(file)) return source(file, range);

    const suffix = range ? `${range.start}-${range.end}` : "full";
    const key = `${origin}/api/xd-database/__range/v${XD_DATABASE_VERSION}/${file}/${suffix}`;
    const edge = xdEdgeCache();
    if (!edge) return source(file, range);
    const valid = (length: number) => range ? length === range.end - range.start : length > 0;

    try {
      const cached = await edge.match(key);
      if (cached?.ok) {
        const bytes = await cached.arrayBuffer();
        if (valid(bytes.byteLength)) {
          recordCache(true);
          return new Uint8Array(bytes);
        }
      }
    } catch {
      // A failed cache read can be served from R2.
    }
    recordCache(false);

    const bytes = await source(file, range);
    if (valid(bytes.byteLength)) {
      await deferCacheWrite(() => edge.put(key, new Response(bytes as Uint8Array<ArrayBuffer>, {
        headers: { "Cache-Control": "public, max-age=31536000, immutable" },
      })));
    }
    return bytes;
  };
}
