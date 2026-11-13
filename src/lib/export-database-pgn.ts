import type { FileDatabase } from "./user-files";

/** Every game of the database, one blank line between games. */
export function databaseToPgn(database: FileDatabase): string {
  return `${database.games.map((game) => game.pgn.trim()).filter(Boolean).join("\n\n")}\n`;
}

/** `<name>.pgn` with filesystem-hostile characters removed. */
export function databaseExportFilename(database: FileDatabase): string {
  const base = database.name.replace(/[/\\:*?"<>|]/g, "").trim();
  return `${base || "database"}.pgn`;
}
