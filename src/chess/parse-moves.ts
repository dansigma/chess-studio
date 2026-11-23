// SIG-1463: parses moves pasted from the clipboard (plain SAN, with or
// without move numbers) into tree-ready moves played from a given position.
import { Chess } from "chess.js";
import type { TreeNode } from "./tree";

export type PastedMove = Pick<TreeNode, "san" | "uci" | "fen" | "from" | "to">;

export type ParseMovesStop = "end" | "illegal" | "empty";

export type ParsedMoves = {
  moves: PastedMove[];
  /** "end": every token was played; "illegal": stopped at a bad token; "empty": no move tokens. */
  stop: ParseMovesStop;
  /** True when the text looks like a full PGN (tag-pair headers). */
  fullPgn: boolean;
};

const HEADER_RE = /^\s*\[\s*[A-Za-z0-9_]+\s+"[^"]*"\s*\]/m;
const RESULTS = new Set(["1-0", "0-1", "1/2-1/2", "*"]);

export function parseMovesFromText(text: string, fen: string): ParsedMoves {
  if (HEADER_RE.test(text)) {
    return { moves: [], stop: "empty", fullPgn: true };
  }
  const cleaned = text
    .replace(/\{[^}]*\}/g, " ")
    .replace(/;[^\n]*/g, " ")
    .replace(/\$\d+/g, " ");
  const tokens = cleaned
    .split(/\s+/)
    .map((token) =>
      token
        // "12." / "12..." / "12...Nf6" / "1.e4": drop the number prefix.
        .replace(/^\d+\s*\.+\s*/, "")
        .replace(/[!?]+$/, ""),
    )
    .filter((token) => token.length > 0 && token !== "..." && !RESULTS.has(token));
  const chess = new Chess(fen);
  const moves: PastedMove[] = [];
  for (const token of tokens) {
    let move;
    try {
      move = chess.move(token);
    } catch {
      return { moves, stop: "illegal", fullPgn: false };
    }
    moves.push({ san: move.san, uci: move.from + move.to + (move.promotion ?? ""), fen: chess.fen(), from: move.from, to: move.to });
  }
  return { moves, stop: moves.length === 0 ? "empty" : "end", fullPgn: false };
}
