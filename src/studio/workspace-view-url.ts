import { isPlayerUsername, isStudioPlayerName } from "@/src/lib/request-validation";
import type { PlayerColorFilter, PlayerHit, PlayerSource } from "@/src/lib/player-types";
import type { WorkspaceView } from "@/src/store/slices/types";

// SIG-1273 / SIG-1288: the center view lives in the URL. Studio is the default
// and carries no parameter.
//
// URL scheme (the Live params are only meaningful with `view=live` and the
// Library params with `view=library`; all of them are cleared whenever the view
// or mode they belong to is left):
//   ?view=library
//   ?view=library&mode=players                           Library Players mode (SIG-1318)
//   ?view=library&mode=players&player=<source>:<name>    open player dossier (SIG-1346)
//   ?view=library&mode=players&player=<source>:<name>&color=white|black   side filter (SIG-1346)
//   ?view=live
//   ?view=live&live=<roundId>                            round open (Live 4/7)
//   ?view=live&games=<roundId:gameId,...>&focus=<roundId:gameId>   live boards (Live 6/7)
const PARAM = "view";
const MODE_PARAM = "mode";
const PLAYER_PARAM = "player";
const PLAYER_COLOR_PARAM = "color";
const LIVE_ROUND_PARAM = "live";
const LIVE_GAMES_PARAM = "games";
const LIVE_FOCUS_PARAM = "focus";
const PLAYER_SOURCES: PlayerSource[] = ["lichess", "chesscom", "studio"];

export type LiveGameRef = { roundId: string; gameId: string };
export type LiveUrlState = {
  round: string | null;
  games: LiveGameRef[];
  focus: LiveGameRef | null;
};

export const EMPTY_LIVE_URL_STATE: LiveUrlState = { round: null, games: [], focus: null };

export function parseWorkspaceView(search: string): WorkspaceView {
  const value = new URLSearchParams(search).get(PARAM);
  return value === "library" || value === "live" ? value : "studio";
}

export type LibraryMode = "games" | "players";

/** `games` is the default and carries no parameter; only meaningful with `view=library`. */
export function parseLibraryMode(search: string): LibraryMode {
  if (parseWorkspaceView(search) !== "library") {
    return "games";
  }
  return new URLSearchParams(search).get(MODE_PARAM) === "players" ? "players" : "games";
}

/** Returns `search` carrying the given Library mode (only kept inside the Library view). */
export function withLibraryMode(search: string, mode: LibraryMode): string {
  const params = new URLSearchParams(search);
  if (params.get(PARAM) !== "library" || mode === "games") {
    params.delete(MODE_PARAM);
    // SIG-1346: the dossier only exists in Players mode.
    clearPlayerParams(params);
  } else {
    params.set(MODE_PARAM, mode);
  }
  return toSearch(params);
}

export type LibraryPlayerUrlState = {
  player: PlayerHit;
  color: PlayerColorFilter;
};

function parseLibraryPlayerId(value: string | null): PlayerHit | null {
  if (!value) {
    return null;
  }
  const index = value.indexOf(":");
  if (index <= 0 || index === value.length - 1) {
    return null;
  }
  const source = value.slice(0, index);
  const name = value.slice(index + 1);
  if (!PLAYER_SOURCES.includes(source as PlayerSource)) {
    return null;
  }
  // A studio name comes from PGN headers, so it may contain spaces, commas and
  // colons; the online sources keep their stricter username rules.
  const valid = source === "studio" ? isStudioPlayerName(name) : isPlayerUsername(name);
  if (!valid) {
    return null;
  }
  return {
    id: `${source}:${name}`,
    source: source as PlayerSource,
    username: name,
    displayName: name,
    subtitle: "",
    ...(source === "studio" ? { inDatabases: true } : {}),
  };
}

/**
 * SIG-1346: the player whose dossier is open, read from `?player=<source>:<name>`
 * (plus `?color=white|black`). Only meaningful with `view=library&mode=players`;
 * an unknown source, an invalid name or a malformed value is ignored.
 */
export function parseLibraryPlayer(search: string): LibraryPlayerUrlState | null {
  if (parseLibraryMode(search) !== "players") {
    return null;
  }
  const params = new URLSearchParams(search);
  const player = parseLibraryPlayerId(params.get(PLAYER_PARAM));
  if (player === null) {
    return null;
  }
  const color = params.get(PLAYER_COLOR_PARAM);
  return {
    player,
    color: color === "white" || color === "black" ? color : "all",
  };
}

/**
 * Returns `search` carrying the open player dossier. The player is only kept
 * with `view=library&mode=players`; `color=all` is the default and omitted.
 */
export function withLibraryPlayer(
  search: string,
  player: PlayerHit | null,
  color: PlayerColorFilter = "all",
): string {
  const params = new URLSearchParams(search);
  if (player === null || parseLibraryMode(search) !== "players") {
    clearPlayerParams(params);
  } else {
    params.set(PLAYER_PARAM, `${player.source}:${player.username}`);
    if (color === "white" || color === "black") {
      params.set(PLAYER_COLOR_PARAM, color);
    } else {
      params.delete(PLAYER_COLOR_PARAM);
    }
  }
  return toSearch(params);
}

function clearPlayerParams(params: URLSearchParams): void {
  params.delete(PLAYER_PARAM);
  params.delete(PLAYER_COLOR_PARAM);
}

export function serializeLiveGameRef(ref: LiveGameRef): string {
  return `${ref.roundId}:${ref.gameId}`;
}

export function parseLiveGameRef(value: string | null | undefined): LiveGameRef | null {
  if (!value) {
    return null;
  }
  const index = value.indexOf(":");
  const roundId = value.slice(0, index);
  const gameId = value.slice(index + 1);
  if (index <= 0 || !gameId || gameId.includes(":")) {
    return null;
  }
  return { roundId, gameId };
}

/** Reads the Live params; returns the empty state unless `view=live`. */
export function parseLiveUrlState(search: string): LiveUrlState {
  if (parseWorkspaceView(search) !== "live") {
    return EMPTY_LIVE_URL_STATE;
  }
  const params = new URLSearchParams(search);
  const games: LiveGameRef[] = [];
  for (const part of (params.get(LIVE_GAMES_PARAM) ?? "").split(",")) {
    const ref = parseLiveGameRef(part);
    if (ref && !games.some((g) => g.roundId === ref.roundId && g.gameId === ref.gameId)) {
      games.push(ref);
    }
  }
  return {
    round: params.get(LIVE_ROUND_PARAM) || null,
    games,
    focus: parseLiveGameRef(params.get(LIVE_FOCUS_PARAM)),
  };
}

function clearLiveParams(params: URLSearchParams): void {
  params.delete(LIVE_ROUND_PARAM);
  params.delete(LIVE_GAMES_PARAM);
  params.delete(LIVE_FOCUS_PARAM);
}

function toSearch(params: URLSearchParams): string {
  const next = params.toString();
  return next ? `?${next}` : "";
}

/** Returns `search` (with leading `?`, or "") carrying the given view. */
export function withWorkspaceView(search: string, view: WorkspaceView): string {
  const params = new URLSearchParams(search);
  if (view === "studio") {
    params.delete(PARAM);
  } else {
    params.set(PARAM, view);
  }
  if (view !== "live") {
    clearLiveParams(params);
  }
  if (view !== "library") {
    params.delete(MODE_PARAM);
    clearPlayerParams(params);
  }
  return toSearch(params);
}

/** Returns `search` with `view=live` and the given Live params (empty ones are omitted). */
export function withLiveUrlState(search: string, state: Partial<LiveUrlState>): string {
  const params = new URLSearchParams(withWorkspaceView(search, "live"));
  clearLiveParams(params);
  if (state.round) {
    params.set(LIVE_ROUND_PARAM, state.round);
  }
  if (state.games && state.games.length > 0) {
    params.set(LIVE_GAMES_PARAM, state.games.map(serializeLiveGameRef).join(","));
  }
  if (state.focus) {
    params.set(LIVE_FOCUS_PARAM, serializeLiveGameRef(state.focus));
  }
  return toSearch(params);
}
