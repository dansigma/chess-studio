import { env } from "cloudflare:workers";
import { isExplorerFen } from "@/src/lib/request-validation";
import { clientIp, createRouteLimiter, rateLimitKey } from "@/src/lib/rate-limit";
import { tooManyRequests } from "@/src/lib/rate-limit-response";
import { XD_DATABASE_PREFIX, XD_DATABASE_VERSION } from "@/src/lib/xd-database/manifest";
import type { GameRecord } from "@/src/lib/xd-database/format";
import { treeKeyOfFen, XdDatabaseReader } from "@/src/lib/xd-database/reader";

import { cacheXdRanges, xdEdgeCache } from "./range-cache";

type Bucket = {
  get(key: string, options?: { range: { offset: number; length: number } }):
    Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
};

const readers = new WeakMap<Bucket, { origin: string; reader: XdDatabaseReader }>();
const limiter = createRouteLimiter({ limit: 60, windowMs: 60_000, bindingName: "RL_60_MIN" });
const PUBLIC_CACHE = "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400";
const FILTERED_CACHE = "public, max-age=30, s-maxage=60";

export const PAGE_SIZE = 20;
export type IdParams = { params: Promise<{ id: string }> };

export function error(message: string, status = 400): Response {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export function positionQuery(query: URLSearchParams) {
  const fen = query.get("fen");
  if (!isExplorerFen(fen)) return null;
  const key = treeKeyOfFen(fen);
  return key === null ? null : { fen, key };
}

export function unsignedInteger(value: string): number {
  if (!/^\d{1,16}$/.test(value)) return NaN;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : NaN;
}

export function pageCursor(query: URLSearchParams): number {
  return unsignedInteger(query.get("cursor") ?? "0");
}

export function gameHeaders({ id, game }: { id: number; game: GameRecord }): { id: number } & Omit<GameRecord, "moves"> {
  const headers: Omit<GameRecord, "moves"> & { moves?: string } = { ...game };
  delete headers.moves;
  return { id, ...headers };
}

/** Games a player's lines are built from: the newest ones, cut to the tree's depth. */
export const LINES_GAMES = 200;
export const LINES_PLIES = 50;

export async function playerLines(
  reader: XdDatabaseReader,
  player: { start: number; count: number },
) {
  const postings = await reader.playerGameIds(player, 0, LINES_GAMES);
  const loaded = postings.length ? await reader.gamesById(postings.map((row) => row.id)) : [];
  const byId = new Map(loaded.map((row) => [row.id, row.game]));
  const games = postings.flatMap(({ id, color }) => {
    const game = byId.get(id);
    if (!game) return [];
    const { moves, white, black, whiteElo, blackElo, result, date, event, eco } = game;
    const playerResult = result === "1/2-1/2"
      ? "draw" as const
      : (result === "1-0") === (color === "white") ? "win" as const : "loss" as const;
    return [{
      id, white, black, whiteElo, blackElo, result, date, event, eco, color, playerResult,
      moves: moves.split(" ").slice(0, LINES_PLIES).join(" "),
    }];
  });
  return { total: player.count, games };
}

export async function serve(
  request: Request,
  load: (reader: XdDatabaseReader) => Promise<Response>,
  filtered = false,
): Promise<Response> {
  const edge = xdEdgeCache();
  const url = new URL(request.url);
  url.searchParams.set("__xd_version", String(XD_DATABASE_VERSION));
  url.searchParams.sort();
  const key = url.href;
  try {
    const cached = await edge?.match(key);
    if (cached) return cached;
  } catch {
    // The edge cache is optional. Serve from R2 when it is unavailable.
  }

  const verdict = await limiter.checkAsync(rateLimitKey("xd-database", clientIp(request.headers)));
  if (!verdict.ok) return tooManyRequests(verdict);
  const bucket = (env as unknown as { XD_DATABASE?: Bucket }).XD_DATABASE;
  if (!bucket) return error("Database unavailable", 503);

  let entry = readers.get(bucket);
  if (entry?.origin !== url.origin) {
    const reader = new XdDatabaseReader(cacheXdRanges(url.origin, async (file, range) => {
      const object = await bucket.get(`${XD_DATABASE_PREFIX}${file}`, range && {
        range: { offset: range.start, length: range.end - range.start },
      });
      if (!object) throw new Error(`Missing database file ${file}`);
      return new Uint8Array(await object.arrayBuffer());
    }));
    entry = { origin: url.origin, reader };
    readers.set(bucket, entry);
  }

  let response: Response;
  try {
    response = await load(entry.reader);
  } catch (cause) {
    console.error("[xd-database] read failed", cause);
    return error("Database unavailable", 503);
  }
  if (!response.ok) return response;
  response.headers.set("Cache-Control", filtered ? FILTERED_CACHE : PUBLIC_CACHE);
  response.headers.set("X-XD-Database-Version", String(XD_DATABASE_VERSION));
  try {
    await edge?.put(key, response.clone());
  } catch {
    // The successful response can still be returned.
  }
  return response;
}
