import type { PuzzleStringKey } from "@/src/i18n/puzzle-strings";

export const PUZZLE_THEMES = [
  "mate",
  "mateIn1",
  "mateIn2",
  "fork",
  "pin",
  "skewer",
  "discoveredAttack",
  "backRank",
  "sacrifice",
  "attraction",
  "endgame",
  "promotion",
  "middlegame",
] as const;

export type PuzzleTheme = (typeof PUZZLE_THEMES)[number];

export const PUZZLE_MODES = ["rated", "streak", "rush", "daily"] as const;

export type PuzzleMode = (typeof PUZZLE_MODES)[number];

// SIG-1070: theme display strings live in the puzzle string table
// (puzzle.theme.label.<id> / puzzle.theme.blurb.<id>). Ids stay stable —
// they are stored in progress data — so cards and labels carry string keys.
export const THEME_CARDS: { id: PuzzleTheme; labelKey: PuzzleStringKey; blurbKey: PuzzleStringKey }[] = [
  { id: "mate", labelKey: "puzzle.theme.label.mate", blurbKey: "puzzle.theme.blurb.mate" },
  { id: "fork", labelKey: "puzzle.theme.label.fork", blurbKey: "puzzle.theme.blurb.fork" },
  { id: "pin", labelKey: "puzzle.theme.label.pin", blurbKey: "puzzle.theme.blurb.pin" },
  { id: "skewer", labelKey: "puzzle.theme.label.skewer", blurbKey: "puzzle.theme.blurb.skewer" },
  { id: "discoveredAttack", labelKey: "puzzle.theme.label.discoveredAttack", blurbKey: "puzzle.theme.blurb.discoveredAttack" },
  { id: "backRank", labelKey: "puzzle.theme.label.backRank", blurbKey: "puzzle.theme.blurb.backRank" },
  { id: "sacrifice", labelKey: "puzzle.theme.label.sacrifice", blurbKey: "puzzle.theme.blurb.sacrifice" },
  { id: "endgame", labelKey: "puzzle.theme.label.endgame", blurbKey: "puzzle.theme.blurb.endgame" },
  { id: "promotion", labelKey: "puzzle.theme.label.promotion", blurbKey: "puzzle.theme.blurb.promotion" },
];

export const THEME_LABEL_KEYS: Record<PuzzleTheme, PuzzleStringKey> = {
  mate: "puzzle.theme.label.mate",
  mateIn1: "puzzle.theme.label.mateIn1",
  mateIn2: "puzzle.theme.label.mateIn2",
  fork: "puzzle.theme.label.fork",
  pin: "puzzle.theme.label.pin",
  skewer: "puzzle.theme.label.skewer",
  discoveredAttack: "puzzle.theme.label.discoveredAttack",
  backRank: "puzzle.theme.label.backRank",
  sacrifice: "puzzle.theme.label.sacrifice",
  attraction: "puzzle.theme.label.attraction",
  endgame: "puzzle.theme.label.endgame",
  promotion: "puzzle.theme.label.promotion",
  middlegame: "puzzle.theme.label.middlegame",
};

export type Puzzle = {
  id: string;
  fen: string;
  moves: string[];
  rating: number;
  themes: PuzzleTheme[];
};

export type PuzzleModeAttempt = {
  id: string;
  mode: PuzzleMode;
  success: boolean;
  puzzleRating: number;
  sessionScore: number;
  now: number;
  themes: PuzzleTheme[];
  ms: number | null;
};

// SIG-1103: per-motif solve stats. `recent` holds the last 10 results as
// "1"/"0" (newest last). Ids stay stable — they are stored in progress data.
export type MotifStat = {
  attempts: number;
  solved: number;
  timedAttempts: number;
  totalMs: number;
  recent: string;
};

export type PuzzleHistoryEntry = {
  id: string;
  mode: PuzzleMode;
  success: boolean;
  at: number;
  delta: number;
};

export type PuzzleProgress = {
  rating: number;
  solved: number;
  failed: number;
  streak: number;
  bestStreak: number;
  rushBest: number;
  daily: string;
  xp: number;
  history: PuzzleHistoryEntry[];
  motifs: Record<string, MotifStat>;
};
