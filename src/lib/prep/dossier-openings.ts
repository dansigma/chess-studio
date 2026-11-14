// SIG-1341: pure per-colour main-opening rows for the Library player dossier.
// Groups the player's games by `openingGroupKey` (name, then ECO, then first
// two plies) and derives the share, score, last year and the main line played
// by at least 60% of the group. Same grain as `resultsByOpening`: total
// functions, no throws, deterministic, null results count as 0 points.
import type { PlayerGame } from "@/src/lib/player-types";
import { sanMovesForGame } from "./game-sans";
import { openingGroupKey } from "./opening-group";

export type DossierOpeningRow = {
  /** `openingGroupKey` of the group (the dossier's `selectedOpening`). */
  key: string;
  /** Most frequent non-empty ECO code, upper case; null when the group has none. */
  eco: string | null;
  /** Most frequent original spelling; null for ECO / first-moves groups. */
  opening: string | null;
  games: number;
  /** Rounded share of every game of this colour, before the min-games filter. */
  sharePct: number;
  wins: number;
  draws: number;
  losses: number;
  scorePct: number;
  /** Latest `year`, else the latest UTC year from `playedAt`; null when undated. */
  lastYear: number | null;
  /** Longest SAN prefix played by >= 60% of the group, capped at 12 plies. */
  line: string[];
};

/** Default minimum group size (the dossier's own default is 1 game). */
const DEFAULT_MIN_GAMES = 1;

/** Longest main line the dossier remembers. */
const MAX_LINE_PLY = 12;

/** 60% as an exact integer ratio: `count * 5 >= games * 3`. */
const SHARE_NUMERATOR = 3;
const SHARE_DENOMINATOR = 5;

type Group = {
  key: string;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  spellings: Map<string, number>;
  ecos: Map<string, number>;
  lastYear: number | null;
  lines: string[][];
};

/** UTC year of `playedAt`, or null when it is not a finite timestamp. */
function playedYear(game: PlayerGame): number | null {
  if (typeof game.playedAt !== "number" || !Number.isFinite(game.playedAt)) {
    return null;
  }
  return new Date(game.playedAt).getUTCFullYear();
}

/**
 * Latest year a game is dated by: `year` wins, else the UTC year of
 * `playedAt`. Mirrors the dossier header's `playerYearRange`.
 */
function gameYear(game: PlayerGame): number | null {
  if (game.year != null) {
    return game.year;
  }
  return playedYear(game);
}

/**
 * Most frequent value, ties broken by the alphabetically first value so the
 * output never depends on insertion order.
 */
function mostFrequent(counts: Map<string, number>): string | null {
  let best: string | null = null;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount || (count === bestCount && (best === null || value < best))) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

/** Most frequent next SAN among `lines` at `ply`, ties alphabetically first. */
function mostFrequentMove(lines: readonly string[][], ply: number): string | null {
  const counts = new Map<string, number>();
  for (const line of lines) {
    const move = line[ply];
    if (move === undefined) {
      continue;
    }
    counts.set(move, (counts.get(move) ?? 0) + 1);
  }
  return mostFrequent(counts);
}

/** Number of `lines` whose `ply` move is `move`. */
function countMove(lines: readonly string[][], ply: number, move: string): number {
  let count = 0;
  for (const line of lines) {
    if (line[ply] === move) {
      count += 1;
    }
  }
  return count;
}

/**
 * Longest SAN prefix shared by at least 60% of ALL the group's games (a game
 * without moves counts against the share). The first ply is always kept when
 * any game has moves, per the issue's "minimum 1 ply" rule; the cap is 12.
 */
function mainLine(lines: readonly string[][], games: number): string[] {
  const withMoves = lines.filter((line) => line.length > 0);
  if (withMoves.length === 0) {
    return [];
  }
  const out: string[] = [];
  let candidates = withMoves;
  for (let ply = 0; ply < MAX_LINE_PLY; ply += 1) {
    const move = mostFrequentMove(candidates, ply);
    if (move === null) {
      break;
    }
    if (out.length > 0) {
      const count = countMove(candidates, ply, move);
      if (count * SHARE_DENOMINATOR < games * SHARE_NUMERATOR) {
        break;
      }
    }
    out.push(move);
    candidates = candidates.filter((line) => line[ply] === move);
  }
  return out;
}

/**
 * The player's openings for one colour, most played first (ties by group key
 * ascending). Groups without any identifying value (`openingGroupKey` "") are
 * skipped; groups under `minGames` (default 1) are dropped after the share is
 * computed against every game of that colour.
 */
export function dossierOpenings(
  games: readonly PlayerGame[],
  color: "white" | "black",
  options: { minGames?: number } = {},
): DossierOpeningRow[] {
  const minGames = options.minGames ?? DEFAULT_MIN_GAMES;
  const colored = games.filter((game) => game.color === color);
  const totalColor = colored.length;
  const groups = new Map<string, Group>();

  for (const game of colored) {
    const key = openingGroupKey(game);
    if (key === "") {
      continue;
    }
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        games: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        spellings: new Map(),
        ecos: new Map(),
        lastYear: null,
        lines: [],
      };
      groups.set(key, group);
    }
    group.games += 1;
    if (game.playerResult === "win") {
      group.wins += 1;
    } else if (game.playerResult === "draw") {
      group.draws += 1;
    } else if (game.playerResult === "loss") {
      group.losses += 1;
    }
    // `playerResult: null` counts toward `games` with 0 points (the same
    // decision as `resultsByOpening` in stats.ts).
    const spelling = game.opening?.trim().replace(/\s+/g, " ") ?? "";
    if (spelling !== "") {
      group.spellings.set(spelling, (group.spellings.get(spelling) ?? 0) + 1);
    }
    const eco = game.eco?.trim().toUpperCase() ?? "";
    if (eco !== "") {
      group.ecos.set(eco, (group.ecos.get(eco) ?? 0) + 1);
    }
    const year = gameYear(game);
    if (year !== null && (group.lastYear === null || year > group.lastYear)) {
      group.lastYear = year;
    }
    group.lines.push(sanMovesForGame(game));
  }

  const rows: DossierOpeningRow[] = [];
  for (const group of groups.values()) {
    if (group.games < minGames) {
      continue;
    }
    rows.push({
      key: group.key,
      eco: mostFrequent(group.ecos),
      opening: mostFrequent(group.spellings),
      games: group.games,
      sharePct: totalColor === 0 ? 0 : Math.round((100 * group.games) / totalColor),
      wins: group.wins,
      draws: group.draws,
      losses: group.losses,
      scorePct: Math.round((100 * (group.wins + 0.5 * group.draws)) / group.games),
      lastYear: group.lastYear,
      line: mainLine(group.lines, group.games),
    });
  }
  rows.sort((a, b) => {
    if (a.games !== b.games) {
      return b.games - a.games;
    }
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });
  return rows;
}
