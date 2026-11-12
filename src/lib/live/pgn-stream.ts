// SIG-1287: incremental splitter for the Lichess round PGN stream. Pure, no I/O.
// The stream sends every game of the round, then one full PGN per update (and per added game).
import { splitPgnGames } from "../../chess/pgn-games";

const RESULT = "(?:1-0|0-1|1\\/2-1\\/2|\\*)";
// A game whose movetext already ends in a result token and a blank line is complete even before the
// next `[Event ` arrives, so a live update is not held back until the following game.
const TERMINATED = new RegExp(`^\\s*\\[[\\s\\S]*?\\]\\n\\n[\\s\\S]*?\\s${RESULT}\\n\\n\\s*$`);
const BOUNDARY = /\n\n+(?=\[Event )/;

export type PgnStreamSplitter = {
  /** Feed a decoded text chunk; returns the games completed by it. */
  push(text: string): string[];
  /** End of stream: returns the buffered tail, if it holds a game. */
  flush(): string[];
};

export function createPgnStreamSplitter(): PgnStreamSplitter {
  let buffer = "";
  let pendingCr = false;

  // `splitPgnGames` strips noise and drops blank/unusable chunks, so each emitted game is ready for importPgn.
  const emit = (raw: string[]) => raw.flatMap((game) => (game.trim() ? splitPgnGames(game) : []));

  return {
    push(text) {
      let incoming = text;
      if (pendingCr) {
        incoming = `\r${incoming}`;
        pendingCr = false;
      }
      // A chunk may end between \r and \n.
      if (incoming.endsWith("\r")) {
        incoming = incoming.slice(0, -1);
        pendingCr = true;
      }
      buffer += incoming.replace(/\r\n/g, "\n");
      const parts = buffer.split(BOUNDARY);
      const tail = parts.pop() ?? "";
      const complete = parts;
      if (TERMINATED.test(tail)) {
        complete.push(tail);
        buffer = "";
      } else {
        buffer = tail;
      }
      return emit(complete);
    },
    flush() {
      const rest = (pendingCr ? `${buffer}\r` : buffer).replace(/\r\n/g, "\n");
      buffer = "";
      pendingCr = false;
      return /^\s*\[/.test(rest) ? emit([rest]) : [];
    },
  };
}
