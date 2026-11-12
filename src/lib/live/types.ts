// SIG-1287: shared contract for Live (Lichess broadcasts). Pure data, no React.

export type BroadcastTourSummary = {
  id: string;
  slug: string;
  name: string;
  format: string | null; // tour.info.format
  timeControl: string | null; // tour.info.tc
  location: string | null; // tour.info.location
  imageUrl: string | null;
  tier: number | null;
  dates: [number, number] | null; // epoch ms; a tour with a single date has start === end
  url: string; // lichess.org page, for the attribution link
};

export type BroadcastRoundSummary = {
  id: string;
  slug: string;
  name: string;
  ongoing: boolean;
  finished: boolean;
  startsAt: number | null;
  url: string;
};

export type BroadcastGroupTour = { id: string; name: string; active: boolean; live: boolean };

/** A tournament group ("Group Stage | A", "Group Stage | B"... of the same event). */
export type BroadcastGroup = { id: string; slug: string; name: string; tours: BroadcastGroupTour[] };

export type BroadcastListItem = {
  tour: BroadcastTourSummary;
  round: BroadcastRoundSummary | null;
  /** Group name, as a string (the list endpoint does not send the group id). */
  group: string | null;
  /** Round the list should link to (the API sends it for finished/past tours); falls back to `round`. */
  roundToLink?: BroadcastRoundSummary;
};

/** `past` of `/api/broadcast/top`: a paginator. */
export type BroadcastPastPage = {
  currentPage: number;
  maxPerPage: number;
  currentPageResults: BroadcastListItem[];
  previousPage: number | null;
  nextPage: number | null;
};

/** The API serves at most this many pages of past broadcasts. */
export const BROADCAST_TOP_MAX_PAGE = 20;

/** `active` and `upcoming` only come with page 1; they are empty on later pages. */
export type BroadcastListPage = {
  active: BroadcastListItem[];
  upcoming: BroadcastListItem[];
  past: BroadcastPastPage;
  nextPage: number | null; // past.nextPage, capped at BROADCAST_TOP_MAX_PAGE
};

export type BroadcastTour = {
  tour: BroadcastTourSummary;
  rounds: BroadcastRoundSummary[];
  group: BroadcastGroup | null;
  defaultRoundId: string | null;
};

export type LiveResult = "*" | "1-0" | "0-1" | "1/2-1/2";

export type LivePlayer = {
  name: string;
  title: string | null;
  rating: number | null;
  fed: string | null;
  fideId: number | null;
  clockMs: number | null;
};

export type LiveGame = {
  id: string;
  roundId: string;
  white: LivePlayer;
  black: LivePlayer;
  fen: string;
  lastMoveUci: string | null;
  result: LiveResult;
  thinkTimeSec: number | null;
  pgn: string | null; // filled once the PGN is known (stream or round PGN)
  updatedAt: number; // epoch ms of the last update applied
};

export type BroadcastRoundSnapshot = {
  tour: BroadcastTourSummary;
  round: BroadcastRoundSummary;
  games: LiveGame[];
  group: BroadcastGroup | null;
  /** Not sent by the round endpoint; null unless a caller fills it from the tour response. */
  defaultRoundId: string | null;
};

/** Player data from the PGN headers, enough to build a game the stream adds mid-round. */
export type LiveUpdatePlayer = {
  name: string;
  title: string | null;
  rating: number | null;
  fideId: number | null;
  /** Federation only exists in the JSON snapshot, never in the PGN. */
  fed?: string | null;
};

export type LiveGameUpdate = {
  id: string;
  roundId: string;
  pgn: string;
  fen: string;
  lastMoveUci: string | null;
  result: LiveResult;
  white: LiveUpdatePlayer;
  black: LiveUpdatePlayer;
  whiteClockMs: number | null;
  blackClockMs: number | null;
};
