// SIG-1287: one broadcast PGN -> LiveGameUpdate. Reuses the app's PGN import (headers, [%clk]) and
// replays the main line with chess.js for the board and the last move.
import { Chess } from "chess.js";
import { parseClockMs } from "../../chess/clock";
import { importPgn } from "../../chess/pgn";
import { nodeEval } from "../../chess/pgn-eval";
import type { TreeNode } from "../../chess/tree";
import type { LiveGameUpdate, LiveResult, LiveUpdatePlayer } from "./types";

/** Lichess sends the draw as `½-½` in JSON and `1/2-1/2` in PGN. */
export function normalizeResult(value: unknown): LiveResult {
  if (typeof value !== "string") {
    return "*";
  }
  const text = value.trim().replace(/½/g, "1/2");
  return text === "1-0" || text === "0-1" || text === "1/2-1/2" ? text : "*";
}

/** Last non-empty path segment of a URL (`.../round-3/djmeJZUw/rKzXoQpT` -> `rKzXoQpT`). */
export function lastUrlSegment(url: string | undefined): string | null {
  if (!url) {
    return null;
  }
  const path = url.split(/[?#]/)[0] ?? "";
  const segments = path.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? null;
}

function intOrNull(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** A header value, trimmed; null when absent, empty or Lichess' "?" placeholder. */
function headerText(headers: Record<string, string>, key: string): string | null {
  const value = headers[key]?.trim();
  return value && value !== "?" ? value : null;
}

function player(headers: Record<string, string>, side: "White" | "Black"): LiveUpdatePlayer {
  const title = headers[`${side}Title`]?.trim();
  return {
    name: headers[side]?.trim() || side,
    title: title ? title : null,
    rating: intOrNull(headers[`${side}Elo`]),
    fideId: intOrNull(headers[`${side}FideId`]),
  };
}

type Replay = { fen: string; lastMoveUci: string | null };

function replayMainline(startFen: string, nodes: TreeNode[]): Replay {
  const chess = new Chess(startFen, { skipValidation: true });
  let lastMoveUci: string | null = null;
  for (const node of nodes) {
    try {
      const move = chess.move(node.san);
      lastMoveUci = `${move.from}${move.to}${move.promotion ?? ""}`;
    } catch {
      break;
    }
  }
  return { fen: chess.fen(), lastMoveUci };
}

/**
 * Parse one game PGN as sent by the round stream or the round PGN. Returns null when the game has
 * no `GameURL` (no id to key it by). Other comments are tolerated.
 *
 * `lastEval` is the `[%eval]` of the last mainline move (SIG-1312), null when that move has none.
 *
 * Clocks come from the last `[%clk]` of each side; a game with no moves falls back to the
 * `[WhiteClock]`/`[BlackClock]` headers.
 */
export function parseGame(pgn: string, roundId: string): LiveGameUpdate | null {
  const imported = importPgn(pgn);
  const headers = imported.headers;
  const id = lastUrlSegment(headers.GameURL);
  if (!id) {
    return null;
  }
  const mainline: TreeNode[] = [];
  for (let node = imported.tree.children[0]; node; node = node.children[0]) {
    mainline.push(node);
  }
  const startFen = imported.tree.startFen;
  const { fen, lastMoveUci } = replayMainline(startFen, mainline);

  const whiteMovesFirst = (startFen.split(/\s+/)[1] ?? "w") !== "b";
  let whiteClockMs: number | null = null;
  let blackClockMs: number | null = null;
  mainline.forEach((node, index) => {
    if (node.clockMs === undefined) {
      return;
    }
    if ((index % 2 === 0) === whiteMovesFirst) {
      whiteClockMs = node.clockMs;
    } else {
      blackClockMs = node.clockMs;
    }
  });
  if (mainline.length === 0) {
    whiteClockMs = parseClockMs(headers.WhiteClock) ?? null;
    blackClockMs = parseClockMs(headers.BlackClock) ?? null;
  }

  return {
    id,
    roundId,
    pgn,
    fen,
    lastMoveUci,
    result: normalizeResult(headers.Result),
    white: player(headers, "White"),
    black: player(headers, "Black"),
    whiteClockMs,
    blackClockMs,
    lastEval: nodeEval(mainline[mainline.length - 1]) ?? null,
    eco: headerText(headers, "ECO"),
    opening: headerText(headers, "Opening"),
  };
}
