import type { GameRecord, TreeMove } from "./format.ts";

export const XD_DATABASE_SOURCE = "xadrez-digital" as const;
export type XdGameHeader = Omit<GameRecord, "moves"> & { id: number };
export type XdGamePage = {
  games: XdGameHeader[];
  nextCursor: number | string | null;
  players?: { id: string; name: string; count: number }[];
  playersCapped?: boolean;
};
export type XdTree = {
  opening: { eco: string; name: string } | null;
  total: number;
  moves: (Omit<TreeMove, "code"> & { uci: string })[];
};

export async function fetchXdDatabase(path: string, signal?: AbortSignal, fetchImpl: typeof fetch = fetch, priority?: "low") {
  const response = await fetchImpl(`/api/xd-database/${path}`, { signal, priority });
  if (!response.ok) throw new Error(`Base Xadrez Digital (HTTP ${response.status})`);
  return response;
}

export async function searchXdPlayers(query: string, signal: AbortSignal, fetchImpl?: typeof fetch) {
  const q = query.trim();
  if (!q || q.length > 120) return [];
  const response = await fetchXdDatabase(`players?${new URLSearchParams({ q })}`, signal, fetchImpl);
  const { players }: { players: { id: string; name: string; count: number; firstYear: number | null; lastYear: number | null }[] } =
    await response.json();
  return players;
}

export async function loadXdGamePgn(id: string, signal?: AbortSignal, fetchImpl?: typeof fetch) {
  const response = await fetchXdDatabase(`game/${encodeURIComponent(id)}`, signal, fetchImpl);
  return response.text();
}

export function xdGameDate(date: string | null): string | null {
  const match = date?.match(/^(\d{4})(?:[.-](0[1-9]|1[0-2])(?:[.-](0[1-9]|[12]\d|3[01]))?)?/);
  return match && match[1] !== "0000" ? match.slice(1).filter(Boolean).join("-") : null;
}
