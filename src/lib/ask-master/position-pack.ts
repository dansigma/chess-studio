import { Chess, DEFAULT_POSITION } from "chess.js";
import { applyNullMoveFen } from "../../chess/null-move";
import { structureChanges } from "../../chess/facts/structure";
import type { PositionFacts, ThreatSet } from "../../chess/facts/types";
import { formatScore, type EngineLine } from "../../engine/stockfish-client";
import type { ExplorerGameRow, ExplorerResponse } from "../explorer-types";
import { DEFAULT_ASK_MASTER_LEVEL, type AskMasterLevel } from "./level";

export const POSITION_PACK_BYTES = 15 * 1024;

type PackInput = {
  fen: string;
  sanLine: readonly string[];
  level?: AskMasterLevel;
  startFen?: string;
  opening?: { eco: string; name: string } | null;
  facts?: PositionFacts;
  threats?: readonly ThreatSet[];
  engineLines?: readonly EngineLine[];
  lichess?: ExplorerResponse;
  xd?: ExplorerResponse;
  xdGames?: readonly ExplorerGameRow[];
};

function lastMoveChanges(chess: Chess | undefined, { sanLine, startFen }: PackInput) {
  if (!chess || sanLine.length === 0) return undefined;
  try {
    const replay = new Chess(startFen);
    let before = replay.fen();
    for (const san of sanLine) {
      before = replay.move(san).before;
    }
    const after = replay.fen();
    // Counters do not affect pawn structure, and may differ in imported positions.
    if (after.split(" ", 4).join(" ") === chess.fen().split(" ", 4).join(" ")) {
      return structureChanges(before, after);
    }
  } catch {
    // The history alone cannot identify the previous position if replay fails.
  }
}

function boardFacts(facts: PositionFacts, changes: ReturnType<typeof lastMoveChanges>) {
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
    breaks: facts.breaks.map(({ side, to }) => ({ side, move: to })),
    centre: facts.centre,
    lastMoveChanges: changes,
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
    let board: Chess;
    try {
      board = set.by === chess.turn() ? chess : new Chess(applyNullMoveFen(chess.fen()));
    } catch {
      return []; // No SAN for the side not to move when the null move is illegal.
    }
    const san = new Map(board.moves({ verbose: true }).map((move) => [move.lan, move.san]));
    return set.threats.flatMap(({ uci, kind, targets }) => {
      const move = san.get(uci);
      return move ? [{ kind, by: set.by, san: move, targets }] : [];
    });
  });
}

const PIECE_ORDER = "kqrbnp";

/** Every piece by side, so the model never has to decode the FEN itself. */
function boardList(chess: Chess | undefined) {
  if (!chess) return undefined;
  const sides: Record<"w" | "b", { type: string; name: string }[]> = { w: [], b: [] };
  for (const row of chess.board()) {
    for (const square of row) {
      if (square) sides[square.color].push({ type: square.type, name: `${square.type === "p" ? "" : square.type.toUpperCase()}${square.square}` });
    }
  }
  const list = (pieces: { type: string; name: string }[]) => pieces
    .sort((a, b) => PIECE_ORDER.indexOf(a.type) - PIECE_ORDER.indexOf(b.type))
    .map(({ name }) => name).join(" ");
  return { toMove: chess.turn() === "w" ? "white" : "black", white: list(sides.w), black: list(sides.b) };
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
    board: boardList(chess),
    level,
    moves: [...input.sanLine],
    startFen: input.startFen === DEFAULT_POSITION ? undefined : input.startFen,
    earlierMovesOmitted: undefined as number | undefined,
    opening: opening ?? undefined,
    facts: facts?.valid ? boardFacts(facts, lastMoveChanges(chess, input)) : undefined,
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
