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
};

export type PlayerGamesResponse = {
  player: PlayerHit;
  games: PlayerGame[];
  truncated: boolean;
  notice?: string;
};
