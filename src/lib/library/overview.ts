// SIG-1327: summary ("what is in this database?") of a set of games. Raw sets
// and maps, so several sources merge correctly (a player in two sources counts once).
import { itemYear } from "./filters";
import type { LibraryGameItem } from "./types";

export type LibraryOverview = {
  games: number;
  players: Set<string>; // normalized names (trimmed, case-folded)
  eloSum: number;
  eloCount: number;
  eco: Map<string, { count: number; openingCounts: Map<string, number> }>;
  // SIG-1332: results from White's point of view; `other` = unfinished games.
  results: { white: number; draws: number; black: number; other: number };
  years: Map<number, number>; // games per year; undated games are skipped
  playerGames: Map<string, { name: string; games: number }>; // keyed like `players`
};

export type OverviewRow = Pick<
  LibraryGameItem,
  "white" | "black" | "whiteElo" | "blackElo" | "eco" | "opening" | "result" | "date"
>;

export function emptyOverview(): LibraryOverview {
  return {
    games: 0,
    players: new Set(),
    eloSum: 0,
    eloCount: 0,
    eco: new Map(),
    results: { white: 0, draws: 0, black: 0, other: 0 },
    years: new Map(),
    playerGames: new Map(),
  };
}

function playerKey(name: string | null | undefined): string | null {
  const key = (name ?? "").trim().toLowerCase();
  return key === "" || key === "?" ? null : key;
}

function ecoCode(eco: string | null | undefined): string | null {
  const code = (eco ?? "").trim().toUpperCase();
  return code === "" || code === "?" ? null : code;
}

/** Adds one game to `overview` in place. */
export function addToOverview(overview: LibraryOverview, row: OverviewRow): void {
  overview.games += 1;
  for (const name of [row.white, row.black]) {
    const key = playerKey(name);
    if (key) {
      overview.players.add(key);
      const hit = overview.playerGames.get(key);
      if (hit) {
        hit.games += 1;
      } else {
        overview.playerGames.set(key, { name: name.trim(), games: 1 });
      }
    }
  }
  if (row.result === "1-0") {
    overview.results.white += 1;
  } else if (row.result === "0-1") {
    overview.results.black += 1;
  } else if (row.result === "1/2-1/2") {
    overview.results.draws += 1;
  } else {
    overview.results.other += 1;
  }
  const year = itemYear(row.date);
  if (year !== null) {
    overview.years.set(year, (overview.years.get(year) ?? 0) + 1);
  }
  for (const elo of [row.whiteElo, row.blackElo]) {
    if (typeof elo === "number" && Number.isFinite(elo) && elo > 0) {
      overview.eloSum += elo;
      overview.eloCount += 1;
    }
  }
  const code = ecoCode(row.eco);
  if (code) {
    const entry = overview.eco.get(code) ?? { count: 0, openingCounts: new Map<string, number>() };
    entry.count += 1;
    const opening = row.opening?.trim();
    if (opening && opening !== "?") {
      entry.openingCounts.set(opening, (entry.openingCounts.get(opening) ?? 0) + 1);
    }
    overview.eco.set(code, entry);
  }
}

export function overviewFromItems(items: Iterable<OverviewRow>): LibraryOverview {
  const overview = emptyOverview();
  for (const item of items) {
    addToOverview(overview, item);
  }
  return overview;
}

export function mergeOverviews(list: LibraryOverview[]): LibraryOverview {
  const out = emptyOverview();
  for (const o of list) {
    out.games += o.games;
    out.eloSum += o.eloSum;
    out.eloCount += o.eloCount;
    for (const p of o.players) {
      out.players.add(p);
    }
    out.results.white += o.results.white;
    out.results.draws += o.results.draws;
    out.results.black += o.results.black;
    out.results.other += o.results.other;
    for (const [year, count] of o.years) {
      out.years.set(year, (out.years.get(year) ?? 0) + count);
    }
    for (const [key, entry] of o.playerGames) {
      const hit = out.playerGames.get(key);
      if (hit) {
        hit.games += entry.games;
      } else {
        out.playerGames.set(key, { ...entry });
      }
    }
    for (const [code, entry] of o.eco) {
      const hit = out.eco.get(code) ?? { count: 0, openingCounts: new Map<string, number>() };
      hit.count += entry.count;
      for (const [opening, count] of entry.openingCounts) {
        hit.openingCounts.set(opening, (hit.openingCounts.get(opening) ?? 0) + count);
      }
      out.eco.set(code, hit);
    }
  }
  return out;
}

function mostFrequentOpening(openingCounts: Map<string, number>): string | null {
  let best: string | null = null;
  let bestCount = 0;
  for (const [name, count] of openingCounts) {
    if (count < bestCount) continue;
    if (count === bestCount && best !== null) {
      const order = name.length - best.length || name.localeCompare(best, "en");
      // Distinct strings can collate equally (for example, equivalent Unicode spellings).
      if (order > 0 || (order === 0 && name >= best)) continue;
    }
    best = name;
    bestCount = count;
  }
  return best;
}

/** The `n` most frequent ECO codes; ties by code ascending. */
export function topEco(
  overview: LibraryOverview,
  n: number,
): { code: string; count: number; opening: string | null }[] {
  return [...overview.eco]
    .sort(([a, left], [b, right]) => right.count - left.count || (a < b ? -1 : a > b ? 1 : 0))
    .slice(0, n)
    .map(([code, { count, openingCounts }]) => ({ code, count, opening: mostFrequentOpening(openingCounts) }));
}

/** The `n` players with most games; ties by display name ascending (then key). */
export function topPlayers(overview: LibraryOverview, n: number): { name: string; games: number }[] {
  return [...overview.playerGames]
    .sort(
      ([ka, a], [kb, b]) =>
        b.games - a.games || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) || (ka < kb ? -1 : ka > kb ? 1 : 0),
    )
    .slice(0, n)
    .map(([, { name, games }]) => ({ name, games }));
}

/** Games per year, ascending by year. */
export function yearBuckets(overview: LibraryOverview): { year: number; count: number }[] {
  return [...overview.years].map(([year, count]) => ({ year, count })).sort((a, b) => a.year - b.year);
}

/** Average of all known individual ratings, rounded; null when none is known. */
export function averageElo(overview: LibraryOverview): number | null {
  return overview.eloCount > 0 ? Math.round(overview.eloSum / overview.eloCount) : null;
}
