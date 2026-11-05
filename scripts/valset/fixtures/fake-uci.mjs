#!/usr/bin/env node
// SIG-1221: a scripted stand-in for a UCI engine, used to test the client and the
// ground-truth plumbing without a Stockfish binary. It ignores the position and
// answers with fixed lines (a lower-bound line first, to prove those are skipped).
import { createInterface } from "node:readline";

let multipv = 1;
let fen = "";
const out = (line) => process.stdout.write(`${line}\n`);

createInterface({ input: process.stdin }).on("line", (line) => {
  const [command, ...rest] = line.trim().split(/\s+/);
  if (command === "uci") {
    out("id name FakeFish 1.0");
    out("id author test");
    out("uciok");
  } else if (command === "isready") {
    out("readyok");
  } else if (command === "setoption") {
    if (rest[1] === "MultiPV") multipv = Number(rest[3]);
  } else if (command === "position") {
    fen = rest.slice(1).join(" ");
  } else if (command === "go") {
    if (fen.startsWith("MATED")) {
      out("info depth 0 score mate 0");
      out("bestmove (none)");
      return;
    }
    const searchmoves = rest.includes("searchmoves") ? rest.slice(rest.indexOf("searchmoves") + 1) : null;
    out("info depth 1 multipv 1 score cp 10 pv e2e4");
    out("info depth 2 multipv 1 score cp 99 lowerbound pv e2e4");
    if (searchmoves) {
      out(`info depth 2 multipv 1 score cp -40 pv ${searchmoves[0]} e7e5`);
      out(`bestmove ${searchmoves[0]}`);
      return;
    }
    out("info depth 2 multipv 1 score cp 30 pv e2e4 e7e5");
    if (multipv >= 2) out("info depth 2 multipv 2 score cp 20 pv d2d4 d7d5");
    if (multipv >= 3) out("info depth 2 multipv 3 score mate 3 pv g1f3 g8f6");
    out("bestmove e2e4 ponder e7e5");
  } else if (command === "quit") {
    process.exit(0);
  }
});
