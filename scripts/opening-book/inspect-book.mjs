// scripts/opening-book/inspect-book.mjs
// SIG-1226: check a built book and compare it with the explorer book.
//
//   node scripts/opening-book/inspect-book.mjs out/opening-book-v1.bin.gz
//   node scripts/opening-book/inspect-book.mjs out/opening-book-v1.bin.gz --pgn games.pgn \
//     [--explorer http://localhost:3000/api/explorer/book] [--max-games 20]
//
// Without --pgn it prints the header counts. With --pgn it prints, per game, the
// number of leading book plies from the local book and (with --explorer) from the
// SIG-1225 explorer route, and a summary of how often they agree. The explorer
// route needs a running app with a LICHESS_TOKEN.
import { readFileSync } from "node:fs";
import { createReadStream } from "node:fs";
import { gunzipSync } from "node:zlib";
import { pathToFileURL } from "node:url";
import { Chess } from "chess.js";
import { walkLocalBook } from "../../src/chess/opening-book.ts";
import { decodeBook } from "../../src/chess/opening-book-format.ts";
import { linesOf, readGames, sanTokens } from "./pgn.mjs";

function flag(argv, name) {
  const at = argv.indexOf(name);
  return at >= 0 ? argv[at + 1] : null;
}

export function loadBook(path) {
  const bytes = readFileSync(path);
  return decodeBook(path.endsWith(".gz") ? gunzipSync(bytes) : bytes);
}

export function uciLine(movetext, limit = 120) {
  const board = new Chess();
  const ucis = [];
  for (const san of sanTokens(movetext, limit)) {
    try {
      const move = board.move(san);
      ucis.push(move.from + move.to + (move.promotion ?? ""));
    } catch {
      break;
    }
  }
  return ucis;
}

/**
 * Asks the explorer route until it answers COMPLETELY (`partial: false`): the
 * route caps its walk by time and returns a shorter book as partial, which must
 * never be compared as if it were the real length. Retries are bounded; returns
 * { plies, retries, status } where status is "complete", "partial" (retries
 * exhausted, plies null) or "unavailable".
 */
export async function explorerPlies(url, ucis, { retries = 5, delayMs = 2000, fetchImpl = fetch, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
  let status = "unavailable";
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt > 0) {
      await sleep(delayMs);
    }
    try {
      const response = await fetchImpl(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ moves: ucis }) });
      const payload = await response.json();
      if (payload.available === true && payload.partial === false) {
        return { plies: payload.plies, retries: attempt, status: "complete" };
      }
      status = payload.available === true ? "partial" : "unavailable";
    } catch {
      status = "unavailable";
    }
  }
  return { plies: null, retries, status };
}

async function main() {
  const argv = process.argv.slice(2);
  const file = argv.find((arg, i) => !arg.startsWith("--") && !(argv[i - 1] ?? "").startsWith("--"));
  if (!file) {
    throw new Error("usage: node scripts/opening-book/inspect-book.mjs <book.bin.gz> [--pgn games.pgn] [--explorer URL] [--max-games N] [--retries 5] [--retry-delay 2000]");
  }
  const book = loadBook(file);
  console.log(`positions ${book.keyCount}, moves ${book.entryCount}, max ply ${book.maxPly}`);
  const pgn = flag(argv, "--pgn");
  if (!pgn) {
    return;
  }
  const explorer = flag(argv, "--explorer");
  const maxGames = Number(flag(argv, "--max-games") ?? 20);
  let games = 0;
  let same = 0;
  let compared = 0;
  const retries = Number(flag(argv, "--retries") ?? 5);
  const delayMs = Number(flag(argv, "--retry-delay") ?? 2000);
  let totalRetries = 0;
  console.log("game\tlocal\texplorer\tretries");
  for await (const game of readGames(linesOf(createReadStream(pgn)))) {
    if (games >= maxGames) {
      break;
    }
    games += 1;
    const ucis = uciLine(game.movetext);
    const local = walkLocalBook(book, new Chess().fen(), ucis).plies;
    const remote = explorer ? await explorerPlies(explorer, ucis, { retries, delayMs }) : null;
    if (remote?.status === "complete") {
      compared += 1;
      same += remote.plies === local ? 1 : 0;
    }
    totalRetries += remote?.retries ?? 0;
    const shown = remote ? (remote.status === "complete" ? remote.plies : `${remote.status} (not compared)`) : "-";
    console.log(`${game.headers.White ?? "?"}-${game.headers.Black ?? "?"}\t${local}\t${shown}\t${remote?.retries ?? "-"}`);
  }
  if (explorer) {
    console.log(`identical on ${same} of ${compared} compared games (${totalRetries} retries in total; games without a complete answer are not compared)`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
