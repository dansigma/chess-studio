import { parsePgnCollectionAsync, type ParsedFileGame } from "@/src/chess/pgn-games";
import { MAX_DATABASES, MAX_GAMES_PER_DATABASE, type FileDatabase } from "@/src/lib/user-files";
import { findNameConflict, mergeGames, nextFreeName } from "./import-conflicts";

export type ConflictChoice = "replace" | "keep-both" | "merge" | "cancel";

export type PgnImportDeps = {
  /** Personal databases the account already holds. */
  databaseCount: () => number;
  /** Creates the database from the parsed games and returns its id. */
  importParsedDatabase: (name: string, games: ParsedFileGame[]) => string;
  /** The personal databases the account holds now (name-conflict check). */
  databases: () => FileDatabase[];
  /** Replaces the games of an existing database, keeping its id. False if it is gone. */
  replaceDatabaseGames: (id: string, games: ParsedFileGame[]) => boolean;
  /**
   * Asks what to do with a file whose name matches `existing`. Settles with
   * "cancel" when `signal` aborts. `keepBothAllowed` is false at the 50-database limit.
   */
  resolveConflict: (
    existing: FileDatabase,
    fileName: string,
    options: { keepBothAllowed: boolean; signal?: AbortSignal },
  ) => Promise<ConflictChoice>;
};

export type ImportOneOptions = {
  signal?: AbortSignal;
  /** Called when the file stops to wait for the name-conflict answer. */
  onAwaitingConflict?: () => void;
  onProgress?: (progress: { done: number; total: number }) => void;
};

export type ImportOneOutcome =
  | { kind: "imported"; id: string; imported: number; overLimit: number; unreadable: number }
  /** The 50-database limit is reached; nothing was read. */
  | { kind: "database-limit" }
  /** Name match, existing database's games replaced (same id). */
  | { kind: "replaced"; id: string; imported: number; overLimit: number; unreadable: number }
  /** Name match, only the new games added to the existing database. */
  | { kind: "merged"; id: string; added: number; duplicates: number; overLimit: number; unreadable: number }
  /** The user cancelled the name-conflict dialog; nothing was saved. */
  | { kind: "skipped" }
  /** A name match with no readable game: nothing to replace or merge with. */
  | { kind: "unreadable" };

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
 * never leaves a half database. A file named like an existing database stops
 * after the parse and asks (replace / keep both / merge / cancel) before
 * anything is saved. Replace and Merge create no database, so the 50-database
 * limit only blocks a new one.
 */
export async function importOne(
  file: File,
  deps: PgnImportDeps,
  { signal, onProgress, onAwaitingConflict }: ImportOneOptions = {},
): Promise<ImportOneOutcome> {
  const name = databaseNameFromFile(file.name);
  const atLimit = () => deps.databaseCount() >= MAX_DATABASES;
  if (atLimit() && !findNameConflict(name, deps.databases())) {
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
  const counts = { overLimit: parsed.overLimit, unreadable: parsed.unreadable };
  let importName = name;
  // Looked up after the parse: another file of the batch may have just created it.
  const existing = findNameConflict(name, deps.databases());
  if (existing) {
    if (parsed.games.length === 0) {
      return { kind: "unreadable" };
    }
    onAwaitingConflict?.();
    const choice = await deps.resolveConflict(existing, file.name, { keepBothAllowed: !atLimit(), signal });
    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    if (choice === "cancel") {
      return { kind: "skipped" };
    }
    // The database may have been deleted while the dialog was open: then it is a plain import.
    const current = deps.databases().find((item) => item.id === existing.id);
    if (current && choice === "replace") {
      if (deps.replaceDatabaseGames(current.id, parsed.games)) {
        return { kind: "replaced", id: current.id, imported: parsed.games.length, ...counts };
      }
    } else if (current && choice === "merge") {
      const merged = mergeGames(current.games, parsed.games, MAX_GAMES_PER_DATABASE);
      if (deps.replaceDatabaseGames(current.id, merged.games)) {
        return {
          kind: "merged",
          id: current.id,
          added: merged.added,
          duplicates: merged.duplicates,
          overLimit: merged.overLimit + parsed.overLimit,
          unreadable: parsed.unreadable,
        };
      }
    } else if (current) {
      importName = nextFreeName(
        name,
        deps.databases().map((item) => item.name),
      );
    }
  }
  // Re-check: another file of the batch may have taken the last slot while this one parsed.
  if (atLimit()) {
    return { kind: "database-limit" };
  }
  const id = deps.importParsedDatabase(importName, parsed.games);
  return {
    kind: "imported",
    id,
    imported: parsed.games.length,
    overLimit: parsed.overLimit,
    unreadable: parsed.unreadable,
  };
}
