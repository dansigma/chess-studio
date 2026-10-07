/**
 * Build data/opening-index.sqlite from Caissabase and optional PGN files.
 *
 *   node scripts/build-opening-index.mjs
 *   node scripts/build-opening-index.mjs --pgn "D:\bases\2026.pgn"
 *   node scripts/build-opening-index.mjs --limit 1000
 *
 * Re-running skips games already recorded in the seen table, so a newer
 * Caissabase or a 2026 PGN can be merged without counting the same game twice.
 */
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { DatabaseSync } from "node:sqlite";
import { Chess } from "chess.js";
import { decodeMoveBlob } from "../src/chess/move-index.ts";

const MAX_PLY = 24;
const INDEX_PATH = "data/opening-index.sqlite";
const CAISSA_PATH = "data/caissabase_2024.db3";

function positionKey(fen) {
  const core = fen.trim().split(/\s+/).slice(0, 4).join(" ");
  let hash = BigInt("0xcbf29ce484222325");
  const prime = BigInt("0x100000001b3");
  for (let i = 0; i < core.length; i += 1) {
    hash ^= BigInt(core.charCodeAt(i));
    hash = BigInt.asUintN(64, hash * prime);
  }
  return BigInt.asIntN(64, hash).toString();
}

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function fingerprint(white, black, date, result, ucis) {
  return [white, black, date, result, ucis.slice(0, 12).join(" ")].join("|").toLowerCase();
}

function openIndex() {
  const db = new DatabaseSync(INDEX_PATH);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    CREATE TABLE IF NOT EXISTS moves (
      pos TEXT NOT NULL,
      uci TEXT NOT NULL,
      san TEXT NOT NULL,
      white INTEGER NOT NULL DEFAULT 0,
      draws INTEGER NOT NULL DEFAULT 0,
      black INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (pos, uci)
    );
    CREATE TABLE IF NOT EXISTS seen (
      id TEXT PRIMARY KEY
    );
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  return db;
}

function addGame(db, insertSeen, bump, id, moves, result, startFen) {
  const inserted = insertSeen.run(id);
  if (inserted.changes === 0) {
    return false;
  }
  const column = result === "1-0" ? "white" : result === "0-1" ? "black" : "draws";
  const start = startFen ? new Chess(startFen) : new Chess();
  for (let ply = 0; ply < moves.length && ply < MAX_PLY; ply += 1) {
    const move = moves[ply];
    bump.run(
      positionKey(start.fen()),
      move.uci,
      move.san,
      column === "white" ? 1 : 0,
      column === "draws" ? 1 : 0,
      column === "black" ? 1 : 0,
    );
    start.move(move.uci);
  }
  return true;
}

function importCaissa(db, limit) {
  const source = new DatabaseSync(CAISSA_PATH, { readOnly: true });
  const insertSeen = db.prepare("INSERT OR IGNORE INTO seen (id) VALUES (?)");
  const bump = db.prepare(`
    INSERT INTO moves (pos, uci, san, white, draws, black)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(pos, uci) DO UPDATE SET
      white = white + excluded.white,
      draws = draws + excluded.draws,
      black = black + excluded.black
  `);
  const sql = limit
    ? `SELECT rowid, WhiteID, BlackID, Date, Result, FEN, Moves FROM Games LIMIT ${Number(limit)}`
    : `SELECT rowid, WhiteID, BlackID, Date, Result, FEN, Moves FROM Games`;
  const names = source.prepare("SELECT ID, Name FROM Players");
  const playerName = new Map();
  for (const row of names.all()) {
    playerName.set(row.ID, row.Name);
  }
  const rows = source.prepare(sql);
  let added = 0;
  let skipped = 0;
  let failed = 0;
  const started = Date.now();
  db.exec("BEGIN");
  for (const row of rows.iterate()) {
    try {
      const fen = row.FEN && row.FEN.length > 0 ? String(row.FEN) : null;
      const moves = decodeMoveBlob(row.Moves, fen, MAX_PLY);
      if (moves.length === 0) {
        failed += 1;
        continue;
      }
      const white = playerName.get(row.WhiteID) ?? "";
      const black = playerName.get(row.BlackID) ?? "";
      const result = String(row.Result ?? "*").split("|")[0];
      const id = fingerprint(white, black, row.Date ?? "", result, moves.map((move) => move.uci));
      if (addGame(db, insertSeen, bump, id, moves, result, fen)) {
        added += 1;
      } else {
        skipped += 1;
      }
    } catch {
      failed += 1;
    }
    if ((added + skipped + failed) % 2000 === 0) {
      db.exec("COMMIT");
      db.exec("BEGIN");
      const seconds = (Date.now() - started) / 1000;
      console.log(`caissa ${added} added, ${skipped} skipped, ${failed} failed, ${Math.round((added + skipped) / seconds)} games/s`);
    }
  }
  db.exec("COMMIT");
  source.close();
  console.log(`caissa done: ${added} added, ${skipped} skipped, ${failed} failed`);
}

async function importPgn(db, path) {
  const insertSeen = db.prepare("INSERT OR IGNORE INTO seen (id) VALUES (?)");
  const bump = db.prepare(`
    INSERT INTO moves (pos, uci, san, white, draws, black)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(pos, uci) DO UPDATE SET
      white = white + excluded.white,
      draws = draws + excluded.draws,
      black = black + excluded.black
  `);
  const lines = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  let buffer = [];
  let added = 0;
  let skipped = 0;
  let failed = 0;
  db.exec("BEGIN");
  const flush = () => {
    const text = buffer.join("\n").trim();
    buffer = [];
    if (!text) {
      return;
    }
    const chess = new Chess();
    try {
      chess.loadPgn(text);
    } catch {
      failed += 1;
      return;
    }
    const history = chess.history({ verbose: true });
    if (history.length === 0) {
      failed += 1;
      return;
    }
    const headers = chess.header();
    const moves = history.map((move) => ({
      san: move.san,
      uci: `${move.from}${move.to}${move.promotion ?? ""}`,
    }));
    const id = fingerprint(
      headers.White ?? "",
      headers.Black ?? "",
      headers.Date ?? "",
      headers.Result ?? "*",
      moves.map((move) => move.uci),
    );
    if (addGame(db, insertSeen, bump, id, moves, headers.Result ?? "*")) {
      added += 1;
    } else {
      skipped += 1;
    }
    if ((added + skipped) % 2000 === 0) {
      db.exec("COMMIT");
      db.exec("BEGIN");
      console.log(`pgn ${added} added, ${skipped} skipped`);
    }
  };
  for await (const line of lines) {
    if (line.startsWith("[") && buffer.length > 0 && !buffer.at(-1).startsWith("[")) {
      flush();
    }
    buffer.push(line);
  }
  flush();
  db.exec("COMMIT");
  console.log(`pgn done: ${added} added, ${skipped} skipped, ${failed} failed`);
}

const db = openIndex();
const pgn = argValue("--pgn");
const limit = argValue("--limit");
const skipCaissa = process.argv.includes("--skip-caissa");
if (!skipCaissa) {
  importCaissa(db, limit);
}
if (pgn) {
  await importPgn(db, pgn);
}
if (!limit) {
  db.prepare("INSERT INTO meta (key, value) VALUES ('complete', '1') ON CONFLICT(key) DO UPDATE SET value = '1'").run();
}
const totals = db.prepare("SELECT COUNT(*) AS positions FROM moves").get();
console.log(`index positions ${totals.positions}`);
db.close();
