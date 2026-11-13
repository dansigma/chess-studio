// SIG-1315: a live game opens in the Studio in a new browser tab, from a link that names the game
// (`/studio?broadcast=<roundId>:<gameId>&ply=<n>`). The Live tab keeps its stream; the Studio tab
// loads the round PGN by itself. Pure helpers, shared by every "open in Studio" entry point.
import { parseLiveGameRef, serializeLiveGameRef, type LiveGameRef } from "../workspace-view-url";

export const LIVE_STUDIO_PATH = "/studio";
const BROADCAST_PARAM = "broadcast";
const PLY_PARAM = "ply";

/** A live game to open in the Studio; `ply` absent = at the latest move. */
export type LiveStudioLink = LiveGameRef & { ply?: number };

function validPly(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}

/** Studio URL (path + query) that opens this live game on a new board. */
export function liveStudioHref(link: LiveStudioLink): string {
  const params = new URLSearchParams();
  params.set(BROADCAST_PARAM, serializeLiveGameRef(link));
  const ply = validPly(link.ply);
  if (ply !== undefined) {
    params.set(PLY_PARAM, String(ply));
  }
  return `${LIVE_STUDIO_PATH}?${params.toString()}`;
}

/** Reads the link from a Studio `search`; null when absent or malformed. A bad `ply` is ignored. */
export function parseLiveStudioLink(search: string): LiveStudioLink | null {
  const params = new URLSearchParams(search);
  const ref = parseLiveGameRef(params.get(BROADCAST_PARAM));
  if (!ref) {
    return null;
  }
  const rawPly = params.get(PLY_PARAM);
  const ply = rawPly !== null && /^\d+$/u.test(rawPly) ? validPly(Number(rawPly)) : undefined;
  return ply === undefined ? ref : { ...ref, ply };
}

/** `search` (with leading `?`, or "") without the live-game link params. */
export function withoutLiveStudioLink(search: string): string {
  const params = new URLSearchParams(search);
  params.delete(BROADCAST_PARAM);
  params.delete(PLY_PARAM);
  const next = params.toString();
  return next ? `?${next}` : "";
}

type HeaderPlayer = { name: string; rating: number | null; title: string | null };

/**
 * PGN headers for a live game opened in the Studio: Event, Site, players, Elo, Title and Result.
 * `event` / `site` fall back to the generic Lichess broadcast ones.
 */
export function liveGameStudioHeaders(input: {
  event?: string | null;
  site?: string | null;
  white: HeaderPlayer;
  black: HeaderPlayer;
  result: string;
}): Record<string, string> {
  const headers: Record<string, string> = {
    Event: input.event || "Lichess Broadcast",
    Site: input.site || "https://lichess.org/broadcast",
    White: input.white.name,
    Black: input.black.name,
    Result: input.result,
  };
  for (const [prefix, player] of [["White", input.white], ["Black", input.black]] as const) {
    if (player.rating !== null) {
      headers[`${prefix}Elo`] = String(player.rating);
    }
    if (player.title) {
      headers[`${prefix}Title`] = player.title;
    }
  }
  return headers;
}
