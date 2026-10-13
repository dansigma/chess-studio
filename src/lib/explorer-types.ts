export type CloudExplorerSource = "masters" | "lichess" | "chesscom";

export type ExplorerSource = CloudExplorerSource | "curated" | `file:${string}`;

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

export function isExplorerSource(value: unknown): value is ExplorerSource {
  if (value === "curated" || value === "masters" || value === "lichess" || value === "chesscom") {
    return true;
  }
  if (typeof value === "string" && value.startsWith("file:")) {
    const suffix = value.slice("file:".length);
    return suffix.length > 0 && !/\s/.test(suffix);
  }
  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMoveRow(value: unknown): value is ExplorerMoveRow {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.san === "string" &&
    typeof value.uci === "string" &&
    typeof value.games === "number" &&
    typeof value.white === "number" &&
    typeof value.draws === "number" &&
    typeof value.black === "number" &&
    (typeof value.averageRating === "number" || value.averageRating === null)
  );
}

function isGameRow(value: unknown): value is ExplorerGameRow {
  if (!isRecord(value)) {
    return false;
  }
  if (typeof value.id !== "string") {
    return false;
  }
  if (
    value.winner !== "white" &&
    value.winner !== "black" &&
    value.winner !== "draw" &&
    value.winner !== null
  ) {
    return false;
  }
  if (typeof value.whiteName !== "string" || typeof value.blackName !== "string") {
    return false;
  }
  for (const field of ["whiteRating", "blackRating", "year", "month"] as const) {
    if (typeof value[field] !== "number" && value[field] !== null) {
      return false;
    }
  }
  for (const field of ["event", "eco", "opening"] as const) {
    if (typeof value[field] !== "string" && value[field] !== null) {
      return false;
    }
  }
  if (value.pgn !== undefined && typeof value.pgn !== "string") {
    return false;
  }
  return (
    value.speed === undefined ||
    value.speed === null ||
    value.speed === "bullet" ||
    value.speed === "blitz" ||
    value.speed === "rapid" ||
    value.speed === "classical"
  );
}

function isOpening(value: unknown): value is { eco: string; name: string } {
  return (
    isRecord(value) && typeof value.eco === "string" && typeof value.name === "string"
  );
}

/**
 * Runtime guard for cached explorer payloads (Supabase `payload` column).
 * Validates every field the panels render: top-level totals, the opening
 * badge (`eco`/`name`), all move rows (incl. `white`/`draws`/`black` for
 * `ResultBar`), and all game rows (incl. `winner`/`whiteName`/`blackName`).
 * An invalid payload only falls through to the normal fetch path, never crashes.
 */
export function isExplorerResponse(value: unknown): value is ExplorerResponse {
  if (!isRecord(value)) {
    return false;
  }
  if (typeof value.fen !== "string" || typeof value.source !== "string") {
    return false;
  }
  if (
    typeof value.white !== "number" ||
    typeof value.draws !== "number" ||
    typeof value.black !== "number"
  ) {
    return false;
  }
  if (!Array.isArray(value.moves) || !Array.isArray(value.games)) {
    return false;
  }
  if (value.opening !== null && value.opening !== undefined && !isOpening(value.opening)) {
    return false;
  }
  return value.moves.every(isMoveRow) && value.games.every(isGameRow);
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
  if (source === "curated") {
    return "Curated Masters";
  }
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
  if (source === "curated") {
    return "Curated";
  }
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
