import type { ParsedFileGame } from "@/src/chess/pgn-games";

type NamedDatabase = { id: string; name: string };

/** Name used to compare a file name with a database name: trimmed, case-insensitive. */
export function normalizeDatabaseName(name: string): string {
  return name.trim().toLowerCase();
}

/** The existing database whose name matches `name`, if any. */
export function findNameConflict<T extends NamedDatabase>(name: string, databases: readonly T[]): T | null {
  const key = normalizeDatabaseName(name);
  return databases.find((database) => normalizeDatabaseName(database.name) === key) ?? null;
}

/** `name (2)`, `name (3)`, ... — the first number whose name is free (case-insensitive). */
export function nextFreeName(name: string, existingNames: readonly string[]): string {
  const taken = new Set(existingNames.map(normalizeDatabaseName));
  for (let n = 2; ; n += 1) {
    const candidate = `${name.trim()} (${n})`;
    if (!taken.has(normalizeDatabaseName(candidate))) {
      return candidate;
    }
  }
}

function stripVariations(text: string): string {
  let depth = 0;
  let out = "";
  for (const char of text) {
    if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth = Math.max(0, depth - 1);
    } else if (depth === 0) {
      out += char;
    }
  }
  return out;
}

/**
 * Duplicate key of a game for Merge. Built from the White / Black / Date /
 * Result fields (trimmed, case-insensitive) and the mainline movetext with
 * header lines, `{}` and `;` comments, variations, NAGs, annotation glyphs,
 * move numbers and the result token removed and whitespace collapsed. Header
 * order, line breaks and comments therefore never make two copies differ.
 */
export function gameDuplicateKey(game: Pick<ParsedFileGame, "white" | "black" | "date" | "result" | "pgn">): string {
  const movetext = stripVariations(
    game.pgn
      .replace(/^\s*\[.*\]\s*$/gm, " ")
      .replace(/\{[^}]*\}/g, " ")
      .replace(/;[^\n]*/g, " "),
  )
    .replace(/\$\d+/g, " ")
    .replace(/\d+\s*\.(\.\.)?/g, " ")
    .replace(/[!?]+/g, "")
    .replace(/(1-0|0-1|1\/2-1\/2|\*)\s*$/, " ")
    .replace(/\s+/g, " ")
    .trim();
  const field = (value: string) => value.trim().toLowerCase();
  return [game.white, game.black, game.date, game.result].map(field).join("|") + "|" + movetext;
}

export type MergeResult = {
  games: ParsedFileGame[];
  /** Incoming games added to the database. */
  added: number;
  /** Incoming games already in the database (or repeated inside the file). */
  duplicates: number;
  /** New games left out because the database reached `limit`. */
  overLimit: number;
};

/** Existing games first, then the incoming games that are not in them, up to `limit`. */
export function mergeGames(
  existing: readonly ParsedFileGame[],
  incoming: readonly ParsedFileGame[],
  limit: number,
): MergeResult {
  const seen = new Set(existing.map(gameDuplicateKey));
  const games = [...existing];
  let added = 0;
  let duplicates = 0;
  let overLimit = 0;
  for (const game of incoming) {
    const key = gameDuplicateKey(game);
    if (seen.has(key)) {
      duplicates += 1;
    } else if (games.length >= limit) {
      overLimit += 1;
    } else {
      seen.add(key);
      games.push(game);
      added += 1;
    }
  }
  return { games, added, duplicates, overLimit };
}
