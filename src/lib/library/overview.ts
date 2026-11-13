// SIG-1327: summary ("what is in this database?") of a set of games. Raw sets
// and maps, so several sources merge correctly (a player in two sources counts once).
import type { LibraryGameItem } from "./types";

export type LibraryOverview = {
  games: number;
  players: Set<string>; // normalized names (trimmed, case-folded)
  eloSum: number;
  eloCount: number;
  eco: Map<string, { count: number; opening: string | null }>;
};

export type OverviewRow = Pick<LibraryGameItem, "white" | "black" | "whiteElo" | "blackElo" | "eco" | "opening">;

export function emptyOverview(): LibraryOverview {
  return { games: 0, players: new Set(), eloSum: 0, eloCount: 0, eco: new Map() };
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
    }
  }
  for (const elo of [row.whiteElo, row.blackElo]) {
    if (typeof elo === "number" && Number.isFinite(elo) && elo > 0) {
      overview.eloSum += elo;
      overview.eloCount += 1;
    }
  }
  const code = ecoCode(row.eco);
  if (code) {
    const opening = row.opening?.trim() || null;
    const hit = overview.eco.get(code);
    if (hit) {
      hit.count += 1;
      hit.opening ??= opening;
    } else {
      overview.eco.set(code, { count: 1, opening });
    }
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
    for (const [code, entry] of o.eco) {
      const hit = out.eco.get(code);
      if (hit) {
        hit.count += entry.count;
        hit.opening ??= entry.opening;
      } else {
        out.eco.set(code, { ...entry });
      }
    }
  }
  return out;
}

/** The `n` most frequent ECO codes; ties by code ascending. */
export function topEco(
  overview: LibraryOverview,
  n: number,
): { code: string; count: number; opening: string | null }[] {
  return [...overview.eco]
    .map(([code, entry]) => ({ code, ...entry }))
    .sort((a, b) => b.count - a.count || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0))
    .slice(0, n);
}

/** Average of all known individual ratings, rounded; null when none is known. */
export function averageElo(overview: LibraryOverview): number | null {
  return overview.eloCount > 0 ? Math.round(overview.eloSum / overview.eloCount) : null;
}
