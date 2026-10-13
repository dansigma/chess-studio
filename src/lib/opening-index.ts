import { existsSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { positionKey } from "@/src/chess/zobrist";
import type { ExplorerMoveRow, ExplorerResponse, ExplorerSource } from "@/src/lib/explorer-types";

type IndexRow = {
  uci: string;
  san: string;
  white: number;
  draws: number;
  black: number;
};

let database: DatabaseSync | null | undefined;
let selectMoves: { all: (pos: string) => IndexRow[] } | null = null;

export function hasOpeningIndex(): boolean {
  return openIndex() !== null;
}

export function setIndexDatabaseForTesting(db: DatabaseSync | null): void {
  database = db;
  if (db) {
    selectMoves = db.prepare(
      "SELECT uci, san, white, draws, black FROM moves WHERE pos = ? ORDER BY (white + draws + black) DESC",
    ) as unknown as { all: (pos: string) => IndexRow[] };
  } else {
    selectMoves = null;
  }
}

function openIndex(): DatabaseSync | null {
  if (database !== undefined) {
    return database;
  }
  const file = path.join(process.cwd(), "data", "opening-index.sqlite");
  if (!existsSync(file)) {
    database = null;
    return null;
  }
  database = new DatabaseSync(file, { readOnly: true });
  const meta = database.prepare("SELECT value FROM meta WHERE key = 'complete'").get() as
    | { value: string }
    | undefined;
  if (meta?.value !== "1") {
    database.close();
    database = null;
    return null;
  }
  selectMoves = database.prepare(
    "SELECT uci, san, white, draws, black FROM moves WHERE pos = ? ORDER BY (white + draws + black) DESC",
  ) as unknown as { all: (pos: string) => IndexRow[] };
  return database;
}

/** Local opening index built from Caissabase and extra PGN files. */
export function lookupOpeningIndex(fen: string, source: ExplorerSource = "masters"): ExplorerResponse | null {
  if (!openIndex() || !selectMoves) {
    return null;
  }
  const rows = selectMoves.all(positionKey(fen).toString());
  if (rows.length === 0) {
    return null;
  }
  const moves: ExplorerMoveRow[] = rows.map((row) => ({
    san: row.san,
    uci: row.uci,
    white: row.white,
    draws: row.draws,
    black: row.black,
    games: row.white + row.draws + row.black,
    averageRating: null,
  }));
  return {
    source,
    fen,
    white: moves.reduce((sum, move) => sum + move.white, 0),
    draws: moves.reduce((sum, move) => sum + move.draws, 0),
    black: moves.reduce((sum, move) => sum + move.black, 0),
    opening: null,
    moves,
    games: [],
  };
}
