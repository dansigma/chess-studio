// SIG-1040: pure comparison of an imported game against a repertoire tree.
// Given the repertoire's moves for a color and a game, find the first point
// where the game leaves the repertoire and say who is responsible. Positions
// are matched with `fenKey` (position without move counters), exactly like
// `repertoireMoves`, so transpositions are recognized.
import { fenKey, flattenMainLine, type GameTree } from "./tree.ts";

export type DeviationKind =
  | "user_deviation"
  | "opponent_gap"
  | "line_ended"
  | "never_entered"
  | "none";

export type RepertoireOption = {
  uci: string;
  san: string;
};

export type DeviationEvent =
  | { kind: "none" }
  | {
      kind: "user_deviation" | "opponent_gap" | "line_ended" | "never_entered";
      /** 1-based ply over the game's main line. */
      ply: number;
      /** Position before the played move — the board the repertoire answers. */
      fen: string;
      /** The game's move at ply ("" when the game has no move there). */
      playedUci: string;
      playedSan: string;
      /** The repertoire's alternatives at fen. */
      repertoireMoves: RepertoireOption[];
    };

/**
 * Index of every position in the repertoire (the root's start position plus
 * every node's resulting position) to that position's continuations,
 * de-duplicated by `uci` with first-wins order — the same dedupe
 * `repertoireMoves` applies. Read-only; leaf positions map to an empty array
 * so key presence means "position is in the repertoire" and emptiness means
 * "the line ends here".
 */
export function buildRepertoireIndex(tree: GameTree): Map<string, RepertoireOption[]> {
  const index = new Map<string, RepertoireOption[]>();
  const seenPerKey = new Map<string, Set<string>>();

  function addPosition(fen: string, children: { uci: string; san: string }[]): void {
    const key = fenKey(fen);
    let entry = index.get(key);
    if (!entry) {
      entry = [];
      index.set(key, entry);
      seenPerKey.set(key, new Set());
    }
    const seen = seenPerKey.get(key);
    if (!seen) {
      return;
    }
    for (const child of children) {
      if (seen.has(child.uci)) {
        continue;
      }
      seen.add(child.uci);
      entry.push({ uci: child.uci, san: child.san });
    }
  }

  addPosition(tree.startFen, tree.children);
  function walk(nodes: GameTree["children"]): void {
    for (const node of nodes) {
      addPosition(node.fen, node.children);
      walk(node.children);
    }
  }
  walk(tree.children);
  return index;
}

function sideToMove(fen: string): "w" | "b" {
  return fen.split(" ")[1] === "b" ? "b" : "w";
}

/**
 * Walk the game's main line ply by ply and return the first point where the
 * game and the repertoire disagree. `userColor` decides whose moves are the
 * user's responsibility: a mismatch on the user's turn is `user_deviation`,
 * on the opponent's turn `opponent_gap`. A game position with no repertoire
 * moves is `line_ended`; a game whose first position is absent from the
 * repertoire is `never_entered`. A game that stays inside the repertoire to
 * its end returns `{ kind: "none" }`. Pure reads; neither tree is mutated.
 */
export function findDeviation(args: {
  repertoire: GameTree;
  game: GameTree;
  userColor: "white" | "black";
}): DeviationEvent {
  const { repertoire, game, userColor } = args;
  const index = buildRepertoireIndex(repertoire);
  const line = flattenMainLine(game);
  if (line.length === 0) {
    return { kind: "none" };
  }
  const userSide = userColor === "black" ? "b" : "w";
  for (let i = 0; i < line.length; i += 1) {
    const node = line[i];
    if (!node) {
      continue;
    }
    const beforeFen = i === 0 ? game.startFen : (line[i - 1]?.fen ?? game.startFen);
    const entry = index.get(fenKey(beforeFen));
    if (entry === undefined || (i === 0 && entry.length === 0)) {
      // Missing key: the game's first position is absent from the repertoire.
      // Empty entry at ply 1: the repertoire is empty (e.g. `createEmptyTree()`
      // still indexes its root to `[]`), so the game never entered it either.
      // Past ply 1 both are unreachable by the induction invariant — matched
      // moves always land on a repertoire position — so any empty entry there
      // means the line ended (handled below).
      return {
        kind: "never_entered",
        ply: i + 1,
        fen: beforeFen,
        playedUci: node.uci,
        playedSan: node.san,
        repertoireMoves: [],
      };
    }
    if (entry.length === 0) {
      return {
        kind: "line_ended",
        ply: i + 1,
        fen: beforeFen,
        playedUci: node.uci,
        playedSan: node.san,
        repertoireMoves: [],
      };
    }
    if (!entry.some((option) => option.uci === node.uci)) {
      return {
        kind: sideToMove(beforeFen) === userSide ? "user_deviation" : "opponent_gap",
        ply: i + 1,
        fen: beforeFen,
        playedUci: node.uci,
        playedSan: node.san,
        repertoireMoves: entry.map((option) => ({ ...option })),
      };
    }
  }
  return { kind: "none" };
}

/**
 * Plain move reference for the deviation event ("7…Nf6" style: move number,
 * dots for Black, SAN), so the UI never rebuilds it. "" when there is no
 * played move to point at (`none`, or an event with an empty played SAN).
 */
export function deviationLabel(event: DeviationEvent): string {
  if (event.kind === "none" || !event.playedSan) {
    return "";
  }
  const parts = event.fen.split(" ");
  const side = parts[1] === "b" ? "b" : "w";
  const fullmove = Number(parts[5]) || 1;
  return side === "w" ? `${fullmove}. ${event.playedSan}` : `${fullmove}…${event.playedSan}`;
}
