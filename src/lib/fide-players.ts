export type FidePlayerSuggestion = {
  id: `fide:${string}`;
  name: string;
  federation?: string;
  title?: string;
  rating?: number;
};

type FideRow = {
  id?: unknown;
  name?: unknown;
  federation?: unknown;
  title?: unknown;
  standard?: unknown;
};

/**
 * Map a Lichess `/api/fide/player` payload to ordered FIDE suggestions.
 * Tolerates the `{ result: [...] }` envelope; skips rows without a usable
 * name/id; caps at `limit`.
 */
export function mapFidePlayers(payload: unknown, limit = 8): FidePlayerSuggestion[] {
  const rows = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && "result" in payload && Array.isArray(payload.result)
      ? payload.result
      : [];
  const suggestions: FidePlayerSuggestion[] = [];
  for (const row of rows) {
    if (suggestions.length >= limit) {
      break;
    }
    if (typeof row !== "object" || row === null) {
      continue;
    }
    const { id, name, federation, title, standard } = row as FideRow;
    if (typeof name !== "string" || name.trim().length === 0) {
      continue;
    }
    if (typeof id !== "string" && typeof id !== "number") {
      continue;
    }
    const suggestion: FidePlayerSuggestion = {
      id: `fide:${id}`,
      name: name.trim(),
    };
    if (typeof federation === "string" && federation.trim().length > 0) {
      suggestion.federation = federation.trim();
    }
    if (typeof title === "string" && title.trim().length > 0) {
      suggestion.title = title.trim();
    }
    if (typeof standard === "number" && Number.isFinite(standard)) {
      suggestion.rating = standard;
    }
    suggestions.push(suggestion);
  }
  return suggestions;
}
