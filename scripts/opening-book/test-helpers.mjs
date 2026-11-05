// Shared helpers for the opening book script tests (SIG-1229).
import { Readable } from "node:stream";
import { linesOf } from "./pgn.mjs";

export const TEN_MOVES = "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O h3 Nb8 d4 Nbd7";
export const QGD = "d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 h6 Rc1 b6 cxd5 Nxd5 Bxe7 Qxe7 Nxd5 exd5";
export const ENGLISH = "c4 e5 Nc3 Nf6 Nf3 Nc6 g3 d5 cxd5 Nxd5 Bg2 Nb6 O-O Be7 d3 O-O a3 Be6 b4 f6";
export const PET = "b4 e5 Bb2 Bxb4 Bxe5 Nf6 Bb2 O-O Nf3 d6 e3 Nc6 Be2 Bg4 O-O Re8 h3 Bh5 d3 Qd7";

/** One PGN game; `headers` override the defaults (a key set to undefined is removed). */
export function pgn(sans, headers = {}, defaults = {}) {
  const base = {
    Event: "Rated Blitz game",
    Result: "1-0",
    WhiteElo: "2400",
    BlackElo: "2350",
    TimeControl: "180+0",
    Termination: "Normal",
    ...defaults,
    ...headers,
  };
  const moves = sans.split(" ");
  const text = moves.map((san, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${san}` : `${(i - 1) / 2 + 1}... ${san}`)).join(" ");
  const lines = Object.entries(base)
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => `[${name} "${value}"]`);
  return `${lines.join("\n")}\n\n${text} ${base.Result}\n\n`;
}

/** An over-the-board style game (no Lichess fields). */
export function otb(sans, headers = {}) {
  return pgn(sans, headers, {
    Event: "Open",
    Site: "Reykjavik ISL",
    Date: "2019.03.04",
    Round: "3",
    White: "A, A",
    Black: "B, B",
    WhiteElo: "2500",
    BlackElo: "2450",
    TimeControl: undefined,
    Termination: undefined,
  });
}

export function source(text) {
  return linesOf(Readable.from([text]));
}

export function many(count, make) {
  let text = "";
  for (let i = 0; i < count; i += 1) {
    text += make(i);
  }
  return text;
}

/** A distinct, letters-only surname per index ("Wa", "Wb", ... "Waa"): digits are not part of a normalized name. */
export function who(prefix, index) {
  let n = index;
  let letters = "";
  do {
    letters = String.fromCharCode(97 + (n % 26)) + letters;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return `${prefix}${letters}`;
}
