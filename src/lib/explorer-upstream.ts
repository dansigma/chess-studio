import { readCapped } from "./read-capped.ts";
import { UA, lichessToken } from "./players/shared.ts";
import type { CloudExplorerSource, ExplorerGameRow, ExplorerMoveRow, ExplorerResponse } from "./explorer-types.ts";

export type ExplorerUpstreamSource = "masters" | "lichess";

export const EXPLORER_BACKOFF_MS = 1000 * 30;
export const EXPLORER_UPSTREAM_MAX_BYTES = 512 * 1024;

const backoffUntil: Record<ExplorerUpstreamSource, number> = {
  masters: 0,
  lichess: 0,
};

export function _resetExplorerUpstreamForTest() {
  backoffUntil.masters = 0;
  backoffUntil.lichess = 0;
}

type LichessPlayer = {
  name?: string;
  rating?: number;
};

type LichessGame = {
  id?: string;
  winner?: string | null;
  white?: LichessPlayer;
  black?: LichessPlayer;
  year?: number;
  month?: number;
};

type LichessMove = {
  san?: string;
  uci?: string;
  white?: number;
  draws?: number;
  black?: number;
  averageRating?: number;
};

export type LichessExplorer = {
  white?: number;
  draws?: number;
  black?: number;
  opening?: { eco?: string; name?: string } | null;
  moves?: LichessMove[];
  topGames?: LichessGame[];
  recentGames?: LichessGame[];
};

export function explorerUpstreamEndpoints(source: ExplorerUpstreamSource, fen: string, filterQuery: string): string[] {
  if (source === "masters") {
    return [
      `https://explorer.lichess.ovh/masters?fen=${encodeURIComponent(fen)}&source=opening${filterQuery}`,
      `https://explorer.lichess.org/masters?fen=${encodeURIComponent(fen)}&source=opening${filterQuery}`,
    ];
  }
  return [
    `https://explorer.lichess.ovh/lichess?variant=standard&fen=${encodeURIComponent(fen)}&source=opening${filterQuery}`,
    `https://explorer.lichess.org/lichess?variant=standard&fen=${encodeURIComponent(fen)}&source=opening${filterQuery}`,
  ];
}

export function mapGame(game: LichessGame, opening: ExplorerResponse["opening"]): ExplorerGameRow {
  const winner =
    game.winner === "white" || game.winner === "black"
      ? game.winner
      : game.winner === "draw"
        ? "draw"
        : null;
  return {
    id: game.id ?? "",
    winner,
    whiteName: game.white?.name ?? "Unknown",
    whiteRating: game.white?.rating ?? null,
    blackName: game.black?.name ?? "Unknown",
    blackRating: game.black?.rating ?? null,
    year: game.year ?? null,
    month: game.month ?? null,
    event: game.year ? String(game.year) : null,
    eco: opening?.eco ?? null,
    opening: opening?.name ?? null,
  };
}

export function mapResponse(source: CloudExplorerSource, fen: string, data: LichessExplorer): ExplorerResponse {
  const opening =
    data.opening?.eco || data.opening?.name
      ? { eco: data.opening.eco ?? "", name: data.opening.name ?? "" }
      : null;
  const moves: ExplorerMoveRow[] = (data.moves ?? [])
    .filter((move) => move.san && move.uci)
    .map((move) => ({
      san: move.san as string,
      uci: move.uci as string,
      white: move.white ?? 0,
      draws: move.draws ?? 0,
      black: move.black ?? 0,
      games: (move.white ?? 0) + (move.draws ?? 0) + (move.black ?? 0),
      averageRating: move.averageRating ?? null,
    }));
  const games = [...(data.topGames ?? []), ...(data.recentGames ?? [])]
    .filter((game) => game.id)
    .map((game) => mapGame(game, opening));
  const unique = new Map<string, ExplorerGameRow>();
  for (const game of games) {
    unique.set(game.id, game);
  }
  return {
    source,
    fen,
    white: data.white ?? 0,
    draws: data.draws ?? 0,
    black: data.black ?? 0,
    opening,
    moves,
    games: [...unique.values()],
  };
}

export async function fetchExplorerUpstream(
  source: ExplorerUpstreamSource,
  fen: string,
  filterQuery: string,
): Promise<ExplorerResponse | null> {
  if (Date.now() < backoffUntil[source]) {
    return null;
  }
  const token = lichessToken();
  const endpoints = explorerUpstreamEndpoints(source, fen, filterQuery);
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": UA,
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        headers,
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      if (response.ok) {
        const text = await readCapped(response, EXPLORER_UPSTREAM_MAX_BYTES);
        const raw = JSON.parse(text) as LichessExplorer;
        backoffUntil[source] = 0;
        return mapResponse(source, fen, raw);
      }
    } catch {
      // try the fallback host
    }
  }
  backoffUntil[source] = Date.now() + EXPLORER_BACKOFF_MS;
  return null;
}
