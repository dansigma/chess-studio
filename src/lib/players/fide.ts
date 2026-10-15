import type { FidePlayerSuggestion } from "@/src/lib/fide-players";
import { mapFidePlayers } from "@/src/lib/fide-players";
import { createLruCache } from "@/src/lib/lru";
import { lichessHeaders } from "./lichess";
import { SEARCH_TIMEOUT_MS, fetchTimeout } from "./shared";

const FIDE_CACHE_TTL_MS = 300_000;
const fideCache = createLruCache<string, { expires: number; payload: FidePlayerSuggestion[] }>(300);

export async function searchFidePlayers(query: string): Promise<FidePlayerSuggestion[]> {
  const q = query.trim();
  if (q.length < 2) {
    return [];
  }
  const key = q.toLowerCase();
  const cached = fideCache.get(key);
  if (cached && cached.expires > Date.now()) {
    return cached.payload;
  }
  try {
    const response = await fetchTimeout(
      `https://lichess.org/api/fide/player?q=${encodeURIComponent(q)}`,
      { headers: lichessHeaders(), cache: "no-store" },
      SEARCH_TIMEOUT_MS,
    );
    if (!response.ok) {
      return [];
    }
    const suggestions = mapFidePlayers((await response.json()) as unknown);
    fideCache.set(key, { expires: Date.now() + FIDE_CACHE_TTL_MS, payload: suggestions });
    return suggestions;
  } catch {
    return [];
  }
}
