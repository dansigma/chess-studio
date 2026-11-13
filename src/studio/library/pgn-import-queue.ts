export type PgnImportDeps = {
  /** Creates the database and returns its id. */
  importDatabase: (name: string, pgn: string) => string;
};

export type PgnImportResult = {
  importedIds: string[];
  /** Names of the files that were not `.pgn`. */
  skipped: string[];
};

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

/** Reads and imports a single file. Later issues hook progress / conflicts in here. */
export async function importOne(file: File, deps: PgnImportDeps): Promise<string> {
  const text = await file.text();
  return deps.importDatabase(databaseNameFromFile(file.name), text);
}

/** Imports the `.pgn` files one after another, in the given order. */
export async function importPgnFiles(files: File[], deps: PgnImportDeps): Promise<PgnImportResult> {
  const { pgn, skipped } = splitPgnFiles(files);
  const importedIds: string[] = [];
  for (const file of pgn) {
    importedIds.push(await importOne(file, deps));
  }
  return { importedIds, skipped };
}
