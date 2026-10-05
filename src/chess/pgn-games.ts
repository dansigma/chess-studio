import { importPgn, titleFromHeaders } from "./pgn";
import { pgnGameChunks } from "./pgn-clean";

export function splitPgnGames(text: string): string[] {
  return pgnGameChunks(text);
}

export type ParsedFileGame = {
  id: string;
  white: string;
  black: string;
  result: string;
  event: string;
  date: string;
  pgn: string;
  title: string;
};

export function parsePgnCollection(text: string, limit = 500): {
  games: ParsedFileGame[];
  skipped: number;
} {
  const chunks = splitPgnGames(text);
  const games: ParsedFileGame[] = [];
  let skipped = 0;
  for (const chunk of chunks) {
    if (games.length >= limit) {
      skipped += 1;
      continue;
    }
    const imported = importPgn(chunk);
    if (imported.tree.children.length === 0 && Object.keys(imported.headers).length === 0) {
      skipped += 1;
      continue;
    }
    games.push({
      id: crypto.randomUUID(),
      white: imported.headers.White ?? "White",
      black: imported.headers.Black ?? "Black",
      result: imported.headers.Result ?? "*",
      event: imported.headers.Event ?? "",
      date: imported.headers.Date ?? "",
      pgn: chunk,
      title: titleFromHeaders(imported.headers),
    });
  }
  return { games, skipped };
}
