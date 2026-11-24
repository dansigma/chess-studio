import { Chess } from "chess.js";
import { isSiteLocale } from "../../src/i18n/locale.ts";
import { isAskMasterIntent } from "../../src/lib/ask-master/intent.ts";
import { isAskMasterLevel } from "../../src/lib/ask-master/level.ts";
import { isExplorerResponse } from "../../src/lib/explorer-types.ts";
export { parseJsonl } from "../valset/schema.mjs";

const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const nonempty = (value) => typeof value === "string" && value.trim().length > 0;
const strings = (value) => Array.isArray(value) && value.every(nonempty);

export function replayItem(item) {
  if (!item.sanLine?.length) return [new Chess(item.fen).fen()];
  const board = new Chess(item.startFen);
  const fens = [board.fen()];
  for (const san of item.sanLine) {
    const move = board.move(san, { strict: true });
    if (move.from === move.to) throw new Error("null moves are unsupported");
    fens.push(board.fen());
  }
  return fens;
}

function isEngineLine(line) {
  return record(line) && strings(line.pvSan) && strings(line.pvUci) &&
    line.pvSan.length > 0 && line.pvSan.length === line.pvUci.length &&
    line.pvUci.every((uci) => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) &&
    Number.isInteger(line.depth) && line.depth >= 0 &&
    Number.isInteger(line.multipv) && line.multipv > 0 &&
    ((Number.isInteger(line.scoreCp) && line.mate === null) ||
      (Number.isInteger(line.mate) && line.scoreCp === null)) &&
    [null, "upper", "lower"].includes(line.bound);
}

function validateItem(item) {
  if (!record(item)) return ["expected an object"];
  const errors = [];
  if (typeof item.id !== "string" || !/^[A-Za-z0-9._-]+$/.test(item.id)) errors.push("invalid id");
  if (!isSiteLocale(item.locale)) errors.push("invalid locale");
  if (!isAskMasterLevel(item.level)) errors.push("invalid level");
  if (!isAskMasterIntent(item.intent)) errors.push("invalid intent");
  if (!nonempty(item.question)) errors.push("question must be non-empty");
  if (!strings(item.mustMention) || item.mustMention.length < 3 || item.mustMention.length > 5) {
    errors.push("mustMention must contain 3–5 non-empty strings");
  }
  if (!strings(item.mustNotClaim)) errors.push("mustNotClaim must be an array of non-empty strings");
  if (item.sanLine !== undefined && !strings(item.sanLine)) errors.push("sanLine must be an array of SAN strings");
  try {
    if (typeof item.fen !== "string") throw new Error("fen must be a string");
    const fen = new Chess(item.fen).fen();
    if (item.startFen !== undefined) {
      if (typeof item.startFen !== "string") throw new Error("startFen must be a string");
      const startFen = new Chess(item.startFen).fen();
      if (!item.sanLine?.length && startFen !== fen) throw new Error("startFen differs from fen without moves");
    }
    if (replayItem(item).at(-1) !== fen) throw new Error("sanLine does not reach fen");
  } catch (error) {
    errors.push(error.message);
  }
  if (item.engineLines !== undefined && (!Array.isArray(item.engineLines) || !item.engineLines.every(isEngineLine))) {
    errors.push("engineLines must contain EngineLine objects");
  }
  for (const source of ["lichess", "xd"]) {
    const snapshot = item[source];
    if (snapshot !== undefined && (!isExplorerResponse(snapshot) ||
      (snapshot.notice !== undefined && typeof snapshot.notice !== "string"))) {
      errors.push(`${source} must be an ExplorerResponse`);
    }
  }
  // Reuse the explorer's game-row guard via its response validator.
  if (item.xdGames !== undefined && !isExplorerResponse({
    fen: item.fen, source: "xadrez-digital", white: 0, draws: 0, black: 0, moves: [], games: item.xdGames,
  })) errors.push("xdGames must contain ExplorerGameRow objects");
  return errors;
}

export function validateItems(items) {
  const errors = [];
  const ids = new Set();
  for (const [index, item] of items.entries()) {
    const label = `item ${index + 1}${nonempty(item?.id) ? ` (${item.id})` : ""}`;
    for (const error of validateItem(item)) errors.push(`${label}: ${error}`);
    if (ids.has(item?.id)) errors.push(`${label}: duplicate id`);
    if (nonempty(item?.id)) ids.add(item.id);
  }
  if (!items.length) errors.push("dataset is empty");
  return { ok: errors.length === 0, errors };
}
