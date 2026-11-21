import type { RepertoireScopeFilter } from "./repertoire-scope";
import { sideFromFen } from "./move-notation";
import { getDueRepertoireMoves, repertoireMoves, type SpacedRepetitionItem } from "./repertoire";
import { getFenAt, getNodeAt, type GameTree, type Path } from "./tree";

export type TrainingAttempt =
  | { kind: "accepted"; path: Path }
  | { kind: "refused" }
  | { kind: "complete" };

export function trainingAttempt(tree: GameTree, path: Path, uci: string, filter?: RepertoireScopeFilter): TrainingAttempt {
  const moves = repertoireMoves(tree, path, filter);
  if (moves.length === 0) {
    return { kind: "complete" };
  }
  const match = moves.find((move) => move.uci === uci);
  if (!match || !getNodeAt(tree, match.path)) {
    return { kind: "refused" };
  }
  return { kind: "accepted", path: match.path };
}

type Color = "w" | "b";

export function trainingColor(board: {
  repertoireColor?: "white" | "black" | null;
  orientation: "white" | "black";
}): Color {
  return (board.repertoireColor ?? board.orientation) === "black" ? "b" : "w";
}

export function pickOpponentReply(
  tree: GameTree,
  path: Path,
  progress: Record<string, SpacedRepetitionItem>,
  rng: () => number = Math.random,
  filter?: RepertoireScopeFilter,
): Path | null {
  const userColor = sideFromFen(getFenAt(tree, path)) === "w" ? "b" : "w";
  const now = new Date();
  let bestScore = -1;
  let bestPaths: Path[] = [];

  for (const move of repertoireMoves(tree, path, filter)) {
    const node = getNodeAt(tree, move.path);
    if (!node) {
      continue;
    }
    const score = getDueRepertoireMoves(
      { startFen: node.fen, children: node.children },
      progress,
      userColor,
      now,
      filter && ((path, fen) => filter([...move.path, ...path], fen)),
    ).length;
    if (score > bestScore) {
      bestScore = score;
      bestPaths = [move.path];
    } else if (score === bestScore) {
      bestPaths.push(move.path);
    }
  }

  if (bestPaths.length <= 1) {
    return bestPaths[0] ?? null;
  }
  return bestPaths[Math.floor(rng() * bestPaths.length)];
}
