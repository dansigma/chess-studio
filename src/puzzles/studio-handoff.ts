// SIG-1236: hands a puzzle to the Studio. Pure builders (PGN, title, Lichess
// link) plus one small function that writes the sessionStorage handoff the
// Studio shell already consumes for course lines (`writeCourseStudyImport` →
// `/studio` → `openListedGame({ openInNewBoard: true })`), so the puzzle always
// lands on a NEW board and never replaces an existing one.
import { Chess } from "chess.js";
import { shareBoardUrl, writeCourseStudyImport } from "@/src/chess/share-board";
import type { SiteLocale } from "@/src/i18n/locale";
import { tPuzzle } from "@/src/i18n/puzzle-strings";
import type { PuzzleMode } from "./types";

/** The slice of a compiled puzzle the handoff needs. */
export type StudioPuzzle = { id: string; fen: string; sans: string[] };

export type PuzzleStudioImport = { title: string; pgn: string; atFen: string };

// Lichess puzzle ids are 5 alphanumeric characters (e.g. "00sHx"). The local
// starter catalog ("queen-corridor"…) and mistake exercises ("mx-h-…") use
// longer, hyphenated ids, so they never match and get no link.
const LICHESS_PUZZLE_ID = /^[A-Za-z0-9]{5}$/;

/**
 * Link to the puzzle on Lichess, or null when the id is not a Lichess puzzle id.
 * `public.puzzles` stores the Lichess PuzzleId as `id` but not the GameUrl; the
 * training page for that id links to the source game, so no extra column is
 * needed.
 */
export function lichessPuzzleUrl(id: string): string | null {
  return LICHESS_PUZZLE_ID.test(id) ? `https://lichess.org/training/${id}` : null;
}

/**
 * PGN for the position the solver had to solve: `[SetUp "1"]`/`[FEN]` headers
 * from the stored FEN (already the solver-to-move position — the Lichess
 * import applies the opponent's setup move, which is not stored) followed by
 * the full solution line. Null when the line is not legal from the FEN.
 */
export function buildPuzzlePgn(puzzle: StudioPuzzle, title: string): string | null {
  try {
    const chess = new Chess(puzzle.fen);
    const startFen = chess.fen();
    const text: string[] = [];
    for (const [index, san] of puzzle.sans.entries()) {
      const [, turn, , , , fullmove] = chess.fen().split(" ");
      const move = chess.move(san);
      if (turn === "w") {
        text.push(`${fullmove}. ${move.san}`);
      } else {
        text.push(index === 0 ? `${fullmove}... ${move.san}` : move.san);
      }
    }
    const headers = [
      ["Event", title],
      ["Site", "?"],
      ["Result", "*"],
      ["SetUp", "1"],
      ["FEN", startFen],
    ];
    return `${headers.map(([key, value]) => `[${key} "${value.replace(/(["\\])/g, "\\$1")}"]`).join("\n")}\n\n${text.join(" ")} *`;
  } catch {
    return null;
  }
}

/**
 * Studio import payload for a puzzle. Mistake exercises keep only the position
 * and the engine's solution line (no source game id, PGN or ply — see
 * `MistakeExercise`), so they open as the same position-plus-line board.
 */
export function buildPuzzleStudioImport(
  puzzle: StudioPuzzle,
  mode: PuzzleMode,
  locale: SiteLocale,
): PuzzleStudioImport | null {
  const title =
    mode === "mistakes"
      ? tPuzzle(locale, "puzzle.studio.mistakeTitle")
      : tPuzzle(locale, "puzzle.studio.boardTitle", { id: puzzle.id });
  const pgn = buildPuzzlePgn(puzzle, title);
  return pgn ? { title, pgn, atFen: new Chess(puzzle.fen).fen() } : null;
}

/**
 * Write the handoff and navigate. Falls back to the shared-position URL (the
 * bare FEN, no line) when storage is unavailable.
 */
export function openPuzzleInStudio(
  puzzle: StudioPuzzle,
  mode: PuzzleMode,
  locale: SiteLocale,
  push: (href: string) => void,
  origin: string,
): void {
  const payload = buildPuzzleStudioImport(puzzle, mode, locale);
  if (payload && writeCourseStudyImport(payload)) {
    push("/studio");
    return;
  }
  push(shareBoardUrl(origin, puzzle.fen));
}
