import type { MistakeCounts } from "./my-games/review-queue";

export type PlayerSource = "lichess" | "chesscom" | "studio" | "xadrez-digital";

export type PlayerColorFilter = "all" | "white" | "black";

export type PlayerResultFilter = "all" | "win" | "loss" | "draw";

export type PlayerHit = {
  id: string;
  source: PlayerSource;
  username: string;
  displayName: string;
  subtitle: string;
  title?: string;
  /**
   * Studio hits only: the player has games in the user's own databases
   * (imported PGNs), so the Library can list them. Sample-book-only players
   * leave it unset.
   */
  inDatabases?: boolean;
};

export type PlayerGame = {
  id: string;
  winner: "white" | "black" | "draw" | null;
  whiteName: string;
  whiteRating: number | null;
  blackName: string;
  blackRating: number | null;
  year: number | null;
  month: number | null;
  event: string | null;
  eco: string | null;
  opening: string | null;
  pgn?: string;
  moves?: string;
  /** Base Xadrez Digital games: the database game id (`moves` is cut short; the full PGN is fetched on open). */
  xdId?: number;
  timeClass?: string | null;
  // SIG-1048: rated flag for the opening-tree `ratedOnly` filter.
  // Null = unknown (rows imported before the rated migration).
  rated?: boolean | null;
  color: "white" | "black";
  playerResult: "win" | "loss" | "draw" | null;
  playedAt: number | null;
  // SIG-1090: batch review provenance. `rowId` is the `public.my_games` row id
  // (the review write-back key); `id` stays the external game id for openers.
  // Loaded games without a linked row (`rowId: null`, e.g. explorer hits) are
  // not reviewable and never join the batch queue.
  rowId?: string | null;
  userAccuracy?: number | null;
  opponentAccuracy?: number | null;
  reviewedAt?: string | null;
  // SIG-1091: per-phase mistake counts for the user's side (stats panel).
  // Mapped from `my_games.mistake_counts` with validation; null when the game
  // is unreviewed or the stored JSON is malformed.
  mistakeCounts?: MistakeCounts | null;
};

export type PlayerGamesResponse = {
  player: PlayerHit;
  games: PlayerGame[];
  truncated: boolean;
  /** Base Xadrez Digital only: the player's whole game count (`games` holds the newest ones). */
  total?: number;
  notice?: string;
  // SIG-1210: some upstream months were skipped or cut short (same flag name
  // as the player-search route's `partial`).
  partial?: boolean;
};
