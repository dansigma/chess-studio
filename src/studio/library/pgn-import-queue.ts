import { parsePgnCollectionAsync, type ParsedFileGame } from "@/src/chess/pgn-games";
import { MAX_DATABASES, MAX_GAMES_PER_DATABASE } from "@/src/lib/user-files";

export type PgnImportDeps = {
  /** Personal databases the account already holds. */
  databaseCount: () => number;
  /** Creates the database from the parsed games and returns its id. */
  importParsedDatabase: (name: string, games: ParsedFileGame[]) => string;
};

export type ImportOneOptions = {
  signal?: AbortSignal;
  onProgress?: (progress: { done: number; total: number }) => void;
};

export type ImportOneOutcome =
  | { kind: "imported"; id: string; imported: number; overLimit: number; unreadable: number }
  /** The 50-database limit is reached; nothing was read. */
  | { kind: "database-limit" };

const PGN_EXTENSION = /\.pgn$/i;

export function isPgnFile(file: Pick<File, "name">): boolean {
  return PGN_EXTENSION.test(file.name);
}

export function databaseNameFromFile(fileName: string): string {
  return fileName.replace(PGN_EXTENSION, "").trim();
}

export function splitPgnFiles(files: File[]): { pgn: File[]; skipped: string[] } {
  const pgn: File[] = [];
  const skipped: string[] = [];
  for (const file of files) {
    if (isPgnFile(file)) {
      pgn.push(file);
    } else {
      skipped.push(file.name);
    }
  }
  return { pgn, skipped };
}

/**
 * Reads, parses and imports a single file. The database is built from the
 * fully parsed games and only then handed to the store, so a cancel (abort)
 * never leaves a half database. SIG-1324 inserts the name-conflict prompt
 * between the parse and the store write.
 */
export async function importOne(
  file: File,
  deps: PgnImportDeps,
  { signal, onProgress }: ImportOneOptions = {},
): Promise<ImportOneOutcome> {
  if (deps.databaseCount() >= MAX_DATABASES) {
    return { kind: "database-limit" };
  }
  const text = await file.text();
  const parsed = await parsePgnCollectionAsync(text, {
    limit: MAX_GAMES_PER_DATABASE,
    signal,
    onProgress,
  });
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  // Re-check: another file of the batch may have taken the last slot while this one parsed.
  if (deps.databaseCount() >= MAX_DATABASES) {
    return { kind: "database-limit" };
  }
  const id = deps.importParsedDatabase(databaseNameFromFile(file.name), parsed.games);
  return {
    kind: "imported",
    id,
    imported: parsed.games.length,
    overLimit: parsed.overLimit,
    unreadable: parsed.unreadable,
  };
}
