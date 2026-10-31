// SIG-1048: pure per-color opening-line tree (Insights 1/4).
// Dependency-free; same grain as `stats.ts` (total functions, no throws,
// deterministic). The tree follows the move sequence verbatim —
// transpositions are NOT merged — up to `maxPly` plies deep.
export type OpeningTreeGame = {
  sans: string[];
  color: "white" | "black";
  result: "win" | "loss" | "draw" | null;
  playedAt: number | null;
  accuracy: number | null;
  timeClass: string | null;
  rated: boolean | null;
};

export type OpeningTreeFilters = {
  timeClass?: string;
  ratedOnly?: boolean;
  from?: number;
  to?: number;
};

export type OpeningTreeOptions = {
  color: "white" | "black";
  maxPly?: number;
  now: number;
  filters?: OpeningTreeFilters;
};

export type TrendEntry = { games: number; scorePct: number } | null;

export type OpeningNode = {
  san: string;
  ply: number;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  scorePct: number;
  avgAccuracy: number | null;
  trend: { m1: TrendEntry; m3: TrendEntry; m6: TrendEntry; m12: TrendEntry };
  children: OpeningNode[];
};

export type WorstLine = { path: string[]; node: OpeningNode };

const DEFAULT_MAX_PLY = 12;

function scoreOf(games: number, wins: number, draws: number): number {
  if (games === 0) {
    return 0;
  }
  // Same draws-half-point scoring as `resultsByOpening` in stats.ts.
  return Math.round((100 * (wins + 0.5 * draws)) / games);
}

/**
 * UTC calendar-month cutoff: games with `playedAt >= cutoff` are in the
 * window. The day clamps to the last day of the target month so "3 months
 * before Oct 31" is Jul 31 (not Aug 1 via day overflow).
 */
function monthCutoff(now: number, months: number): number {
  const at = new Date(now);
  const year = at.getUTCFullYear();
  const month = at.getUTCMonth() - months;
  // Last day of the target month: day 0 of the following month.
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(at.getUTCDate(), lastDay);
  return Date.UTC(
    year,
    month,
    day,
    at.getUTCHours(),
    at.getUTCMinutes(),
    at.getUTCSeconds(),
    at.getUTCMilliseconds(),
  );
}

type MutableNode = {
  san: string;
  ply: number;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  accuracySum: number;
  accuracyCount: number;
  windowGames: [number, number, number, number];
  windowPoints: [number, number, number, number];
  children: Map<string, MutableNode>;
};

function createMutable(san: string, ply: number): MutableNode {
  return {
    san,
    ply,
    games: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    accuracySum: 0,
    accuracyCount: 0,
    windowGames: [0, 0, 0, 0],
    windowPoints: [0, 0, 0, 0],
    children: new Map(),
  };
}

function observe(node: MutableNode, game: OpeningTreeGame, cutoffs: [number, number, number, number]): void {
  node.games += 1;
  let points = 0;
  if (game.result === "win") {
    node.wins += 1;
    points = 1;
  } else if (game.result === "draw") {
    node.draws += 1;
    points = 0.5;
  } else if (game.result === "loss") {
    node.losses += 1;
  }
  // `result: null` (unfinished / outcome-less imports) counts toward `games`
  // with 0 points — the same one-line decision `resultsByOpening` makes:
  // dropping them would inflate the score of lines full of abandoned games.
  if (typeof game.accuracy === "number" && Number.isFinite(game.accuracy)) {
    node.accuracySum += game.accuracy;
    node.accuracyCount += 1;
  }
  if (typeof game.playedAt === "number" && Number.isFinite(game.playedAt)) {
    for (let i = 0; i < 4; i += 1) {
      if (game.playedAt >= cutoffs[i]) {
        node.windowGames[i] += 1;
        node.windowPoints[i] += points;
      }
    }
  }
}

function trendEntry(games: number, points: number): TrendEntry {
  if (games === 0) {
    return null;
  }
  return { games, scorePct: Math.round((100 * points) / games) };
}

function finalize(node: MutableNode): OpeningNode {
  const children = [...node.children.values()].map(finalize);
  children.sort((a, b) => {
    if (a.games !== b.games) {
      return b.games - a.games;
    }
    return a.san < b.san ? -1 : a.san > b.san ? 1 : 0;
  });
  return {
    san: node.san,
    ply: node.ply,
    games: node.games,
    wins: node.wins,
    draws: node.draws,
    losses: node.losses,
    scorePct: scoreOf(node.games, node.wins, node.draws),
    avgAccuracy: node.accuracyCount === 0 ? null : node.accuracySum / node.accuracyCount,
    trend: {
      m1: trendEntry(node.windowGames[0], node.windowPoints[0]),
      m3: trendEntry(node.windowGames[1], node.windowPoints[1]),
      m6: trendEntry(node.windowGames[2], node.windowPoints[2]),
      m12: trendEntry(node.windowGames[3], node.windowPoints[3]),
    },
    children,
  };
}

/**
 * Builds the per-color opening tree over the given games. Filters apply
 * before aggregation; the root aggregates every post-filter game. Games with
 * `playedAt: null` count in node totals but in no trend window.
 */
export function buildOpeningTree(games: readonly OpeningTreeGame[], options: OpeningTreeOptions): OpeningNode {
  const maxPly = Number.isFinite(options.maxPly ?? DEFAULT_MAX_PLY)
    ? Math.max(0, Math.floor(options.maxPly ?? DEFAULT_MAX_PLY))
    : 0;
  const filters = options.filters ?? {};
  const cutoffs: [number, number, number, number] = [
    monthCutoff(options.now, 1),
    monthCutoff(options.now, 3),
    monthCutoff(options.now, 6),
    monthCutoff(options.now, 12),
  ];
  const root = createMutable("", 0);
  for (const game of games) {
    if (game.color !== options.color) {
      continue;
    }
    if (filters.timeClass !== undefined && game.timeClass !== filters.timeClass) {
      continue;
    }
    if (filters.ratedOnly === true && game.rated !== true) {
      continue;
    }
    // Null timestamps pass date bounds (they are excluded from trend
    // windows at observe time, never from totals).
    if (typeof game.playedAt === "number" && Number.isFinite(game.playedAt)) {
      if (filters.from !== undefined && game.playedAt < filters.from) {
        continue;
      }
      if (filters.to !== undefined && game.playedAt > filters.to) {
        continue;
      }
    }
    const sans = game.sans.slice(0, maxPly);
    observe(root, game, cutoffs);
    let node = root;
    for (let ply = 0; ply < sans.length; ply += 1) {
      const san = sans[ply];
      if (typeof san !== "string" || san === "") {
        break;
      }
      let child = node.children.get(san);
      if (!child) {
        child = createMutable(san, ply + 1);
        node.children.set(san, child);
      }
      observe(child, game, cutoffs);
      node = child;
    }
  }
  return finalize(root);
}

/**
 * Flags the lines that perform worst: nodes with at least `minGames` games
 * and a score strictly under `maxScore`, worst first. A node whose parent
 * was flagged with the same game count is suppressed — pre-order, so the
 * shallower node wins the flag. Suppression does not propagate past the
 * suppressed node: a grandchild with the same game count as a suppressed
 * node is still flagged (the issue only suppresses "a node whose parent is
 * flagged", and the suppressed node was never flagged).
 */
export function worstLines(root: OpeningNode, opts?: { minGames?: number; maxScore?: number }): WorstLine[] {
  const minGames = opts?.minGames ?? 5;
  const maxScore = opts?.maxScore ?? 40;
  const out: WorstLine[] = [];
  function visit(node: OpeningNode, path: string[], flagged: boolean): void {
    for (const child of node.children) {
      const childPath = [...path, child.san];
      const suppressed = flagged && child.games === node.games;
      const childFlagged = !suppressed && child.games >= minGames && child.scorePct < maxScore;
      if (childFlagged) {
        out.push({ path: childPath, node: child });
      }
      visit(child, childPath, childFlagged);
    }
  }
  // The root itself is never flagged (it aggregates the whole color).
  visit(root, [], false);
  out.sort((a, b) => {
    if (a.node.scorePct !== b.node.scorePct) {
      return a.node.scorePct - b.node.scorePct;
    }
    if (a.node.games !== b.node.games) {
      return b.node.games - a.node.games;
    }
    const ap = a.path.join(" ");
    const bp = b.path.join(" ");
    return ap < bp ? -1 : ap > bp ? 1 : 0;
  });
  return out;
}
