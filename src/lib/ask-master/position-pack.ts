import { Chess } from "chess.js";
import { applyNullMoveFen } from "../../chess/null-move";
import type { PositionFacts, ThreatSet } from "../../chess/facts/types";
import { formatScore, type EngineLine } from "../../engine/stockfish-client";
import type { ExplorerGameRow, ExplorerResponse } from "../explorer-types";
import { DEFAULT_ASK_MASTER_LEVEL, type AskMasterLevel } from "./level";

export const POSITION_PACK_BYTES = 15 * 1024;

type PackInput = {
  fen: string;
  sanLine: readonly string[];
  level?: AskMasterLevel;
  opening?: { eco: string; name: string } | null;
  facts?: PositionFacts;
  threats?: readonly ThreatSet[];
  engineLines?: readonly EngineLine[];
  lichess?: ExplorerResponse;
  xd?: ExplorerResponse;
  xdGames?: readonly ExplorerGameRow[];
};

function boardFacts(facts: PositionFacts) {
  const pieces = new Map(facts.pieces.map(({ square, type }) => [
    square, `${type === "p" ? "" : type.toUpperCase()}${square}`,
  ]));
  const pieceAt = (square: string) => pieces.get(square) ?? square;
  return {
    hanging: facts.pieces.filter((piece) => piece.hanging).map(({ square }) => pieceAt(square)),
    pins: facts.pieces.flatMap(({ square, pinned }) => pinned
      ? [{ kind: pinned.kind, piece: pieceAt(square), by: pieceAt(pinned.by), to: pieceAt(pinned.to) }]
      : []),
    trapped: facts.pieces.filter((piece) => piece.trapped).map(({ square }) => pieceAt(square)),
    skewers: facts.skewers.map(({ by, front, behind }) => ({
      by: pieceAt(by), front: pieceAt(front), behind: pieceAt(behind),
    })),
    files: facts.files,
    pawns: [...facts.pawns],
    weakSquares: [...facts.weakSquares],
    outposts: facts.outposts,
    kings: facts.kings,
  };
}

function explorerRows(chess: Chess | undefined, source?: ExplorerResponse) {
  if (!chess || !source || source.notice) return undefined;
  const san = new Map(chess.moves({ verbose: true }).map((move) => [move.lan, move.san]));
  return source.moves.filter((row) => row.games > 0 && san.has(row.uci))
    .sort((a, b) => b.games - a.games)
    .map((row) => ({
      san: san.get(row.uci)!,
      games: row.games,
      whitePct: Math.round(row.white * 100 / row.games),
      drawPct: Math.round(row.draws * 100 / row.games),
      blackPct: Math.round(row.black * 100 / row.games),
    }));
}

function threatRows(chess: Chess | undefined, threats?: readonly ThreatSet[]) {
  if (!chess || !threats) return undefined;
  return threats.flatMap((set) => {
    if (set.status !== "ok") return [];
    const board = set.by === chess.turn() ? chess : new Chess(applyNullMoveFen(chess.fen()));
    const san = new Map(board.moves({ verbose: true }).map((move) => [move.lan, move.san]));
    return set.threats.flatMap(({ uci, kind, targets }) => {
      const move = san.get(uci);
      return move ? [{ kind, by: set.by, san: move, targets }] : [];
    });
  });
}

export function buildPositionPack(input: PackInput) {
  const { fen, level = DEFAULT_ASK_MASTER_LEVEL, opening, facts, threats, lichess, xd, xdGames, engineLines } = input;
  let chess: Chess | undefined;
  try {
    chess = new Chess(fen);
  } catch {
    // Keep the submitted position and history even when board data is unavailable.
  }

  const pack = {
    fen,
    level,
    moves: [...input.sanLine],
    earlierMovesOmitted: undefined as number | undefined,
    opening: opening ?? undefined,
    facts: facts?.valid ? boardFacts(facts) : undefined,
    threats: threatRows(chess, threats),
    engine: chess && engineLines?.length
      ? engineLines.slice(0, 3).map((line) => ({
        san: line.pvSan,
        eval: formatScore(line, chess.turn()).replace("M", "#"),
      }))
      : undefined,
    lichess: explorerRows(chess, lichess),
    xd: explorerRows(chess, xd),
    xdGames: xdGames?.slice(0, 8).map((game) => ({
      id: game.id,
      white: game.whiteName,
      black: game.blackName,
      whiteRating: game.whiteRating,
      blackRating: game.blackRating,
      year: game.year,
      result: game.winner === "white" ? "1-0" : game.winner === "black" ? "0-1" : game.winner === "draw" ? "1/2-1/2" : null,
      event: game.event,
    })),
  };

  const encoder = new TextEncoder();
  function overBudget() {
    return encoder.encode(JSON.stringify(pack).replaceAll("<", "\\u003c")).byteLength > POSITION_PACK_BYTES;
  }

  while (pack.xdGames?.length && overBudget()) pack.xdGames.pop();
  while (Math.max(pack.lichess?.length ?? 0, pack.xd?.length ?? 0) > 6 && overBudget()) {
    const rows = (pack.lichess?.length ?? 0) >= (pack.xd?.length ?? 0) ? pack.lichess : pack.xd;
    rows?.pop();
  }
  for (const detail of [pack.facts?.weakSquares, pack.facts?.skewers, pack.facts?.pawns, pack.threats]) {
    while (detail?.length && overBudget()) detail.pop();
  }
  // Protect the useful position data even for unusually long imported games.
  while (pack.moves.length && overBudget()) {
    pack.moves.splice(0, Math.ceil(pack.moves.length / 4));
    pack.earlierMovesOmitted = input.sanLine.length - pack.moves.length;
  }
  if (overBudget()) {
    const minimal: Partial<typeof pack> & Pick<typeof pack, "fen" | "moves" | "level"> = { fen, level, moves: [] };
    return minimal;
  }
  return pack;
}
