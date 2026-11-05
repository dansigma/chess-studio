// scripts/opening-book/pgn.mjs
// SIG-1226: streaming PGN reading and the header filter for the local opening
// book. Lichess monthly dumps are huge (tens of millions of games), so games
// are filtered on their HEADERS first and the movetext of a rejected game is
// never parsed.
import { StringDecoder } from "node:string_decoder";

/** Lichess speed from a TimeControl tag ("base+increment" seconds), or null when untimed. */
export function speedOf(timeControl) {
  const match = /^(\d+)\+(\d+)$/.exec((timeControl ?? "").trim());
  if (!match) {
    return null; // "-" (correspondence / unlimited) or malformed
  }
  // Lichess estimates a game's length as base + 40 * increment seconds and
  // buckets it: < 30 ultraBullet, < 180 bullet, < 480 blitz, < 1500 rapid,
  // otherwise classical (lila docs: "Lightning" under 30 s, bullet 30 s-3 min,
  // blitz 3-8 min, rapid 8-25 min, classical over 25 min; the same cut-offs as
  // scalachess Speed, written there as 0-29, 30-179, 180-479, 480-1499, 1500+).
  // Checked against those documented ranges, not against the Scala source.
  const total = Number(match[1]) + 40 * Number(match[2]);
  if (total < 30) {
    return "ultraBullet";
  }
  if (total < 180) {
    return "bullet";
  }
  if (total < 480) {
    return "blitz";
  }
  if (total < 1500) {
    return "rapid";
  }
  return "classical";
}

export const WANTED_SPEEDS = new Set(["blitz", "rapid", "classical"]);

/**
 * Why a game's headers reject it, or null when it passes: "elo" (a player under
 * minElo or an unrated one), "speed" (bullet, ultraBullet, correspondence),
 * "variant" (not standard chess), "aborted".
 */
export function headerRejection(headers, minElo) {
  if (headers.Variant && headers.Variant !== "Standard") {
    return "variant";
  }
  if (headers.Termination === "Abandoned" || headers.Result === "*") {
    return "aborted";
  }
  const white = Number(headers.WhiteElo);
  const black = Number(headers.BlackElo);
  if (!(white >= minElo) || !(black >= minElo)) {
    return "elo";
  }
  if (!WANTED_SPEEDS.has(speedOf(headers.TimeControl))) {
    return "speed";
  }
  return null;
}

const HEADER = /^\[(\w+)\s+"(.*)"\]\s*$/;

/**
 * Yields { headers, movetext } for each game of a line stream. Game boundaries
 * follow the Lichess layout: headers, a blank line, movetext, a blank line.
 * `classify(headers)` runs as soon as a game's headers are complete: a string
 * (the rejection reason) yields { headers, rejected } and the movetext is never
 * kept, which is what makes a month of dumps cheap to skim; null keeps the game.
 */
export async function* readGames(lines, classify = () => null, report = {}) {
  const RESULT_END = /(?:1-0|0-1|1\/2-1\/2|\*)\s*$/;
  let headers = {};
  let sawHeader = false;
  let movetext = "";
  let lastLine = "";
  let inMoves = false;
  let rejected = null;
  const finish = () => (rejected ? { headers, rejected } : { headers, movetext });
  const reset = () => {
    headers = {};
    movetext = "";
    lastLine = "";
    inMoves = false;
    sawHeader = false;
    rejected = null;
  };
  for await (const raw of lines) {
    const line = raw.trimEnd();
    const header = line.charCodeAt(0) === 91 /* [ */ ? HEADER.exec(line) : null;
    if (header) {
      if (inMoves) {
        yield finish();
        reset();
      }
      headers[header[1]] = header[2];
      sawHeader = true;
    } else if (line === "") {
      if (sawHeader && inMoves) {
        yield finish();
        reset();
      }
    } else if (sawHeader) {
      if (!inMoves) {
        rejected = classify(headers);
        inMoves = true;
      }
      lastLine = line;
      if (!rejected) {
        movetext += `${movetext ? " " : ""}${line}`;
      }
    }
  }
  // End of input: headers without moves, or moves that never reached a result,
  // mean the stream was cut mid-game (a dead decompressor, a truncated file).
  report.endedMidGame = sawHeader && (!inMoves || !RESULT_END.test(lastLine));
  if (sawHeader && inMoves) {
    yield finish();
  }
}

/**
 * Lines of a byte/text stream, as an async generator over the stream's own
 * chunk iterator: it only pulls the next chunk when the consumer asks for the
 * next line, so a slow consumer applies backpressure to the producer (a pipe
 * from zstd, stdin or a file) and no data is dropped or buffered without bound.
 */
export async function* linesOf(stream) {
  const decoder = new StringDecoder("utf8");
  let rest = "";
  let first = true;
  for await (const chunk of stream) {
    rest += typeof chunk === "string" ? chunk : decoder.write(chunk);
    if (first && rest.length > 0) {
      rest = rest.replace(/^\uFEFF/, "");
      first = false;
    }
    let start = 0;
    for (let at = rest.indexOf("\n", start); at >= 0; at = rest.indexOf("\n", start)) {
      yield rest.slice(start, at);
      start = at + 1;
    }
    rest = rest.slice(start);
  }
  rest += decoder.end();
  if (rest !== "") {
    yield rest;
  }
}

/** Removes {comments} and (possibly nested) variations. */
export function cleanMovetext(movetext) {
  const text = movetext.replace(/\{[^}]*\}/g, " ");
  if (!text.includes("(")) {
    return text;
  }
  let depth = 0;
  let out = "";
  for (const ch of text) {
    if (ch === "(") {
      depth += 1;
    } else if (ch === ")") {
      depth = Math.max(0, depth - 1);
    } else if (depth === 0) {
      out += ch;
    }
  }
  return out;
}

/**
 * SAN tokens of a movetext (comments such as { [%clk 0:03:00] }, move numbers,
 * NAGs and the result are dropped). Stops after `limit` tokens when given.
 */
export function sanTokens(movetext, limit = Infinity) {
  const text = cleanMovetext(movetext);
  const tokens = [];
  for (const token of text.split(/\s+/)) {
    if (!token || /^\d+\.+$/.test(token) || /^\$\d+$/.test(token) || /^(1-0|0-1|1\/2-1\/2|\*)$/.test(token)) {
      continue;
    }
    // "12.Nf3" glued to its move number, trailing !? marks, and 0-0 written with zeros.
    const san = token.replace(/^\d+\.+/, "").replace(/[?!]+$/, "").replace(/^0-0-0(?=[+#]?$)/, "O-O-O").replace(/^0-0(?=[+#]?$)/, "O-O");
    if (san) {
      tokens.push(san);
    }
    if (tokens.length >= limit) {
      break;
    }
  }
  return tokens;
}

/** Number of the last full move in the movetext ("... 23. Qxd5" -> 23); 0 if none. */
export function lastMoveNumber(movetext) {
  const text = cleanMovetext(movetext);
  let last = 0;
  for (const match of text.matchAll(/(\d+)\.(?!\d)/g)) {
    last = Number(match[1]);
  }
  return last;
}
