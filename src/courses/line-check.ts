import { importPgn } from "@/src/chess/pgn";
import { flattenMainLine } from "@/src/chess/tree";
import { tCourseAdmin } from "@/src/i18n/course-admin-strings";
import type { SiteLocale } from "@/src/i18n/locale";

/**
 * SIG-1366: one import problem from a line's PGN, in a UI-translatable shape.
 * `importPgn` records human-readable warnings; they are mapped here so the
 * editor never renders the raw English sentence.
 */
export type LinePgnWarning =
  | { kind: "illegalMove"; move: string }
  | { kind: "skippedMove"; move: string }
  | { kind: "other"; message: string };

export type LinePgnCheck = {
  /** Main-line plies that the import could play. */
  moves: number;
  /** Every recorded import problem, in import order; the first one is shown. */
  warnings: LinePgnWarning[];
};

const ILLEGAL_MOVE = /^Skipped illegal move "(.*)"$/;
const NULL_MOVE_BEFORE = /^Skipped null move: invalid position before "(.*)"$/;
const NULL_MOVE_AFTER = /^Skipped null move "(.*)": could not load resulting position$/;

/** Maps raw `importPgn` warnings to the editor's warning shapes. */
export function linePgnWarnings(warnings: string[]): LinePgnWarning[] {
  return warnings.map((message) => {
    const illegal = ILLEGAL_MOVE.exec(message);
    if (illegal) {
      return { kind: "illegalMove", move: illegal[1] ?? "" };
    }
    const skipped = NULL_MOVE_BEFORE.exec(message) ?? NULL_MOVE_AFTER.exec(message);
    if (skipped) {
      return { kind: "skippedMove", move: skipped[1] ?? "" };
    }
    return { kind: "other", message };
  });
}

/** SIG-1366: move count and import problems for one line; pure and safe to call on every check. */
export function linePgnCheck(pgn: string): LinePgnCheck {
  const imported = importPgn(pgn);
  return {
    moves: flattenMainLine(imported.tree).length,
    warnings: linePgnWarnings(imported.warnings),
  };
}

/** The localized sentence for one warning; the first problem is shown on the line. */
export function linePgnWarningText(locale: SiteLocale, warning: LinePgnWarning): string {
  switch (warning.kind) {
    case "illegalMove":
      return tCourseAdmin(locale, "course.admin.line.warning.illegal", { move: warning.move });
    case "skippedMove":
      return tCourseAdmin(locale, "course.admin.line.warning.skipped", { move: warning.move });
    case "other":
      // A future import problem the editor does not know yet: never show its
      // internal English message as UI text.
      return tCourseAdmin(locale, "course.admin.line.warning.unknown");
  }
}
