export type PlayerSource = "lichess" | "chesscom" | "studio";

export type PlayerColorFilter = "all" | "white" | "black";

export type PlayerResultFilter = "all" | "win" | "loss" | "draw";

export type PlayerHit = {
  id: string;
  source: PlayerSource;
  username: string;
  displayName: string;
  subtitle: string;
  title?: string;
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
  timeClass?: string | null;
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
};

export type PlayerGamesResponse = {
  player: PlayerHit;
  games: PlayerGame[];
  truncated: boolean;
  notice?: string;
};
