import { Chess, type Move } from "chess.js";
import { parseGame, type ParseTree } from "@mliebelt/pgn-parser";
import type { PgnMove } from "@mliebelt/pgn-types";
import { formatCommentWithMarks, marksAreEmpty, marksFromPgnArrays, mergeMarks, parseMarksFromComment } from "./marks";
import { applyNullMoveFen, isNullMoveToken, NULL_MOVE_SAN, NULL_MOVE_UCI } from "./null-move";
import { pgnGameChunks, sanMovesFromPgn } from "./pgn-clean";
import { formatPgnNagTokens, parseNags } from "./nags";
import {
  START_FEN,
  createEmptyTree,
  fenKey,
  getFenAt,
  getNodeAt,
  newNodeId,
  type GameTree,
  type Path,
  type TreeNode,
} from "./tree";

export type GameHeaders = Record<string, string>;

export type ImportedGame = {
  tree: GameTree;
  path: Path;
  headers: GameHeaders;
  title: string;
  /** Human-readable records of moves that could not be played during import.
   * The first illegal SAN on a line stops that line; the already-parsed
   * prefix is kept. Empty when the import was clean. */
  warnings: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function padDatePart(value: unknown, width: number, fallback: string): string {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }
  return String(value).padStart(width, "0");
}

function tagValueToString(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (!isRecord(value)) {
    return null;
  }
  if (typeof value.value === "string" && value.value.trim()) {
    return value.value;
  }
  if ("year" in value || "month" in value || "day" in value) {
    return `${padDatePart(value.year, 4, "????")}.${padDatePart(value.month, 2, "??")}.${padDatePart(value.day, 2, "??")}`;
  }
  if ("hour" in value || "minute" in value || "second" in value) {
    return `${padDatePart(value.hour, 2, "??")}:${padDatePart(value.minute, 2, "??")}:${padDatePart(value.second, 2, "??")}`;
  }
  if (typeof value.seconds === "number") {
    const increment = typeof value.increment === "number" ? `+${value.increment}` : "";
    if (typeof value.moves === "number") {
      return `${value.moves}/${value.seconds}${increment}`;
    }
    return `${value.seconds}${increment}`;
  }
  return null;
}

function tagsToHeaders(tags: ParseTree["tags"]): GameHeaders {
  const headers: GameHeaders = {};
  if (!tags || !isRecord(tags)) {
    return headers;
  }
  for (const [key, value] of Object.entries(tags)) {
    if (key === "messages") {
      continue;
    }
    const text = tagValueToString(value);
    if (text) {
      headers[key] = text;
    }
  }
  return headers;
}

function uciFromMove(move: Move): string {
  return `${move.from}${move.to}${move.promotion ?? ""}`;
}

function walkLine(chess: Chess, parent: TreeNode[], moves: PgnMove[], warnings: string[]): void {
  if (moves.length === 0) {
    return;
  }
  const [first, ...rest] = moves;
  if (!first) {
    return;
  }
  const beforeFen = chess.fen();
  const token = first.notation.notation;
  let san: string;
  let uci: string;
  let fen: string;
  let from: string;
  let to: string;
  if (isNullMoveToken(token)) {
    try {
      fen = applyNullMoveFen(beforeFen);
    } catch {
      warnings.push(`Skipped null move: invalid position before "${token}"`);
      return;
    }
    san = NULL_MOVE_SAN;
    uci = NULL_MOVE_UCI;
    from = "";
    to = "";
    try {
      chess.load(fen, { skipValidation: true });
    } catch {
      warnings.push(`Skipped null move "${token}": could not load resulting position`);
      return;
    }
  } else {
    let played: Move;
    try {
      played = chess.move(token);
    } catch {
      warnings.push(`Skipped illegal move "${token}"`);
      return;
    }
    san = played.san;
    uci = uciFromMove(played);
    fen = chess.fen();
    from = played.from;
    to = played.to;
  }
  const playedComment = parseMarksFromComment(first.commentAfter);
  const node: TreeNode = {
    id: newNodeId(),
    san,
    uci,
    fen,
    from,
    to,
    comment: playedComment.text,
    commentBefore: first.commentMove,
    nags: parseNags(first.nag),
    marks: mergeMarks(
      playedComment.marks,
      marksFromPgnArrays(first.commentDiag?.colorFields, first.commentDiag?.colorArrows),
    ),
    children: [],
  };
  parent.push(node);
  for (const variation of first.variations) {
    walkLine(new Chess(beforeFen, { skipValidation: true }), parent, variation, warnings);
  }
  walkLine(chess, node.children, rest, warnings);
}

export function titleFromHeaders(headers: GameHeaders): string {
  const white = headers.White ?? "White";
  const black = headers.Black ?? "Black";
  if (white === "White" && black === "Black") {
    return headers.Event && headers.Event !== "?" ? headers.Event : "Board";
  }
  return `${white} vs ${black}`;
}

function mainLineEnd(tree: GameTree): Path {
  const path: Path = [];
  let children = tree.children;
  while (children[0]) {
    path.push(0);
    children = children[0].children;
  }
  return path;
}

function emptyImported(): ImportedGame {
  return {
    tree: createEmptyTree(),
    path: [],
    headers: {},
    title: "Board",
    warnings: [],
  };
}

export function importSans(sans: string[], headers: GameHeaders = {}): ImportedGame {
  const tree = createEmptyTree();
  const chess = new Chess(tree.startFen);
  const warnings: string[] = [];
  let cursor = tree.children;
  for (const san of sans) {
    let played: Move;
    try {
      played = chess.move(san);
    } catch {
      warnings.push(`Skipped illegal move "${san}"`);
      break;
    }
    const node: TreeNode = {
      id: newNodeId(),
      san: played.san,
      uci: uciFromMove(played),
      fen: chess.fen(),
      from: played.from,
      to: played.to,
      children: [],
    };
    cursor.push(node);
    cursor = node.children;
  }
  return {
    tree,
    path: [],
    headers,
    title: titleFromHeaders(headers),
    warnings,
  };
}

function headersFromPgnText(pgn: string): GameHeaders {
  const headers: GameHeaders = {};
  for (const match of pgn.matchAll(/^\s*\[([A-Za-z0-9]+)\s+"([^"]*)"\]/gm)) {
    const key = match[1];
    const value = match[2];
    if (key && value !== undefined) {
      headers[key] = value;
    }
  }
  return headers;
}

function salvageMainline(pgn: string): ImportedGame | null {
  const headers = headersFromPgnText(pgn);
  if (headers.FEN) {
    return null;
  }
  const sans = sanMovesFromPgn(pgn);
  if (sans.length === 0) {
    return null;
  }
  const imported = importSans(sans, headers);
  if (imported.tree.children.length === 0) {
    return null;
  }
  return { ...imported, path: mainLineEnd(imported.tree) };
}

function importOneGame(chunk: string): ImportedGame | null {
  try {
    return importParsedPgn(chunk);
  } catch {
    return salvageMainline(chunk);
  }
}

function absorbTree(dest: GameTree, source: GameTree): void {
  // Tree-level annotations follow the same fill-empty / never-overwrite rule
  // as node fields: a later game only fills what the first game left empty.
  if (!dest.startComment && source.startComment) {
    dest.startComment = source.startComment;
  }
  if (marksAreEmpty(dest.startMarks) && !marksAreEmpty(source.startMarks)) {
    dest.startMarks = structuredClone(source.startMarks);
  }
  const absorb = (siblings: TreeNode[], incoming: TreeNode[]) => {
    for (const node of incoming) {
      let existing = siblings.find((child) => child.uci === node.uci);
      if (!existing) {
        existing = {
          id: newNodeId(),
          san: node.san,
          uci: node.uci,
          fen: node.fen,
          from: node.from,
          to: node.to,
          comment: node.comment,
          commentBefore: node.commentBefore,
          nags: node.nags ? [...node.nags] : undefined,
          marks: node.marks ? structuredClone(node.marks) : undefined,
          children: [],
        };
        siblings.push(existing);
      } else {
        if (!existing.comment && node.comment) {
          existing.comment = node.comment;
        }
        if (!existing.commentBefore && node.commentBefore) {
          existing.commentBefore = node.commentBefore;
        }
        if ((!existing.nags || existing.nags.length === 0) && node.nags?.length) {
          existing.nags = [...node.nags];
        }
        if (marksAreEmpty(existing.marks) && !marksAreEmpty(node.marks)) {
          existing.marks = structuredClone(node.marks);
        }
      }
      absorb(existing.children, node.children);
    }
  };
  absorb(dest.children, source.children);
}

export function openablePgn(pgn: string): ImportedGame | null {
  // Keep every import in chunk order so warnings from games with no playable
  // moves still reach the caller instead of being dropped with the game.
  const ordered: ImportedGame[] = [];
  for (const chunk of pgnGameChunks(pgn)) {
    const imported = importOneGame(chunk);
    if (imported) {
      ordered.push(imported);
    }
  }
  const games = ordered.filter((game) => game.tree.children.length > 0);
  const first = games[0];
  if (!first) {
    // No playable moves anywhere: return the first game's declared position
    // (headers/FEN/start annotations) with every recorded warning, instead of
    // silently falling back to the standard start with no warnings. Truly
    // unparseable input still yields null (no imports at all).
    const head = ordered[0];
    if (!head) {
      return null;
    }
    return {
      tree: head.tree,
      path: [],
      headers: head.headers,
      title: head.title,
      warnings: ordered.flatMap((game) => game.warnings),
    };
  }
  const start = fenKey(first.tree.startFen);
  const tree = structuredClone(first.tree);
  const mergedGames = new Set<ImportedGame>([first]);
  let merged = 1;
  for (const game of games.slice(1)) {
    if (fenKey(game.tree.startFen) !== start) {
      continue;
    }
    absorbTree(tree, game.tree);
    mergedGames.add(game);
    merged += 1;
  }
  const warnings = ordered.flatMap((game) =>
    game.tree.children.length === 0 || mergedGames.has(game) ? game.warnings : [],
  );
  return {
    tree,
    path: merged > 1 ? [] : mainLineEnd(tree),
    headers: first.headers,
    title: first.title,
    warnings,
  };
}

export function importPgn(pgn: string): ImportedGame {
  return openablePgn(pgn) ?? emptyImported();
}

export function mainlinePathForPgn(tree: GameTree, pgn: string): Path {
  const chunk = pgnGameChunks(pgn)[0] ?? pgn.trim();
  if (!chunk) {
    return [];
  }
  const imported = importOneGame(chunk);
  const first = imported?.tree.children[0];
  if (!first) {
    return [];
  }
  const path: Path = [];
  let siblings = tree.children;
  let node: TreeNode | undefined = first;
  while (node) {
    const index = siblings.findIndex((child) => child.uci === node?.uci);
    if (index < 0) {
      break;
    }
    path.push(index);
    siblings = siblings[index]?.children ?? [];
    node = node.children[0];
  }
  return path;
}

export function openListedFileGame(databasePgn: string, gamePgn: string): ImportedGame | null {
  const selected = importPgn(gamePgn);
  const hasGame =
    selected.tree.children.length > 0 || fenKey(selected.tree.startFen) !== fenKey(START_FEN);
  if (!hasGame) {
    return null;
  }
  const merged = openablePgn(databasePgn);
  const sameStart =
    merged !== null && fenKey(merged.tree.startFen) === fenKey(selected.tree.startFen);
  if (!sameStart) {
    return {
      ...selected,
      path: fenKey(selected.tree.startFen) === fenKey(START_FEN) ? selected.path : [],
    };
  }
  if (selected.tree.startComment) {
    merged.tree.startComment = selected.tree.startComment;
  }
  return {
    ...merged,
    path: mainlinePathForPgn(merged.tree, gamePgn),
    headers: selected.headers,
    title: selected.title,
  };
}

function importParsedPgn(trimmed: string): ImportedGame {
  try {
    const parsed = parseGame(trimmed);
    const headers = tagsToHeaders(parsed.tags);
    const startFen =
      typeof headers.FEN === "string" && headers.FEN.length > 0
        ? headers.FEN
        : undefined;
    const tree = createEmptyTree(startFen ?? START_FEN);
    const gameComment = parseMarksFromComment(parsed.gameComment?.comment);
    tree.startComment = gameComment.text;
    tree.startMarks = mergeMarks(
      gameComment.marks,
      marksFromPgnArrays(parsed.gameComment?.colorFields, parsed.gameComment?.colorArrows),
    );
    const warnings: string[] = [];
    walkLine(new Chess(tree.startFen, { skipValidation: true }), tree.children, parsed.moves, warnings);
    return {
      tree,
      path: mainLineEnd(tree),
      headers,
      title: titleFromHeaders(headers),
      warnings,
    };
  } catch {
    const chess = new Chess();
    chess.loadPgn(trimmed);
    const headerFen = chess.header().FEN;
    const tree = createEmptyTree(
      typeof headerFen === "string" ? headerFen : START_FEN,
    );
    const replay = new Chess(tree.startFen);
    let cursor = tree.children;
    for (const move of chess.history({ verbose: true })) {
      replay.move(move);
      const node: TreeNode = {
        id: newNodeId(),
        san: move.san,
        uci: uciFromMove(move),
        fen: replay.fen(),
        from: move.from,
        to: move.to,
        children: [],
      };
      cursor.push(node);
      cursor = node.children;
    }
    const headers: GameHeaders = {};
    for (const [key, value] of Object.entries(chess.header())) {
      if (typeof value === "string") {
        headers[key] = value;
      }
    }
    return {
      tree,
      path: mainLineEnd(tree),
      headers,
      title: titleFromHeaders(headers),
      warnings: [],
    };
  }
}

// PGN comments are delimited by `{`/`}` with no standard escape sequence,
// so a literal `}` inside the text would terminate the comment early and
// corrupt the round-trip. Map it to `)` on export (documented here); the
// re-imported text keeps `)`, making export->import idempotent.
function escapeComment(text: string): string {
  return text.replaceAll("}", ")");
}

function emitFrom(nodes: TreeNode[], startFen: string, plyFromStart: number): string {
  const parts: string[] = [];
  const side = startFen.split(" ")[1] === "b" ? "b" : "w";
  const startFull = Number(startFen.split(" ")[5] ?? "1") || 1;
  let current = nodes;
  let ply = plyFromStart;

  while (current[0]) {
    const node = current[0];
    ply += 1;
    const isWhite =
      (side === "w" && ply % 2 === 1) || (side === "b" && ply % 2 === 0);
    const moveNumber =
      startFull + Math.floor((ply - 1 + (side === "b" ? 1 : 0)) / 2);
    if (node.commentBefore) {
      parts.push(`{${escapeComment(node.commentBefore)}}`);
    }
    // NAGs are emitted as `$N` tokens only; the `!!`/`?` glyphs stay UI-only
    // (see formatMoveSuffix consumers in print-sheet/NotationPanel).
    if (isWhite) {
      parts.push(`${moveNumber}. ${node.san}`);
    } else if (ply === plyFromStart + 1 && !isWhite) {
      parts.push(`${moveNumber}... ${node.san}`);
    } else {
      parts.push(`${node.san}`);
    }
    const nagTokens = formatPgnNagTokens(node.nags);
    if (nagTokens) {
      parts.push(nagTokens);
    }
    const comment = formatCommentWithMarks(node.comment, node.marks);
    if (comment) {
      parts.push(`{${escapeComment(comment)}}`);
    }

    for (const variation of current.slice(1)) {
      const variationText = emitFrom([variation], startFen, ply - 1);
      parts.push(`(${variationText})`);
    }

    current = node.children;
  }

  return parts.join(" ");
}

export function exportPgn(tree: GameTree, headers: GameHeaders): string {
  const merged: GameHeaders = {
    Event: "Casual game",
    Site: "Studio",
    Date: "????.??.??",
    Round: "-",
    White: "White",
    Black: "Black",
    Result: "*",
    ...headers,
  };
  if (tree.startFen !== START_FEN) {
    merged.FEN = tree.startFen;
    merged.SetUp = "1";
  } else {
    delete merged.FEN;
    delete merged.SetUp;
  }
  const tagLines = Object.entries(merged).map(
    ([key, value]) => `[${key} "${value.replaceAll('"', '\\"')}"]`,
  );
  const startComment = formatCommentWithMarks(tree.startComment, tree.startMarks);
  const start = startComment ? `{${escapeComment(startComment)}} ` : "";
  const moves = emitFrom(tree.children, tree.startFen, 0);
  const result = merged.Result ?? "*";
  return `${tagLines.join("\n")}\n\n${start}${moves ? `${moves} ` : ""}${result}\n`;
}

export function recentSans(tree: GameTree, path: Path, limit = 4): string {
  const sans: string[] = [];
  for (let i = 1; i <= path.length; i += 1) {
    const node = getNodeAt(tree, path.slice(0, i));
    if (node) {
      sans.push(node.san);
    }
  }
  return sans.slice(-limit).join(" ");
}

export function currentFen(tree: GameTree, path: Path): string {
  return getFenAt(tree, path);
}
