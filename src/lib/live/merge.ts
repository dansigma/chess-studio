// SIG-1289: merge rules for live games. Pure, no I/O.
//
// Two kinds of input, two rules:
//  - A JSON snapshot (`fetchRound`, also used for polling) only carries a FEN. It is applied only
//    when it is NEWER than what the store holds: more plies (full-move number + side to move from
//    the FEN) or a final result where the store has none. A snapshot never moves a game backwards.
//  - A full PGN from the stream is AUTHORITATIVE and may move a game backwards (the broadcaster
//    corrected a move). It replaces the position, result, PGN and clocks.
// In both cases player metadata is merged field by field: the federation exists only in the JSON
// snapshot, so a stream update must never wipe `fed`, nor a title/rating the PGN headers lack.
import type { LiveGame, LiveGameUpdate, LivePlayer, LiveUpdatePlayer } from "./types";

/** Plies played, derived from a FEN: `fullmove * 2 + (black to move ? 1 : 0)`. Null if unreadable. */
export function fenPly(fen: string): number | null {
  const parts = fen.trim().split(/\s+/);
  const side = parts[1];
  const fullMove = Number(parts[5]);
  if ((side !== "w" && side !== "b") || !Number.isInteger(fullMove) || fullMove < 1) {
    return null;
  }
  return fullMove * 2 + (side === "b" ? 1 : 0);
}

function mergePlayer(prev: LivePlayer, next: LiveUpdatePlayer | LivePlayer): LivePlayer {
  return {
    name: next.name || prev.name,
    title: next.title ?? prev.title,
    rating: next.rating ?? prev.rating,
    fed: ("fed" in next ? next.fed : undefined) ?? prev.fed,
    fideId: next.fideId ?? prev.fideId,
    clockMs: "clockMs" in next ? (next.clockMs ?? prev.clockMs) : prev.clockMs,
  };
}

function playerFromUpdate(p: LiveUpdatePlayer, clockMs: number | null): LivePlayer {
  return { name: p.name, title: p.title, rating: p.rating, fed: p.fed ?? null, fideId: p.fideId, clockMs };
}

/** True when `incoming` (a snapshot game) is strictly newer than `prev`. */
export function isNewerSnapshot(prev: LiveGame, incoming: LiveGame): boolean {
  if (incoming.result !== "*" && prev.result === "*") {
    return true;
  }
  if (prev.result !== "*" && incoming.result === "*") {
    return false;
  }
  const a = fenPly(prev.fen);
  const b = fenPly(incoming.fen);
  return b !== null && (a === null || b > a);
}

/** Apply one game of a JSON snapshot. Never moves the board backwards; always enriches metadata. */
export function mergeSnapshotGame(prev: LiveGame | undefined, incoming: LiveGame): LiveGame {
  if (!prev) {
    return incoming;
  }
  if (isNewerSnapshot(prev, incoming)) {
    return {
      ...prev,
      white: mergePlayer(prev.white, incoming.white),
      black: mergePlayer(prev.black, incoming.black),
      fen: incoming.fen,
      lastMoveUci: incoming.lastMoveUci,
      result: incoming.result,
      thinkTimeSec: incoming.thinkTimeSec,
      // The stored PGN is now behind the board; consumers refetch it (fetchRoundPgn) or wait for the stream.
      pgn: null,
      // SIG-1312: the stored eval belongs to the old position; a missing eval is never a stale one.
      lastEval: null,
      updatedAt: incoming.updatedAt,
    };
  }
  // Not newer: keep the board, but the snapshot is the only source of `fed` (and fills gaps).
  const samePosition = fenPly(prev.fen) === fenPly(incoming.fen);
  const white = mergePlayer(prev.white, { ...incoming.white, clockMs: null });
  const black = mergePlayer(prev.black, { ...incoming.black, clockMs: null });
  const thinkTimeSec = samePosition ? (incoming.thinkTimeSec ?? prev.thinkTimeSec) : prev.thinkTimeSec;
  const same =
    white.fed === prev.white.fed &&
    black.fed === prev.black.fed &&
    white.title === prev.white.title &&
    black.title === prev.black.title &&
    white.rating === prev.white.rating &&
    black.rating === prev.black.rating &&
    white.fideId === prev.white.fideId &&
    black.fideId === prev.black.fideId &&
    thinkTimeSec === prev.thinkTimeSec;
  return same ? prev : { ...prev, white, black, thinkTimeSec };
}

/** Apply a full-PGN stream update. Authoritative: may move the game backwards. */
export function mergeStreamUpdate(prev: LiveGame | undefined, update: LiveGameUpdate, now: number): LiveGame {
  if (
    prev &&
    prev.pgn === update.pgn &&
    prev.result === update.result &&
    prev.fen === update.fen
  ) {
    return prev; // the stream's first burst re-sends everything: avoid pointless churn
  }
  const base: LivePlayer = { name: "", title: null, rating: null, fed: null, fideId: null, clockMs: null };
  const white = mergePlayer(prev?.white ?? base, playerFromUpdate(update.white, update.whiteClockMs));
  const black = mergePlayer(prev?.black ?? base, playerFromUpdate(update.black, update.blackClockMs));
  return {
    id: update.id,
    roundId: update.roundId,
    white,
    black,
    fen: update.fen,
    lastMoveUci: update.lastMoveUci,
    result: update.result,
    // Think time only exists in the snapshot and describes the position it came with.
    thinkTimeSec: prev && prev.fen === update.fen ? prev.thinkTimeSec : null,
    pgn: update.pgn,
    lastEval: update.lastEval ?? null,
    // SIG-1313: the PGN headers are the only source; a PGN without them keeps what an earlier one said.
    eco: update.eco ?? prev?.eco ?? null,
    opening: update.opening ?? prev?.opening ?? null,
    updatedAt: now,
  };
}
