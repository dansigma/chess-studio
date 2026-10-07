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

export const THEME_CARDS: { id: PuzzleTheme; label: string; blurb: string }[] = [
  { id: "mate", label: "Mate", blurb: "Finish the game" },
  { id: "fork", label: "Fork", blurb: "One move, two targets" },
  { id: "pin", label: "Pin", blurb: "A piece that cannot step off" },
  { id: "skewer", label: "Skewer", blurb: "The king moves, the piece falls" },
  { id: "discoveredAttack", label: "Discovery", blurb: "Step aside and give check" },
  { id: "backRank", label: "Back rank", blurb: "The king is boxed in" },
  { id: "sacrifice", label: "Sacrifice", blurb: "Give material to mate" },
  { id: "endgame", label: "Endgame", blurb: "Few pieces, one idea" },
  { id: "promotion", label: "Promotion", blurb: "Turn a pawn into a piece" },
];

export const THEME_LABELS: Record<PuzzleTheme, string> = {
  mate: "Mate",
  mateIn1: "Mate in 1",
  mateIn2: "Mate in 2",
  fork: "Fork",
  pin: "Pin",
  skewer: "Skewer",
  discoveredAttack: "Discovered attack",
  backRank: "Back rank",
  sacrifice: "Sacrifice",
  attraction: "Attraction",
  endgame: "Endgame",
  promotion: "Promotion",
  middlegame: "Middlegame",
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
};
