// SIG-1287: browser-side client for the public Lichess Broadcast API. No token, no User-Agent
// (browsers cannot set one), no server route: the API sends `access-control-allow-origin: *`.
import { createPgnStreamSplitter } from "./pgn-stream";
import { normalizeResult, parseGame } from "./parse-game";
import {
  BROADCAST_TOP_MAX_PAGE,
  type BroadcastGroup,
  type BroadcastListItem,
  type BroadcastListPage,
  type BroadcastPastPage,
  type BroadcastRoundSnapshot,
  type BroadcastRoundSummary,
  type BroadcastTour,
  type BroadcastTourSummary,
  type LiveGame,
  type LiveGameUpdate,
  type LivePlayer,
} from "./types";

export const LICHESS_ORIGIN = "https://lichess.org";
export const RATE_LIMIT_BACKOFF_MS = 60_000;

export class LiveHttpError extends Error {
  readonly status: number;
  constructor(status: number, url: string) {
    super(`Lichess request failed with HTTP ${status}: ${url}`);
    this.name = "LiveHttpError";
    this.status = status;
  }
}

/** HTTP 429: Lichess asks clients to wait a full minute. */
export class LiveRateLimitedError extends LiveHttpError {
  readonly retryAfterMs = RATE_LIMIT_BACKOFF_MS;
  constructor(url: string) {
    super(429, url);
    this.name = "LiveRateLimitedError";
  }
}

// ---- JSON mapping (pure, exported for tests) ----

type Json = Record<string, unknown>;

function rec(value: unknown): Json {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Json) : {};
}
function str(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}
function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function mapTourSummary(raw: unknown): BroadcastTourSummary {
  const tour = rec(raw);
  const info = rec(tour.info);
  const dates = Array.isArray(tour.dates) ? tour.dates.map(num).filter((d): d is number => d !== null) : [];
  const start = dates[0];
  return {
    id: str(tour.id) ?? "",
    slug: str(tour.slug) ?? "",
    name: str(tour.name) ?? "",
    format: str(info.format),
    timeControl: str(info.tc),
    location: str(info.location),
    imageUrl: str(tour.image),
    tier: num(tour.tier),
    // A tour that has only started sends a single date: use it for both ends.
    dates: start === undefined ? null : [start, dates[1] ?? start],
    url: str(tour.url) ?? "",
  };
}

export function mapRoundSummary(raw: unknown, tourSlug = ""): BroadcastRoundSummary {
  const round = rec(raw);
  const id = str(round.id) ?? "";
  const slug = str(round.slug) ?? "";
  return {
    id,
    slug,
    name: str(round.name) ?? "",
    ongoing: round.ongoing === true,
    finished: round.finished === true,
    startsAt: num(round.startsAt),
    // `roundToLink` in the list comes without a url; the page url is derivable.
    url: str(round.url) ?? `${LICHESS_ORIGIN}/broadcast/${tourSlug || "-"}/${slug || "-"}/${id}`,
  };
}

export function mapGroup(raw: unknown): BroadcastGroup | null {
  const group = rec(raw);
  const id = str(group.id);
  if (!id) {
    return null;
  }
  return {
    id,
    slug: str(group.slug) ?? "",
    name: str(group.name) ?? "",
    tours: (Array.isArray(group.tours) ? group.tours : []).map((t) => {
      const tour = rec(t);
      return { id: str(tour.id) ?? "", name: str(tour.name) ?? "", active: tour.active === true, live: tour.live === true };
    }),
  };
}

function mapListItem(raw: unknown): BroadcastListItem {
  const item = rec(raw);
  const tour = mapTourSummary(item.tour);
  const roundToLink = item.roundToLink ? mapRoundSummary(item.roundToLink, tour.slug) : undefined;
  return {
    tour,
    round: item.round ? mapRoundSummary(item.round, tour.slug) : null,
    group: typeof item.group === "string" ? item.group : null,
    ...(roundToLink ? { roundToLink } : {}),
  };
}

function mapItems(raw: unknown): BroadcastListItem[] {
  return Array.isArray(raw) ? raw.map(mapListItem) : [];
}

export function mapBroadcastTop(raw: unknown): BroadcastListPage {
  const top = rec(raw);
  const past = rec(top.past);
  const currentPage = num(past.currentPage) ?? 1;
  const apiNext = num(past.nextPage);
  const nextPage = apiNext !== null && apiNext <= BROADCAST_TOP_MAX_PAGE ? apiNext : null;
  const pastPage: BroadcastPastPage = {
    currentPage,
    maxPerPage: num(past.maxPerPage) ?? 0,
    currentPageResults: mapItems(past.currentPageResults),
    previousPage: num(past.previousPage),
    nextPage,
  };
  return { active: mapItems(top.active), upcoming: mapItems(top.upcoming), past: pastPage, nextPage };
}

export function mapBroadcastTour(raw: unknown): BroadcastTour {
  const data = rec(raw);
  const tour = mapTourSummary(data.tour);
  return {
    tour,
    rounds: (Array.isArray(data.rounds) ? data.rounds : []).map((r) => mapRoundSummary(r, tour.slug)),
    group: mapGroup(data.group),
    defaultRoundId: str(data.defaultRoundId),
  };
}

function mapPlayer(raw: unknown): LivePlayer {
  const p = rec(raw);
  const clockCs = num(p.clock);
  return {
    name: str(p.name) ?? "",
    title: str(p.title),
    rating: num(p.rating),
    fed: str(p.fed),
    fideId: num(p.fideId),
    // JSON clocks are centiseconds.
    clockMs: clockCs === null ? null : clockCs * 10,
  };
}

export function mapBroadcastRound(raw: unknown, now: number = Date.now()): BroadcastRoundSnapshot {
  const data = rec(raw);
  const tour = mapTourSummary(data.tour);
  const round = mapRoundSummary(data.round, tour.slug);
  const games: LiveGame[] = (Array.isArray(data.games) ? data.games : []).map((g) => {
    const game = rec(g);
    const players = Array.isArray(game.players) ? game.players : [];
    return {
      id: str(game.id) ?? "",
      roundId: round.id,
      white: mapPlayer(players[0]),
      black: mapPlayer(players[1]),
      fen: str(game.fen) ?? "",
      lastMoveUci: str(game.lastMove),
      result: normalizeResult(game.status),
      thinkTimeSec: num(game.thinkTime),
      pgn: null,
      updatedAt: now,
    };
  });
  return { tour, round, games, group: mapGroup(data.group), defaultRoundId: str(data.defaultRoundId) };
}

// ---- HTTP ----

function isAbort(error: unknown, signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true || (error instanceof Error && error.name === "AbortError");
}

async function get(path: string, accept: string, signal: AbortSignal | undefined, query = ""): Promise<Response> {
  const url = `${LICHESS_ORIGIN}${path}${query}`;
  const response = await fetch(url, { headers: { Accept: accept }, signal });
  if (response.status === 429) {
    await response.body?.cancel().catch(() => undefined);
    throw new LiveRateLimitedError(url);
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new LiveHttpError(response.status, url);
  }
  return response;
}

/** Run a one-shot request; an aborted signal resolves to `null` instead of throwing. */
async function once<T>(signal: AbortSignal | undefined, run: () => Promise<T>): Promise<T | null> {
  try {
    return await run();
  } catch (error) {
    if (isAbort(error, signal)) {
      return null;
    }
    throw error;
  }
}

/** `null` when `signal` was aborted. Pages beyond BROADCAST_TOP_MAX_PAGE are not requested. */
export function fetchTopBroadcasts(page: number, signal?: AbortSignal): Promise<BroadcastListPage | null> {
  const safePage = Math.min(Math.max(Math.trunc(page) || 1, 1), BROADCAST_TOP_MAX_PAGE);
  return once(signal, async () =>
    mapBroadcastTop(await (await get("/api/broadcast/top", "application/json", signal, `?page=${safePage}`)).json()),
  );
}

export function fetchTour(tourId: string, signal?: AbortSignal): Promise<BroadcastTour | null> {
  return once(signal, async () =>
    mapBroadcastTour(await (await get(`/api/broadcast/${encodeURIComponent(tourId)}`, "application/json", signal)).json()),
  );
}

export function fetchRound(roundId: string, signal?: AbortSignal): Promise<BroadcastRoundSnapshot | null> {
  return once(signal, async () =>
    mapBroadcastRound(await (await get(`/api/broadcast/-/-/${encodeURIComponent(roundId)}`, "application/json", signal)).json()),
  );
}

export function fetchRoundPgn(roundId: string, signal?: AbortSignal): Promise<string | null> {
  return once(signal, async () =>
    (await get(`/api/broadcast/round/${encodeURIComponent(roundId)}.pgn`, "application/x-chess-pgn", signal, "?comments=false")).text(),
  );
}

/**
 * Follow a round: calls `onGame` for every complete PGN (all games first, then each update).
 * Resolves when the stream ends or `signal` aborts; rejects on a network or HTTP error.
 */
export async function streamRound(
  roundId: string,
  onGame: (update: LiveGameUpdate) => void,
  signal?: AbortSignal,
): Promise<void> {
  const splitter = createPgnStreamSplitter();
  const deliver = (games: string[]) => {
    for (const pgn of games) {
      const update = parseGame(pgn, roundId);
      if (update) {
        onGame(update);
      }
    }
  };
  try {
    const response = await get(
      `/api/stream/broadcast/round/${encodeURIComponent(roundId)}.pgn`,
      "application/x-chess-pgn",
      signal,
      "?comments=false",
    );
    if (!response.body) {
      deliver(splitter.push(await response.text()));
    } else {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        deliver(splitter.push(decoder.decode(value, { stream: true })));
      }
      deliver(splitter.push(decoder.decode()));
    }
    deliver(splitter.flush());
  } catch (error) {
    if (isAbort(error, signal)) {
      return;
    }
    throw error;
  }
}
