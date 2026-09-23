export type CloudExplorerSource = "masters" | "lichess" | "chesscom";

export type ExplorerSource = CloudExplorerSource | `file:${string}`;

export type ExplorerMoveRow = {
  san: string;
  uci: string;
  games: number;
  white: number;
  draws: number;
  black: number;
  averageRating: number | null;
};

export type ExplorerGameRow = {
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
  speed?: "bullet" | "blitz" | "rapid" | "classical" | null;
};

export type ExplorerResponse = {
  source: ExplorerSource;
  fen: string;
  white: number;
  draws: number;
  black: number;
  opening: { eco: string; name: string } | null;
  moves: ExplorerMoveRow[];
  games: ExplorerGameRow[];
  notice?: string;
};

export function isCloudExplorerSource(source: ExplorerSource): source is CloudExplorerSource {
  return source === "masters" || source === "lichess" || source === "chesscom";
}

export function fileExplorerSource(databaseId: string): ExplorerSource {
  return `file:${databaseId}`;
}

export function fileDatabaseId(source: ExplorerSource): string | null {
  return source.startsWith("file:") ? source.slice(5) : null;
}

export function explorerSourceTitle(
  source: ExplorerSource,
  databases: Array<{ id: string; name: string }>,
): string {
  if (source === "masters") {
    return "Ultra Database";
  }
  if (source === "lichess") {
    return "Online Database";
  }
  if (source === "chesscom") {
    return "Chess.com";
  }
  const id = fileDatabaseId(source);
  return databases.find((item) => item.id === id)?.name ?? "Personal";
}

export function explorerGamesTitle(
  source: ExplorerSource,
  databases: Array<{ id: string; name: string }>,
): string {
  if (source === "masters") {
    return "Ultra";
  }
  if (source === "lichess") {
    return "Online";
  }
  if (source === "chesscom") {
    return "Chess.com";
  }
  return explorerSourceTitle(source, databases);
}
