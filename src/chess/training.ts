import { repertoireMoves } from "./repertoire";
import { getNodeAt, type GameTree, type Path } from "./tree";

export type TrainingAttempt =
  | { kind: "accepted"; path: Path }
  | { kind: "refused" }
  | { kind: "complete" };

export function trainingAttempt(tree: GameTree, path: Path, uci: string): TrainingAttempt {
  const moves = repertoireMoves(tree, path);
  if (moves.length === 0) {
    return { kind: "complete" };
  }
  const match = moves.find((move) => move.uci === uci);
  if (!match || !getNodeAt(tree, match.path)) {
    return { kind: "refused" };
  }
  return { kind: "accepted", path: match.path };
}
