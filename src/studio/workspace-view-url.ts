import type { WorkspaceView } from "@/src/store/slices/types";

// SIG-1273 / SIG-1288: the center view lives in the URL. Studio is the default
// and carries no parameter.
//
// URL scheme (the Live params are only meaningful with `view=live` and are
// cleared whenever the view changes away from it):
//   ?view=library
//   ?view=live
//   ?view=live&live=<roundId>                            round open (Live 4/7)
//   ?view=live&games=<roundId:gameId,...>&focus=<roundId:gameId>   live boards (Live 6/7)
const PARAM = "view";
const LIVE_ROUND_PARAM = "live";
const LIVE_GAMES_PARAM = "games";
const LIVE_FOCUS_PARAM = "focus";

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
