// SIG-1221: the validation-set item format and its validator.
//
// An item is one annotated position: the position before the author's move, the
// move, the author's own words about it, and the labels derived from them.
// Engine ground truth is added later (ground-truth.mjs) under `engine`.
import { Chess } from "chess.js";
import { THEME_IDS } from "./themes.mjs";

/**
 * @typedef {{ san: string, uci: string }} MoveRef
 * @typedef {{ course: string, chapter: string | null, file: string | null, game: number | null }} ItemSource
 * @typedef {{ cp: number } | { mate: number }} Score
 * @typedef {{ rank: number, score: Score, pv: string[], pvSan: string[] }} EngineLine
 * @typedef {{
 *   engine: string, depth: number, multipv: number,
 *   bestmove: string | null, lines: EngineLine[],
 *   playedLineScore: Score | null, evalBefore: Score | null,
 *   evalAfter: { score: Score, pv: string[], pvSan: string[] } | null,
 *   authorMoveScore: Score | null, lossCp: number | null,
 * }} EngineTruth
 * @typedef {{
 *   id: string, source: ItemSource, fen: string,
 *   playedMove: MoveRef, contextPgn: string,
 *   authorText: string, authorBestMove: MoveRef | null, nags: number[],
 *   themes: string[], handLabelled: boolean, textThemes: string[],
 *   unmappedThemes: string[], unknownTags: string[],
 *   phase: "opening" | "middlegame" | "endgame",
 *   tactical: boolean,
 *   ratingBand: string,
 *   mustMention: string[], mustNotClaim: string[],
 *   engine?: EngineTruth, authorDisagrees?: { flag: boolean, reasons: string[] },
 * }} ValsetItem
 */

export const PHASES = ["opening", "middlegame", "endgame"];
export const RATING_BANDS = ["<1200", "1200-1599", "1600-1999", "2000+", "unrated"];

/** NAGs that mark the move as bad / good (PGN: $2 ? $4 ?? $6 ?! / $1 ! $3 !!). */
export const BAD_MOVE_NAGS = [2, 4, 6];
export const GOOD_MOVE_NAGS = [1, 3];

export function ratingBandFor(elo) {
  if (!Number.isFinite(elo) || elo <= 0) return "unrated";
  if (elo < 1200) return "<1200";
  if (elo < 1600) return "1200-1599";
  if (elo < 2000) return "1600-1999";
  return "2000+";
}

const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validate one item. Returns every problem found (not just the first), each
 * prefixed with the item id so a bad line in a 500-line file is easy to find.
 * @param {unknown} item
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateItem(item) {
  const errors = [];
  const id = isRecord(item) && typeof item.id === "string" && item.id ? item.id : "(no id)";
  const fail = (message) => errors.push(`${id}: ${message}`);

  if (!isRecord(item)) {
    return { ok: false, errors: ["(item): must be an object"] };
  }
  if (typeof item.id !== "string" || !/^[A-Za-z0-9._-]+$/.test(item.id)) {
    fail("id must be a non-empty string of letters, digits, '.', '_' or '-'");
  }
  if (!isRecord(item.source) || typeof item.source.course !== "string" || !item.source.course.trim()) {
    fail("source.course must be a non-empty string");
  }

  let board = null;
  if (typeof item.fen !== "string") {
    fail("fen must be a string");
  } else {
    try {
      board = new Chess(item.fen);
    } catch (error) {
      fail(`illegal FEN "${item.fen}" (${error instanceof Error ? error.message.split("\n")[0] : "invalid"})`);
    }
  }

  if (!isRecord(item.playedMove) || typeof item.playedMove.san !== "string" || typeof item.playedMove.uci !== "string") {
    fail("playedMove must be { san, uci }");
  } else if (!UCI.test(item.playedMove.uci)) {
    fail(`playedMove.uci "${item.playedMove.uci}" is not UCI`);
  } else if (board) {
    checkMove(board, item.playedMove, "playedMove", fail);
  }

  if (item.authorBestMove !== null && item.authorBestMove !== undefined) {
    if (!isRecord(item.authorBestMove) || typeof item.authorBestMove.san !== "string" || typeof item.authorBestMove.uci !== "string") {
      fail("authorBestMove must be null or { san, uci }");
    } else if (!UCI.test(item.authorBestMove.uci)) {
      fail(`authorBestMove.uci "${item.authorBestMove.uci}" is not UCI`);
    } else if (board) {
      checkMove(board, item.authorBestMove, "authorBestMove", fail);
    }
  }

  if (typeof item.authorText !== "string") {
    fail("authorText must be a string (empty when the move only carries a NAG)");
  }
  if (typeof item.contextPgn !== "string") {
    fail("contextPgn must be a string");
  }
  if (!Array.isArray(item.nags) || item.nags.some((nag) => !Number.isInteger(nag) || nag <= 0)) {
    fail("nags must be an array of positive integers");
  }

  for (const key of ["themes", "mustMention", "mustNotClaim"]) {
    const list = item[key];
    if (!Array.isArray(list)) {
      fail(`${key} must be an array`);
      continue;
    }
    for (const theme of list) {
      if (!THEME_IDS.includes(theme)) {
        fail(`unknown theme "${theme}" in ${key} (known: ${THEME_IDS.join(", ")})`);
      }
    }
  }

  if (!PHASES.includes(item.phase)) {
    fail(`phase must be one of ${PHASES.join(", ")}`);
  }
  if (!RATING_BANDS.includes(item.ratingBand)) {
    fail(`ratingBand must be one of ${RATING_BANDS.join(", ")}`);
  }
  if (typeof item.tactical !== "boolean") {
    fail("tactical must be a boolean");
  }
  return { ok: errors.length === 0, errors };
}

function checkMove(board, move, field, fail) {
  const probe = new Chess(board.fen());
  try {
    const played = probe.move({ from: move.uci.slice(0, 2), to: move.uci.slice(2, 4), promotion: move.uci[4] });
    if (played.san !== move.san) {
      fail(`${field}.san "${move.san}" does not match uci ${move.uci} (${played.san})`);
    }
  } catch {
    fail(`illegal ${field} ${move.uci} (${move.san}) in this position`);
  }
}

/** Validate a list; also rejects duplicate ids. */
export function validateItems(items) {
  const errors = [];
  const seen = new Set();
  for (const item of items) {
    errors.push(...validateItem(item).errors);
    if (isRecord(item) && typeof item.id === "string") {
      if (seen.has(item.id)) {
        errors.push(`${item.id}: duplicate id`);
      }
      seen.add(item.id);
    }
  }
  return { ok: errors.length === 0, errors };
}

/** Parse JSONL text into items, reporting the line number of malformed JSON. */
export function parseJsonl(text, label = "items") {
  const items = [];
  const errors = [];
  text.split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return;
    try {
      items.push(JSON.parse(line));
    } catch {
      errors.push(`${label}:${index + 1}: not valid JSON`);
    }
  });
  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }
  return items;
}

export function toJsonl(items) {
  return items.map((item) => JSON.stringify(item)).join("\n") + (items.length ? "\n" : "");
}
