import { importPgn } from "@/src/chess/pgn";
import { parsePgnCollection } from "@/src/chess/pgn-games";
import type { CourseVariation } from "./types";

const GENERIC = new Set(["", "?", "white", "black", "unknown"]);

function meaningful(value: string | undefined): string | null {
  const text = value?.trim() ?? "";
  if (GENERIC.has(text.toLowerCase())) {
    return null;
  }
  return text;
}

export function variationTitleFromHeaders(headers: Record<string, string>, index: number): string {
  const named =
    meaningful(headers.Chapter) ??
    meaningful(headers.Variation) ??
    meaningful(headers.Line) ??
    meaningful(headers.Opening);
  if (named) {
    return named.slice(0, 120);
  }
  const white = meaningful(headers.White);
  const black = meaningful(headers.Black);
  if (white && black) {
    return `${white} vs ${black}`.slice(0, 120);
  }
  if (black) {
    return black.slice(0, 120);
  }
  if (white) {
    return white.slice(0, 120);
  }
  const event = meaningful(headers.Event);
  if (event) {
    return event.slice(0, 120);
  }
  return `Line ${index + 1}`;
}

export function variationsFromChapterPgn(text: string): CourseVariation[] {
  const { games } = parsePgnCollection(text, 40);
  const lines: CourseVariation[] = [];
  for (const game of games) {
    const imported = importPgn(game.pgn);
    if (imported.tree.children.length === 0) {
      continue;
    }
    lines.push({
      id: game.id,
      title: variationTitleFromHeaders(imported.headers, lines.length),
      pgn: game.pgn.trim(),
    });
  }
  return lines;
}

function sharedHeader(values: string[], gameCount: number): string {
  const first = values[0];
  if (!first || values.length !== gameCount || !values.every((value) => value === first)) {
    return "";
  }
  return first.slice(0, 120);
}

export function chapterTitleFromPgn(text: string): string {
  const { games } = parsePgnCollection(text, 40);
  const chapters: string[] = [];
  const events: string[] = [];
  for (const game of games) {
    const headers = importPgn(game.pgn).headers;
    const chapter = meaningful(headers.Chapter);
    const event = meaningful(headers.Event);
    if (chapter) {
      chapters.push(chapter);
    }
    if (event) {
      events.push(event);
    }
  }
  return sharedHeader(chapters, games.length) || sharedHeader(events, games.length);
}
