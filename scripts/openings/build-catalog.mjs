// Regenerate with the five TSVs from https://github.com/lichess-org/chess-openings (CC0).
// Usage: node scripts/openings/build-catalog.mjs <tsv-directory> [output-json]
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Chess, DEFAULT_POSITION } from "chess.js";

const [directory, output = new URL("../../src/data/openings-catalog.json", import.meta.url)] =
  process.argv.slice(2);

if (!directory) {
  throw new Error("Usage: node scripts/openings/build-catalog.mjs <tsv-directory> [output-json]");
}

const entries = [];
const chess = new Chess();
for (const letter of "abcde") {
  const file = join(directory, `${letter}.tsv`);
  const [header, ...rows] = readFileSync(file, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/);
  const columns = header.split("\t");
  const [ecoColumn, nameColumn, pgnColumn] = ["eco", "name", "pgn"].map((key) => columns.indexOf(key));
  if ([ecoColumn, nameColumn, pgnColumn].includes(-1)) {
    throw new Error(`${file}: expected eco, name and pgn columns`);
  }

  for (const [index, row] of rows.entries()) {
    if (!row.trim()) continue;
    const fields = row.split("\t");
    const eco = fields[ecoColumn]?.trim();
    const name = fields[nameColumn]?.trim();
    const pgn = fields[pgnColumn]?.trim();
    try {
      if (!eco || !/^[A-E]\d{2}$/.test(eco) || !name || !pgn) {
        throw new Error("missing name or PGN, or invalid ECO");
      }
      chess.loadPgn(pgn, { strict: true });
      const moves = chess.history({ verbose: true });
      if (!moves.length || moves[0].before !== DEFAULT_POSITION) {
        throw new Error("expected moves from the standard starting position");
      }
      entries.push({ eco, name, uci: moves.map((move) => move.lan) });
    } catch (error) {
      console.warn(`${file}:${index + 2}: dropped row (${error.message})`);
    }
  }
}

if (!entries.length) throw new Error("No valid openings found");
writeFileSync(output, `[\n${entries.map((entry) => JSON.stringify(entry)).join(",\n")}\n]\n`);
console.log(`Wrote ${entries.length} opening lines`);
