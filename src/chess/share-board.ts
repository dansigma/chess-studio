import { Chess } from "chess.js";
import { isLegalSetupFen } from "./setup-fen";

export function shareBoardUrl(origin: string, fen: string): string {
  const url = new URL("/studio", origin);
  url.searchParams.set("fen", fen.trim());
  return url.toString();
}

export function fenFromShareSearch(search: string): string | null {
  const raw = new URLSearchParams(search).get("fen");
  if (!raw || !isLegalSetupFen(raw.trim())) {
    return null;
  }
  return new Chess(raw.trim()).fen();
}

export const COURSE_STUDY_IMPORT_KEY = "chess-studio:course-import";

export type CourseStudyImport = {
  title: string;
  pgn: string;
  atFen?: string;
};

function getSessionStorage(): Storage | null {
  if (typeof window === "undefined" || !window.sessionStorage) {
    return null;
  }
  return window.sessionStorage;
}

export function writeCourseStudyImport(payload: CourseStudyImport): boolean {
  try {
    const storage = getSessionStorage();
    if (!storage) {
      return false;
    }
    storage.setItem(COURSE_STUDY_IMPORT_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function readCourseStudyImport(): CourseStudyImport | null {
  try {
    const storage = getSessionStorage();
    if (!storage) {
      return null;
    }
    const raw = storage.getItem(COURSE_STUDY_IMPORT_KEY);
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }
    const { title, pgn, atFen } = parsed as Record<string, unknown>;
    if (typeof title !== "string" || typeof pgn !== "string") {
      return null;
    }
    if (title.trim().length === 0 || pgn.trim().length === 0) {
      return null;
    }
    if (atFen !== undefined && typeof atFen !== "string") {
      return null;
    }
    return atFen === undefined ? { title, pgn } : { title, pgn, atFen };
  } catch {
    return null;
  }
}

export function clearCourseStudyImport(): void {
  try {
    getSessionStorage()?.removeItem(COURSE_STUDY_IMPORT_KEY);
  } catch {
    // Ignore storage errors on consume-once cleanup.
  }
}
