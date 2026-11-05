// scripts/opening-book/profiles.mjs
// SIG-1229: what a source database is allowed to contribute, per profile.
//
//   lichess          Lichess open database dumps: both players >= 2300 (Lichess
//                    scale), blitz/rapid/classical by TimeControl. Games are
//                    unique and carry no player-diversity requirement.
//   masters          Over-the-board games (ChessBase exports, Ajedrez Data
//                    AJ-OTB): no speed filter, both Elos present and >= 2100
//                    (FIDE scale), no online games, de-duplicated, and a move is
//                    theory only when >= 5 distinct players played it.
//   correspondence  ICCF / IECG / LSS / server-daily games (AJ-CORR): only
//                    correspondence, both Elos >= 2300 (ICCF / server scale, not
//                    FIDE or Lichess), same de-duplication and 5-player rule.
import { headerRejection as lichessRejection, speedOf } from "./pgn.mjs";

/** A move counts as theory only if at least this many distinct players played it (masters, correspondence). */
export const MIN_DISTINCT_PLAYERS = 5;

/** Order of magnitude of one Lichess monthly dump (standard rated), used only for the sanity warning. */
export const EXPECTED_LICHESS_GAMES_PER_MONTH = 90_000_000;

/** Site or Event naming an online server: such games are not over-the-board masters games. */
export const ONLINE_PATTERN =
  /lichess|chess\.com|chess24|playchess|chessbase\s+(?:server|online)|\bfics\b|freechess|\bicc\b|chessclub|internet\s+chess|\bonline\b|\binternet\b|\bchesstempo\b|\btornelo\b|\bplayzone\b|\bgameknot\b/i;

/**
 * `[Source]` values (Lumbra's GigaBase) that are online play, not over the board:
 * dropped by the masters profile. LichessEliteDatabase is Lichess games, which the
 * Lichess source already covers.
 */
export const EXCLUDED_SOURCES = new Set(["LichessEliteDatabase"]);

/**
 * Over-the-board tournaments relayed through Lichess broadcasts: kept even though
 * their Site/Event can contain "lichess.org". Recognized by `[Source]`, or by a
 * lichess.org/broadcast URL in Site or Event.
 */
export const BROADCAST_SOURCES = new Set(["LichessBroadcast"]);
export const BROADCAST_URL_PATTERN = /lichess\.org\/broadcast/i;

/** Site or Event naming a correspondence organisation or format. */
export const CORRESPONDENCE_PATTERN =
  /\biccf\b|\biecg\b|\blss\b|correspondence|\bcorr\b|e-?mail|fernschach|schaakserver|\bwebserver\b|\bserver\b|\bdaily\b|\bpostal\b|\bcentral\s+european\s+corr/i;

export const PROFILE_NAMES = ["lichess", "masters", "correspondence"];

export const PROFILES = {
  lichess: { minElo: 2300, dedupe: false, minDistinctPlayers: 0 },
  masters: { minElo: 2100, dedupe: true, minDistinctPlayers: MIN_DISTINCT_PLAYERS },
  correspondence: { minElo: 2300, dedupe: true, minDistinctPlayers: MIN_DISTINCT_PLAYERS },
};

function elosAtLeast(headers, minElo) {
  const white = Number(headers.WhiteElo);
  const black = Number(headers.BlackElo);
  const present = (value) => value !== undefined && value !== "" && value !== "?" && value !== "-" && Number.isFinite(Number(value)) && Number(value) > 0;
  if (!present(headers.WhiteElo) || !present(headers.BlackElo)) {
    return "noElo";
  }
  return white >= minElo && black >= minElo ? null : "elo";
}

function nonStandard(headers) {
  return (headers.Variant && headers.Variant !== "Standard") || headers.FEN !== undefined || headers.SetUp === "1";
}

/** Estimated seconds per move period of a PGN TimeControl, or null when unknown ("-", "?", absent). */
export function timeControlSeconds(timeControl) {
  const text = (timeControl ?? "").trim();
  if (text === "" || text === "-" || text === "?") {
    return null;
  }
  const incremental = /^(\d+)\+(\d+)$/.exec(text);
  if (incremental) {
    return Number(incremental[1]) + 40 * Number(incremental[2]);
  }
  // "1/86400" (one move per day), "40/7200:3600" (stages: per-period seconds of the first stage), "86400".
  const staged = /^(?:\d+\/)?(\d+)(?:[:+].*)?$/.exec(text.split(":")[0]);
  return staged ? Number(staged[1]) : null;
}

const DAY = 86400;

/**
 * Why a game is rejected by `profile` from its headers alone, or null.
 * Reasons: variant, aborted/result, noElo, elo, speed (lichess), online
 * (masters), notCorrespondence (correspondence).
 */
export function profileRejection(profile, headers, options) {
  const minElo = options.minElo ?? PROFILES[profile].minElo;
  if (profile === "lichess") {
    return nonStandard(headers) ? "variant" : lichessRejection(headers, minElo);
  }
  if (nonStandard(headers)) {
    return "variant";
  }
  if (headers.Result === "*" || headers.Result === undefined || headers.Result === "?") {
    return "result";
  }
  const elo = elosAtLeast(headers, minElo);
  if (elo) {
    return elo;
  }
  const place = `${headers.Site ?? ""} ${headers.Event ?? ""}`;
  if (profile === "masters") {
    if (EXCLUDED_SOURCES.has(headers.Source)) {
      return "online";
    }
    if (BROADCAST_SOURCES.has(headers.Source) || BROADCAST_URL_PATTERN.test(place)) {
      return null;
    }
    return ONLINE_PATTERN.test(place) ? "online" : null;
  }
  // Correspondence: live play (a clock under a day) is out; otherwise a
  // TimeControl of a day or more, or a correspondence marker in Site/Event, is
  // the evidence that it is not over the board.
  const seconds = timeControlSeconds(headers.TimeControl);
  if (seconds !== null && seconds < DAY) {
    return "notCorrespondence";
  }
  if (options.assumeCorrespondence || seconds !== null || CORRESPONDENCE_PATTERN.test(place)) {
    return null;
  }
  return "notCorrespondence";
}

export { speedOf };
