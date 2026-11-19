function clean(name: string): string {
  // Removing a separator can leave two spaces ("Carlsen / Nepo" → "Carlsen  Nepo").
  return name.replace(/[/\\:*?"<>|]/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Formats a file name as `<name>.pgn` with filesystem-hostile characters
 * (`/ \ : * ? " < > |`) stripped and repeated whitespace collapsed, appending
 * `.pgn` once (case-insensitive) and falling back to `fallback` when the
 * cleaned name is empty.
 */
export function pgnFilename(name: string, fallback = "board"): string {
  const base = clean(name) || clean(fallback) || "board";
  return /\.pgn$/i.test(base) ? base : `${base}.pgn`;
}
