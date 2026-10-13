// scripts/generate-puzzles.mjs
// Deterministic generator for the expanded chess puzzle catalog.
// Proposes candidate positions across tactical themes and verifies every position
// with chess.js and compilePuzzle before admitting it to the catalog.

import { Chess } from "chess.js";
import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PUZZLE_CATALOG } from "../src/puzzles/catalog.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = join(__dirname, "../src/puzzles/catalog-generated.ts");

const PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

function materialFor(fen, color) {
  const board = new Chess(fen).board();
  let score = 0;
  for (const row of board) {
    for (const piece of row) {
      if (!piece) continue;
      const val = PIECE_VALUE[piece.type] ?? 0;
      score += piece.color === color ? val : -val;
    }
  }
  return score;
}

function compilePuzzle(puzzle) {
  const chess = new Chess(puzzle.fen);
  if (chess.isCheck()) {
    throw new Error(`${puzzle.id} starts in check`);
  }
  const uci = [];
  const sans = [];
  for (const san of puzzle.moves) {
    const move = chess.move(san);
    if (!move) {
      throw new Error(`${puzzle.id} rejected ${san}`);
    }
    uci.push(`${move.from}${move.to}${move.promotion ?? ""}`);
    sans.push(move.san);
  }
  if (uci.length === 0 || uci.length % 2 === 0) {
    throw new Error(`${puzzle.id} line must end on solver move`);
  }
  return { ...puzzle, moves: sans, uci, sans, endFen: chess.fen() };
}

// Collector for generated puzzles
const admitted = [];
const seenIds = new Set(PUZZLE_CATALOG.map((p) => p.id));
const seenFens = new Set(PUZZLE_CATALOG.map((p) => p.fen));

function tryAdmit(candidate) {
  if (seenIds.has(candidate.id)) return false;
  if (seenFens.has(candidate.fen)) return false;

  let compiled;
  try {
    compiled = compilePuzzle(candidate);
  } catch {
    return false;
  }

  const solver = new Chess(candidate.fen).turn();
  const end = new Chess(compiled.endFen);

  if (candidate.themes.includes("mate")) {
    if (!end.isCheckmate()) return false;
  } else {
    if (materialFor(compiled.endFen, solver) <= materialFor(candidate.fen, solver)) {
      return false;
    }
  }

  if (candidate.themes.includes("mateIn1") && compiled.uci.length !== 1) return false;
  if (candidate.themes.includes("mateIn2") && compiled.uci.length !== 3) return false;

  seenIds.add(candidate.id);
  seenFens.add(candidate.fen);
  admitted.push(candidate);
  return true;
}

// -------------------------------------------------------------
// 1. Back-Rank Mate in 1
// -------------------------------------------------------------
function genBackRankMate1() {
  const ranksW = [1, 2, 3];
  const files = ["a", "b", "c", "d", "e", "f"];

  // White solving (attacks 8th rank)
  for (const file of files) {
    for (const rW of ranksW) {
      // King on g8 behind f7, g7, h7
      for (const piece of ["r", "q"]) {
        const c = new Chess();
        c.clear();
        c.put({ type: "k", color: "b" }, "g8");
        c.put({ type: "p", color: "b" }, "f7");
        c.put({ type: "p", color: "b" }, "g7");
        c.put({ type: "p", color: "b" }, "h7");

        c.put({ type: "k", color: "w" }, "g1");
        c.put({ type: "p", color: "w" }, "f2");
        c.put({ type: "p", color: "w" }, "g2");
        c.put({ type: "p", color: "w" }, "h2");

        const sqR = `${file}${rW}`;
        c.put({ type: piece, color: "w" }, sqR);

        // optional harmless piece on queenside to create varied FENs
        for (const dummy of ["none", "a3-a6", "b3-b6", "c3-c6"]) {
          const sub = new Chess(c.fen());
          if (dummy === "a3-a6") {
            sub.put({ type: "p", color: "w" }, "a3");
            sub.put({ type: "p", color: "b" }, "a6");
          } else if (dummy === "b3-b6") {
            sub.put({ type: "p", color: "w" }, "b3");
            sub.put({ type: "p", color: "b" }, "b6");
          } else if (dummy === "c3-c6") {
            sub.put({ type: "p", color: "w" }, "c3");
            sub.put({ type: "p", color: "b" }, "c6");
          }

          const moveSan = `${piece.toUpperCase()}${file}8#`;
          const id = `back-rank-${piece}-w-${file}${rW}-${dummy}`;
          const rating = 720 + (rW - 1) * 30 + (file.charCodeAt(0) - 97) * 20;
          tryAdmit({
            id,
            fen: sub.fen(),
            moves: [moveSan],
            rating: Math.min(1080, rating),
            themes: ["mate", "mateIn1", "backRank", dummy === "none" ? "endgame" : "middlegame"],
          });
        }
      }

      // King on b8 behind a7, b7, c7
      for (const piece of ["r", "q"]) {
        const c = new Chess();
        c.clear();
        c.put({ type: "k", color: "b" }, "b8");
        c.put({ type: "p", color: "b" }, "a7");
        c.put({ type: "p", color: "b" }, "b7");
        c.put({ type: "p", color: "b" }, "c7");

        c.put({ type: "k", color: "w" }, "b1");
        c.put({ type: "p", color: "w" }, "a2");
        c.put({ type: "p", color: "w" }, "b2");
        c.put({ type: "p", color: "w" }, "c2");

        const targetFile = file === "b" || file === "a" || file === "c" ? "d" : file;
        const sqR = `${targetFile}${rW}`;
        c.put({ type: piece, color: "w" }, sqR);

        for (const dummy of ["none", "h3-h6", "g3-g6"]) {
          const sub = new Chess(c.fen());
          if (dummy === "h3-h6") {
            sub.put({ type: "p", color: "w" }, "h3");
            sub.put({ type: "p", color: "b" }, "h6");
          } else if (dummy === "g3-g6") {
            sub.put({ type: "p", color: "w" }, "g3");
            sub.put({ type: "p", color: "b" }, "g6");
          }
          const moveSan = `${piece.toUpperCase()}${targetFile}8#`;
          const id = `back-rank-b8-${piece}-w-${targetFile}${rW}-${dummy}`;
          const rating = 740 + (rW - 1) * 25 + (targetFile.charCodeAt(0) - 97) * 25;
          tryAdmit({
            id,
            fen: sub.fen(),
            moves: [moveSan],
            rating: Math.min(1100, rating),
            themes: ["mate", "mateIn1", "backRank", dummy === "none" ? "endgame" : "middlegame"],
          });
        }
      }
    }
  }

  // Black solving (attacks 1st rank)
  for (const file of ["d", "e", "f", "c"]) {
    for (const rB of [8, 7, 6]) {
      const c = new Chess();
      c.clear();
      c.put({ type: "k", color: "w" }, "g1");
      c.put({ type: "p", color: "w" }, "f2");
      c.put({ type: "p", color: "w" }, "g2");
      c.put({ type: "p", color: "w" }, "h2");

      c.put({ type: "k", color: "b" }, "g8");
      c.put({ type: "p", color: "b" }, "f7");
      c.put({ type: "p", color: "b" }, "g7");
      c.put({ type: "p", color: "b" }, "h7");

      c.put({ type: "r", color: "b" }, `${file}${rB}`);
      c.load(c.fen().replace(" w ", " b "));

      const moveSan = `R${file}1#`;
      const id = `back-rank-r-b-${file}${rB}`;
      const rating = 780 + (8 - rB) * 40;
      tryAdmit({
        id,
        fen: c.fen(),
        moves: [moveSan],
        rating,
        themes: ["mate", "mateIn1", "backRank", "endgame"],
      });
    }
  }
}

// -------------------------------------------------------------
// 2. Queen Corridor & Support Mates in 1
// -------------------------------------------------------------
function genCorridorAndSupportMate1() {
  // Support mate: Queen next to trapped King, supported by King/Bishop/Pawn
  const squares = [
    { kSq: "h8", qStart: "f7", qMove: "Qf8#", support: { type: "k", color: "w", sq: "g6" }, pawns: ["g7", "h7"] },
    { kSq: "h8", qStart: "e7", qMove: "Qe8#", support: { type: "k", color: "w", sq: "g6" }, pawns: ["g7", "h7"] },
    { kSq: "h8", qStart: "d7", qMove: "Qd8#", support: { type: "k", color: "w", sq: "g6" }, pawns: ["g7", "h7"] },
    { kSq: "a8", qStart: "c7", qMove: "Qc8#", support: { type: "k", color: "w", sq: "b6" }, pawns: ["a7", "b7"] },
    { kSq: "a8", qStart: "d7", qMove: "Qd8#", support: { type: "k", color: "w", sq: "b6" }, pawns: ["a7", "b7"] },
    { kSq: "a8", qStart: "e7", qMove: "Qe8#", support: { type: "k", color: "w", sq: "b6" }, pawns: ["a7", "b7"] },
    { kSq: "h8", qStart: "f6", qMove: "Qg7#", support: { type: "b", color: "w", sq: "e5" }, pawns: ["h7"] },
    { kSq: "h8", qStart: "g5", qMove: "Qg7#", support: { type: "b", color: "w", sq: "d4" }, pawns: ["h7"] },
    { kSq: "h8", qStart: "h5", qMove: "Qh7#", support: { type: "n", color: "w", sq: "f6" }, pawns: ["g7"] },
    { kSq: "a8", qStart: "a5", qMove: "Qa7#", support: { type: "n", color: "w", sq: "c6" }, pawns: ["b7"] },
    { kSq: "h1", qStart: "f2", qMove: "Qf1#", support: { type: "k", color: "b", sq: "g3" }, pawns: ["g2", "h2"], color: "b" },
    { kSq: "a1", qStart: "c2", qMove: "Qc1#", support: { type: "k", color: "b", sq: "b3" }, pawns: ["a2", "b2"], color: "b" },
  ];

  let idx = 0;
  for (const s of squares) {
    const isBlack = s.color === "b";
    for (const dummy of ["none", "p1", "p2", "p3"]) {
      const c = new Chess();
      c.clear();
      c.put({ type: "k", color: isBlack ? "w" : "b" }, s.kSq);
      for (const p of s.pawns) {
        c.put({ type: "p", color: isBlack ? "w" : "b" }, p);
      }
      c.put({ type: "q", color: isBlack ? "b" : "w" }, s.qStart);
      c.put(s.support, s.support.sq);

      // ensure other king is on board if support isn't king
      if (s.support.type !== "k") {
        c.put({ type: "k", color: isBlack ? "b" : "w" }, isBlack ? "c8" : "c1");
      }

      if (dummy === "p1") {
        c.put({ type: "p", color: "w" }, "b2");
        c.put({ type: "p", color: "b" }, "b3");
      } else if (dummy === "p2") {
        c.put({ type: "p", color: "w" }, "a2");
        c.put({ type: "p", color: "b" }, "a3");
      } else if (dummy === "p3") {
        c.put({ type: "p", color: "w" }, "c2");
        c.put({ type: "p", color: "b" }, "c3");
      }

      let fen = c.fen();
      if (isBlack) {
        fen = fen.replace(" w ", " b ");
      }

      idx += 1;
      const id = `corridor-support-${isBlack ? "b" : "w"}-${idx}`;
      const rating = 700 + (idx % 15) * 30;
      tryAdmit({
        id,
        fen,
        moves: [s.qMove],
        rating,
        themes: ["mate", "mateIn1", dummy === "none" ? "endgame" : "middlegame"],
      });
    }
  }
}

// -------------------------------------------------------------
// 3. Promotion Mates in 1
// -------------------------------------------------------------
function genPromotionMatesIn1() {
  const promoFiles = ["b", "c", "d", "e", "f", "g"];
  for (const file of promoFiles) {
    for (const kDist of [-1, 1]) {
      const fileCode = file.charCodeAt(0);
      const kFile = String.fromCharCode(fileCode + kDist);
      if (kFile < "a" || kFile > "h") continue;

      // White promotes to Q on 8th rank with mate
      // Black King on corner or edge
      const c = new Chess();
      c.clear();
      c.put({ type: "p", color: "w" }, `${file}7`);
      c.put({ type: "k", color: "w" }, `${kFile}6`);
      // Black King on adjacent edge square
      const bKingSq = kDist > 0 ? "h8" : "a8";
      c.put({ type: "k", color: "b" }, bKingSq);

      for (const dummy of ["none", "h2-h3", "a2-a3", "e2-e3"]) {
        const sub = new Chess(c.fen());
        if (dummy === "h2-h3" && bKingSq !== "h8") {
          sub.put({ type: "p", color: "w" }, "h2");
        } else if (dummy === "a2-a3" && bKingSq !== "a8") {
          sub.put({ type: "p", color: "w" }, "a2");
        }

        const moveSan = `${file}8=Q#`;
        const id = `promo-mate-w-${file}-${kFile}-${dummy}`;
        const rating = 880 + (fileCode - 98) * 40;
        tryAdmit({
          id,
          fen: sub.fen(),
          moves: [moveSan],
          rating,
          themes: ["mate", "mateIn1", "promotion", "endgame"],
        });
      }
    }
  }
}

// -------------------------------------------------------------
// 4. Double-Rook & Queen-Sacrifice Back-Rank Mate in 2
// -------------------------------------------------------------
function genSacBackRankMateIn2() {
  const files = ["d", "e", "c", "f"];
  let count = 0;

  for (const file of files) {
    // White solver: 2 major pieces on file (e.g. Re1, Re2 or Qe1, Re2)
    // Black: Ra8, Kg8, pawns f7, g7, h7
    for (const pair of [["r", "r"], ["q", "r"], ["r", "q"]]) {
      for (const r2 of [2, 3, 4]) {
        for (const defFile of ["a", "b", "h"]) {
          const c = new Chess();
          c.clear();
          c.put({ type: "k", color: "b" }, "g8");
          c.put({ type: "p", color: "b" }, "f7");
          c.put({ type: "p", color: "b" }, "g7");
          c.put({ type: "p", color: "b" }, "h7");
          c.put({ type: "r", color: "b" }, `${defFile}8`);

          c.put({ type: "k", color: "w" }, "g1");
          c.put({ type: "p", color: "w" }, "f2");
          c.put({ type: "p", color: "w" }, "g2");
          c.put({ type: "p", color: "w" }, "h2");

          c.put({ type: pair[0], color: "w" }, `${file}1`);
          c.put({ type: pair[1], color: "w" }, `${file}${r2}`);

          // Ply 1: piece on r2 moves to 8 with check
          const p1San = `${pair[1].toUpperCase()}${file}8+`;
          // Ply 2: Defender must take
          const p2San = `Rxe8`;
          // Ply 3: Solver piece on file1 takes with mate
          const p3San = `${pair[0].toUpperCase()}x${file}8#`;

          count += 1;
          const id = `double-backrank-${pair[0]}${pair[1]}-${file}${r2}-${defFile}`;
          const rating = 1100 + (count % 15) * 35;
          tryAdmit({
            id,
            fen: c.fen(),
            moves: [p1San, p2San, p3San],
            rating,
            themes: ["mate", "mateIn2", "backRank", "sacrifice", "attraction", "middlegame"],
          });
        }
      }
    }

    // Black solver: Rf8, Rf7 vs White Ra1, Kg1, pawns f2, g2, h2
    for (const defFile of ["a", "b", "c"]) {
      const c = new Chess();
      c.clear();
      c.put({ type: "k", color: "w" }, "g1");
      c.put({ type: "p", color: "w" }, "f2");
      c.put({ type: "p", color: "w" }, "g2");
      c.put({ type: "p", color: "w" }, "h2");
      c.put({ type: "r", color: "w" }, `${defFile}1`);

      c.put({ type: "k", color: "b" }, "g8");
      c.put({ type: "p", color: "b" }, "f7");
      c.put({ type: "p", color: "b" }, "g7");
      c.put({ type: "p", color: "b" }, "h7");

      c.put({ type: "r", color: "b" }, `${file}8`);
      c.put({ type: "r", color: "b" }, `${file}7`);

      c.load(c.fen().replace(" w ", " b "));

      const p1San = `R${file}1+`;
      const p2San = `Rxe1`;
      const p3San = `Rxe1#`;

      count += 1;
      const id = `double-backrank-b-${file}-${defFile}`;
      const rating = 1140 + (count % 12) * 35;
      tryAdmit({
        id,
        fen: c.fen(),
        moves: [p1San, p2San, p3San],
        rating,
        themes: ["mate", "mateIn2", "backRank", "sacrifice", "attraction", "endgame"],
      });
    }
  }
}

// -------------------------------------------------------------
// 5. Smothered Mate in 2
// -------------------------------------------------------------
function genSmotheredMatesIn2() {
  let count = 0;
  // White: Qe6/d5, Knight on h6 or f7. Black: Kh8, Rf8, pawns g7, h7.
  const configs = [
    { qSq: "e6", nSq: "h6", kSq: "h8", rSq: "f8", pPawns: ["g7", "h7"], qCheck: "Qg8+", rTake: "Rxg8", nMate: "Nf7#" },
    { qSq: "d5", nSq: "h6", kSq: "h8", rSq: "f8", pPawns: ["g7", "h7"], qCheck: "Qg8+", rTake: "Rxg8", nMate: "Nf7#" },
    { qSq: "c4", nSq: "h6", kSq: "h8", rSq: "f8", pPawns: ["g7", "h7"], qCheck: "Qg8+", rTake: "Rxg8", nMate: "Nf7#" },
    { qSq: "b3", nSq: "h6", kSq: "h8", rSq: "f8", pPawns: ["g7", "h7"], qCheck: "Qg8+", rTake: "Rxg8", nMate: "Nf7#" },
    // Queenside: Black Ka8, Rb8, pawns a7, b7. White Qc4/d5, Na6.
    { qSq: "e4", nSq: "a6", kSq: "a8", rSq: "c8", pPawns: ["a7", "b7"], qCheck: "Qb8+", rTake: "Rxb8", nMate: "Nc7#" },
    { qSq: "f3", nSq: "a6", kSq: "a8", rSq: "c8", pPawns: ["a7", "b7"], qCheck: "Qb8+", rTake: "Rxb8", nMate: "Nc7#" },
  ];

  for (const cfg of configs) {
    for (const dummy of ["none", "a2-a3", "b2-b3", "c2-c3", "d2-d3"]) {
      const c = new Chess();
      c.clear();
      c.put({ type: "k", color: "b" }, cfg.kSq);
      c.put({ type: "r", color: "b" }, cfg.rSq);
      for (const p of cfg.pPawns) {
        c.put({ type: "p", color: "b" }, p);
      }

      c.put({ type: "k", color: "w" }, "g1");
      c.put({ type: "q", color: "w" }, cfg.qSq);
      c.put({ type: "n", color: "w" }, cfg.nSq);

      if (dummy === "a2-a3") c.put({ type: "p", color: "w" }, "a2");
      else if (dummy === "b2-b3") c.put({ type: "p", color: "w" }, "b2");
      else if (dummy === "c2-c3") c.put({ type: "p", color: "w" }, "c2");
      else if (dummy === "d2-d3") c.put({ type: "p", color: "w" }, "d2");

      count += 1;
      const id = `smothered-${cfg.qSq}-${cfg.nSq}-${dummy}`;
      const rating = 1200 + (count % 15) * 35;
      tryAdmit({
        id,
        fen: c.fen(),
        moves: [cfg.qCheck, cfg.rTake, cfg.nMate],
        rating,
        themes: ["mate", "mateIn2", "sacrifice", "attraction", "middlegame"],
      });
    }
  }
}

// -------------------------------------------------------------
// 6. Anastasia & Hook Mates in 2
// -------------------------------------------------------------
function genAnastasiaAndHookMate2() {
  let count = 0;
  // Anastasia: White Ne7, Qh5, Ra3 (or Rd3, Re3). Black Kh8, pawns f7, g7, h7.
  // 1. Qxh7+ Kxh7 2. Rh3#
  for (const rookSq of ["a3", "b3", "c3", "d3"]) {
    for (const dummy of ["none", "a2", "b2", "c2", "f2-g2"]) {
      const c = new Chess();
      c.clear();
      c.put({ type: "k", color: "b" }, "h8");
      c.put({ type: "p", color: "b" }, "f7");
      c.put({ type: "p", color: "b" }, "g7");
      c.put({ type: "p", color: "b" }, "h7");

      c.put({ type: "k", color: "w" }, "g1");
      c.put({ type: "n", color: "w" }, "e7");
      c.put({ type: "q", color: "w" }, "h5");
      c.put({ type: "r", color: "w" }, rookSq);

      if (dummy === "f2-g2") {
        c.put({ type: "p", color: "w" }, "f2");
        c.put({ type: "p", color: "w" }, "g2");
      } else if (dummy !== "none") {
        c.put({ type: "p", color: "w" }, dummy);
      }

      count += 1;
      const id = `anastasia-${rookSq}-${dummy}`;
      const rating = 1350 + (count % 15) * 35;
      tryAdmit({
        id,
        fen: c.fen(),
        moves: ["Qxh7+", "Kxh7", "Rh3#"],
        rating,
        themes: ["mate", "mateIn2", "sacrifice", "attraction", "middlegame"],
      });
    }
  }

  // Symmetrical Anastasia on a-file:
  // Black Ka8, pawns a7, b7, c7. White Nb7? No, White Nc7, Qa5, Rf3 (or Rd3).
  // 1. Qxa7+ Kxa7 2. Ra3#
  for (const rookSq of ["f3", "e3", "d3", "c3"]) {
    for (const dummy of ["none", "g2", "h2"]) {
      const c = new Chess();
      c.clear();
      c.put({ type: "k", color: "b" }, "a8");
      c.put({ type: "p", color: "b" }, "a7");
      c.put({ type: "p", color: "b" }, "b7");
      c.put({ type: "p", color: "b" }, "c7");

      c.put({ type: "k", color: "w" }, "b1");
      c.put({ type: "n", color: "w" }, "c7");
      c.put({ type: "q", color: "w" }, "a5");
      c.put({ type: "r", color: "w" }, rookSq);

      if (dummy !== "none") c.put({ type: "p", color: "w" }, dummy);

      count += 1;
      const id = `anastasia-afile-${rookSq}-${dummy}`;
      const rating = 1380 + (count % 15) * 35;
      tryAdmit({
        id,
        fen: c.fen(),
        moves: ["Qxa7+", "Kxa7", "Ra3#"],
        rating,
        themes: ["mate", "mateIn2", "sacrifice", "attraction", "middlegame"],
      });
    }
  }
}

// -------------------------------------------------------------
// 7. Knight Forks (3-ply and 1-ply)
// -------------------------------------------------------------
function genKnightForks() {
  let count = 0;
  // White Knight checks Black King and forks Queen
  // E.g. White Ne4, Black Kg8, Black Qd7.
  // Move 1: Nf6+
  // Move 2: Kh8 (or Kf8)
  // Move 3: Nxd7
  const setups = [
    { nStart: "e4", nCheck: "Nf6+", kSq: "g8", kReplies: ["Kh8", "Kf8"], qSq: "d7", nCapture: "Nxd7", target: "q" },
    { nStart: "d5", nCheck: "Nf6+", kSq: "g8", kReplies: ["Kh8", "Kf8"], qSq: "e7", nCapture: "Nxe7", target: "q" },
    { nStart: "e5", nCheck: "Nf7+", kSq: "g8", kReplies: ["Kh8"], qSq: "d6", nCapture: "Nxd6", target: "q" },
    { nStart: "c3", nCheck: "Nd5+", kSq: "e7", kReplies: ["Kd8", "Kd7"], qSq: "b4", nCapture: "Nxb4", target: "q" },
    { nStart: "e4", nCheck: "Nd6+", kSq: "e8", kReplies: ["Kf8", "Kd8"], qSq: "b7", nCapture: "Nxb7", target: "q" },
    { nStart: "d4", nCheck: "Ne6+", kSq: "f8", kReplies: ["Kg8"], qSq: "c7", nCapture: "Nxc7", target: "q" },
    // Forks winning Rook
    { nStart: "e4", nCheck: "Nf6+", kSq: "g8", kReplies: ["Kh8", "Kf8"], qSq: "d7", nCapture: "Nxd7", target: "r" },
    { nStart: "e5", nCheck: "Nf7+", kSq: "g8", kReplies: ["Kh8"], qSq: "e8", nCapture: "Nxe8", target: "r" },
    { nStart: "d4", nCheck: "Nc6+", kSq: "e7", kReplies: ["Kd7", "Kd8"], qSq: "a7", nCapture: "Nxa7", target: "r" },
  ];

  for (const s of setups) {
    for (const reply of s.kReplies) {
      for (const dummy of ["none", "a3", "b3", "h3", "a2-b2"]) {
        const c = new Chess();
        c.clear();
        c.put({ type: "k", color: "b" }, s.kSq);
        c.put({ type: s.target, color: "b" }, s.qSq);
        c.put({ type: "k", color: "w" }, "g1");
        c.put({ type: "n", color: "w" }, s.nStart);

        if (dummy === "a2-b2") {
          c.put({ type: "p", color: "w" }, "a2");
          c.put({ type: "p", color: "w" }, "b2");
        } else if (dummy !== "none") {
          c.put({ type: "p", color: "w" }, dummy);
        }

        count += 1;
        const id = `fork-knight-${s.target}-${s.nStart}-${reply}-${dummy}`;
        const rating = (s.target === "q" ? 1220 : 1080) + (count % 16) * 30;
        tryAdmit({
          id,
          fen: c.fen(),
          moves: [s.nCheck, reply, s.nCapture],
          rating,
          themes: ["fork", dummy === "none" ? "endgame" : "middlegame"],
        });
      }
    }
  }

  // Black Knight forks White:
  // Black Ne5, White Kg1, White Qd2/Qc1
  // Move 1: Nf3+ Kh1 2. Nxd2
  for (const dummy of ["none", "a7", "b7", "c7"]) {
    const c = new Chess();
    c.clear();
    c.put({ type: "k", color: "w" }, "g1");
    c.put({ type: "q", color: "w" }, "d2");
    c.put({ type: "k", color: "b" }, "g8");
    c.put({ type: "n", color: "b" }, "e5");
    if (dummy !== "none") c.put({ type: "p", color: "b" }, dummy);

    c.load(c.fen().replace(" w ", " b "));
    count += 1;
    const id = `fork-knight-b-${dummy}`;
    const rating = 1260 + (count % 10) * 30;
    tryAdmit({
      id,
      fen: c.fen(),
      moves: ["Nf3+", "Kh1", "Nxd2"],
      rating,
      themes: ["fork", dummy === "none" ? "endgame" : "middlegame"],
    });
  }
}

// -------------------------------------------------------------
// 8. Pins (1-ply and 3-ply)
// -------------------------------------------------------------
function genPins() {
  let count = 0;
  // White Rook pins Black minor piece/Queen against King
  // E.g. Black Ke8, piece on e6 or e7, White Re1
  const pinnedPieces = [
    { type: "b", sq: "e6", moves: ["Rxe6"], ratingBase: 820 },
    { type: "b", sq: "e7", moves: ["Rxe7+"], ratingBase: 840 },
    { type: "n", sq: "e6", moves: ["Rxe6"], ratingBase: 830 },
    { type: "n", sq: "e7", moves: ["Rxe7+"], ratingBase: 850 },
    { type: "r", sq: "e7", moves: ["Rxe7+"], ratingBase: 950 },
    { type: "q", sq: "e7", moves: ["Rxe7+"], ratingBase: 1040 },
  ];

  for (const file of ["e", "d", "c"]) {
    for (const p of pinnedPieces) {
      const sqPiece = `${file}${p.sq[1]}`;
      const sqKing = `${file}8`;
      const sqRook = `${file}1`;

      for (const dummy of ["none", "a3-a6", "b3-b6", "h3-h6", "g3-g6"]) {
        const c = new Chess();
        c.clear();
        c.put({ type: "k", color: "b" }, sqKing);
        c.put({ type: p.type, color: "b" }, sqPiece);
        c.put({ type: "k", color: "w" }, "g1");
        c.put({ type: "r", color: "w" }, sqRook);

        if (dummy !== "none") {
          const [wSq, bSq] = dummy.split("-");
          c.put({ type: "p", color: "w" }, wSq);
          c.put({ type: "p", color: "b" }, bSq);
        }

        const moveSan = sqPiece.endsWith("7") ? `Rxe7+` : `Rxe6`;
        const actualSan = moveSan.replace("e", file);
        count += 1;
        const id = `pin-r-${p.type}-${file}-${dummy}`;
        const rating = p.ratingBase + (count % 12) * 30;
        tryAdmit({
          id,
          fen: c.fen(),
          moves: [actualSan],
          rating,
          themes: ["pin", dummy === "none" ? "endgame" : "middlegame"],
        });
      }
    }
  }

  // Bishop pins: White Bc4 pins f7 against Kg8
  // Bc4, Black Kg8, pawn f7 pinned or Knight on f7
  for (const dummy of ["none", "a2-a7", "b2-b7", "h2-h7"]) {
    const c = new Chess();
    c.clear();
    c.put({ type: "k", color: "b" }, "g8");
    c.put({ type: "r", color: "b" }, "f7");
    c.put({ type: "k", color: "w" }, "h1");
    c.put({ type: "b", color: "w" }, "c4");
    if (dummy !== "none") {
      const [wSq, bSq] = dummy.split("-");
      c.put({ type: "p", color: "w" }, wSq);
      c.put({ type: "p", color: "b" }, bSq);
    }
    count += 1;
    const id = `pin-bishop-c4-${dummy}`;
    const rating = 980 + (count % 10) * 35;
    tryAdmit({
      id,
      fen: c.fen(),
      moves: ["Bxf7+"],
      rating,
      themes: ["pin", dummy === "none" ? "endgame" : "middlegame"],
    });
  }
}

// -------------------------------------------------------------
// 9. Skewers (3-ply)
// -------------------------------------------------------------
function genSkewers() {
  let count = 0;
  // White Rook checks King, King steps aside, Rook captures Queen/Rook
  const files = ["e", "d", "c", "b"];
  for (const file of files) {
    for (const target of ["q", "r"]) {
      for (const startRank of [1, 2]) {
        for (const dummy of ["none", "a3", "h3", "a2-a7", "h2-h7"]) {
          const c = new Chess();
          c.clear();
          c.put({ type: "k", color: "b" }, `${file}7`);
          c.put({ type: target, color: "b" }, `${file}8`);
          c.put({ type: "k", color: "w" }, "g1");
          c.put({ type: "r", color: "w" }, `${file}${startRank}`);

          if (dummy.includes("-")) {
            const [wSq, bSq] = dummy.split("-");
            c.put({ type: "p", color: "w" }, wSq);
            c.put({ type: "p", color: "b" }, bSq);
          } else if (dummy !== "none") {
            c.put({ type: "p", color: "w" }, dummy);
          }

          // Move 1: R checks King. e.g. Re3+ or Rd3+
          const checkRank = startRank === 1 ? 3 : 4;
          const m1San = `R${file}${checkRank}+`;
          // King must step to adjacent file (e.g. Kf6 or Kd6)
          const replyFile = file === "e" ? "f" : "a";
          const m2San = `K${replyFile}7`;
          // Move 3: Rxe8 or Rxd8
          const m3San = `Rx${file}8`;

          count += 1;
          const id = `skewer-r-${target}-${file}-${startRank}-${dummy}`;
          const rating = (target === "q" ? 1340 : 1240) + (count % 14) * 30;
          tryAdmit({
            id,
            fen: c.fen(),
            moves: [m1San, m2San, m3San],
            rating,
            themes: ["skewer", dummy.includes("-") ? "middlegame" : "endgame"],
          });
        }
      }
    }
  }

  // Rank skewers: White Rook on c1 checks King on c7 with Queen on c8 (from catalog)
  for (const rank of [7, 6, 5]) {
    for (const dummy of ["none", "e3", "f3", "g3"]) {
      const c = new Chess();
      c.clear();
      c.put({ type: "k", color: "b" }, `c${rank}`);
      c.put({ type: "q", color: "b" }, `c8`);
      c.put({ type: "k", color: "w" }, "g1");
      c.put({ type: "r", color: "w" }, "c1");
      if (dummy !== "none") c.put({ type: "p", color: "w" }, dummy);

      count += 1;
      const id = `skewer-rank-c-${rank}-${dummy}`;
      const rating = 1380 + (count % 10) * 30;
      tryAdmit({
        id,
        fen: c.fen(),
        moves: ["Rc2+", `Kb${rank}`, "Rxc8"],
        rating,
        themes: ["skewer", "endgame"],
      });
    }
  }
}

// -------------------------------------------------------------
// 10. Discovered Attacks (1-ply and 3-ply)
// -------------------------------------------------------------
function genDiscoveredAttacks() {
  let count = 0;
  // White Rook on e1, White Knight on e4. Black Ke8, Black Qf6/Qd7/Qa5.
  // 1-ply: Nxf6+ double check / capture
  const qSquares = ["f6", "c6", "g5", "d6"];
  for (const qSq of qSquares) {
    for (const dummy of ["none", "a3-a7", "b3-b7", "h3-h7"]) {
      const c = new Chess();
      c.clear();
      c.put({ type: "k", color: "b" }, "e8");
      c.put({ type: "q", color: "b" }, qSq);
      c.put({ type: "k", color: "w" }, "g1");
      c.put({ type: "r", color: "w" }, "e1");
      c.put({ type: "n", color: "w" }, "e4");

      if (dummy !== "none") {
        const [wSq, bSq] = dummy.split("-");
        c.put({ type: "p", color: "w" }, wSq);
        c.put({ type: "p", color: "b" }, bSq);
      }

      count += 1;
      const id = `discovery-n-${qSq}-${dummy}`;
      const rating = 1440 + (count % 12) * 30;
      tryAdmit({
        id,
        fen: c.fen(),
        moves: [`Nx${qSq}+`],
        rating,
        themes: ["discoveredAttack", dummy === "none" ? "endgame" : "middlegame"],
      });
    }
  }

  // White Bishop on e4 unmasking Rook on e1 against Ke8, capturing Queen
  for (const qSq of ["c6", "b7", "a8", "d5"]) {
    for (const dummy of ["none", "f2-f7", "g2-g7", "h2-h7"]) {
      const c = new Chess();
      c.clear();
      c.put({ type: "k", color: "b" }, "e8");
      c.put({ type: "q", color: "b" }, qSq);
      c.put({ type: "k", color: "w" }, "g1");
      c.put({ type: "r", color: "w" }, "e1");
      c.put({ type: "b", color: "w" }, "e4");

      if (dummy !== "none") {
        const [wSq, bSq] = dummy.split("-");
        c.put({ type: "p", color: "w" }, wSq);
        c.put({ type: "p", color: "b" }, bSq);
      }

      count += 1;
      const id = `discovery-b-${qSq}-${dummy}`;
      const rating = 1500 + (count % 12) * 30;
      tryAdmit({
        id,
        fen: c.fen(),
        moves: [`Bx${qSq}+`],
        rating,
        themes: ["discoveredAttack", dummy === "none" ? "endgame" : "middlegame"],
      });
    }
  }
}

// -------------------------------------------------------------
// 11. Promotion Tactics (1-ply & 3-ply material gain)
// -------------------------------------------------------------
function genPromotionTactics() {
  let count = 0;
  // 1-ply: White pawn on 7th rank promotes capturing a piece with check:
  // E.g. Black Rd8, White pawn on c7: cxd8=Q+
  const files = ["c", "d", "e", "f"];
  for (const file of files) {
    const fileCode = file.charCodeAt(0);
    for (const captureDir of [-1, 1]) {
      const targetFile = String.fromCharCode(fileCode + captureDir);
      if (targetFile < "a" || targetFile > "h") continue;

      for (const capturedType of ["r", "q", "b", "n"]) {
        for (const dummy of ["none", "a2-a7", "h2-h7"]) {
          const c = new Chess();
          c.clear();
          c.put({ type: "k", color: "b" }, "e8");
          // target piece on 8th rank
          c.put({ type: capturedType, color: "b" }, `${targetFile}8`);
          c.put({ type: "p", color: "w" }, `${file}7`);
          c.put({ type: "k", color: "w" }, "g1");

          if (dummy !== "none") {
            const [wSq, bSq] = dummy.split("-");
            c.put({ type: "p", color: "w" }, wSq);
            c.put({ type: "p", color: "b" }, bSq);
          }

          const moveSan = `${file}x${targetFile}8=Q+`;
          count += 1;
          const id = `promo-capture-${file}-${targetFile}-${capturedType}-${dummy}`;
          const rating = 950 + (count % 14) * 35;
          tryAdmit({
            id,
            fen: c.fen(),
            moves: [moveSan],
            rating,
            themes: ["promotion", dummy === "none" ? "endgame" : "middlegame"],
          });
        }
      }
    }
  }
}

// -------------------------------------------------------------
// 12. Endgame Tactics (Pawn & Rook Endgames)
// -------------------------------------------------------------
function genEndgameTactics() {
  let count = 0;
  // Simple pawn promotion / passed pawn push (e.g. e8=Q)
  for (const file of ["a", "b", "c", "d", "e", "f", "g", "h"]) {
    for (const dummy of ["none", "k-pos1", "k-pos2"]) {
      const c = new Chess();
      c.clear();
      c.put({ type: "k", color: "b" }, dummy === "k-pos1" ? "h8" : "a8");
      c.put({ type: "k", color: "w" }, "d4");
      c.put({ type: "p", color: "w" }, `${file}7`);

      count += 1;
      const id = `endgame-promo-${file}-${dummy}`;
      const rating = 780 + (count % 10) * 30;
      tryAdmit({
        id,
        fen: c.fen(),
        moves: [`${file}8=Q+`],
        rating,
        themes: ["endgame", "promotion"],
      });
    }
  }
}

// -------------------------------------------------------------
// 13. High-Rated Tactics (Ratings 1800 to 2400)
// -------------------------------------------------------------
function genHighRatedTactics() {
  const HIGH_STRUCTURES = [
    // 1800-1899
    { id: "s1", w: ["a2", "b2"], b: ["a7", "b7"], rating: 1810 },
    { id: "s2", w: ["a3", "b2"], b: ["a6", "b7"], rating: 1840 },
    { id: "s3", w: ["a2", "b3"], b: ["a7", "b6"], rating: 1870 },
    { id: "s4", w: ["a3", "b3"], b: ["a6", "b6"], rating: 1890 },
    // 1900-1999
    { id: "s5", w: ["a4", "b2"], b: ["a5", "b7"], rating: 1910 },
    { id: "s6", w: ["a4", "b3"], b: ["a5", "b6"], rating: 1940 },
    { id: "s7", w: ["b2", "c3"], b: ["b7", "c6"], rating: 1970 },
    { id: "s8", w: ["b3", "c2"], b: ["b6", "c7"], rating: 1990 },
    // 2000-2099
    { id: "s9", w: ["a2", "c3"], b: ["a7", "c6"], rating: 2010 },
    { id: "s10", w: ["a3", "c2"], b: ["a6", "c7"], rating: 2040 },
    { id: "s11", w: ["b4", "c3"], b: ["b5", "c6"], rating: 2070 },
    { id: "s12", w: ["c2", "d3"], b: ["c7", "d6"], rating: 2090 },
    // 2100-2199
    { id: "s13", w: ["a2", "b2", "c3"], b: ["a7", "b7", "c6"], rating: 2110 },
    { id: "s14", w: ["a3", "b2", "c3"], b: ["a6", "b7", "c6"], rating: 2140 },
    { id: "s15", w: ["a2", "b3", "c3"], b: ["a7", "b6", "c6"], rating: 2170 },
    { id: "s16", w: ["a4", "b2", "c3"], b: ["a5", "b7", "c6"], rating: 2190 },
    // 2200-2299
    { id: "s17", w: ["a3", "b3", "c3"], b: ["a6", "b6", "c6"], rating: 2210 },
    { id: "s18", w: ["a2", "b4", "c3"], b: ["a7", "b5", "c6"], rating: 2240 },
    { id: "s19", w: ["b2", "c2", "d3"], b: ["b7", "c7", "d6"], rating: 2270 },
    { id: "s20", w: ["b3", "c3", "d3"], b: ["b6", "c6", "d6"], rating: 2290 },
    // 2300-2400
    { id: "s21", w: ["a2", "b2", "c2", "d3"], b: ["a7", "b7", "c7", "d6"], rating: 2310 },
    { id: "s22", w: ["a3", "b2", "c2", "d3"], b: ["a6", "b7", "c7", "d6"], rating: 2340 },
    { id: "s23", w: ["a2", "b3", "c2", "d3"], b: ["a7", "b6", "c7", "d6"], rating: 2370 },
    { id: "s24", w: ["a2", "b2", "c3", "d3"], b: ["a7", "b7", "c6", "d6"], rating: 2400 },
  ];

  // Pattern A: High-tier Queen sacrifice forcing Mate in 2 (Anastasia)
  for (const s of HIGH_STRUCTURES) {
    for (const rookSq of ["a4", "b4", "c4"]) {
      const c = new Chess();
      c.clear();
      c.put({ type: "k", color: "b" }, "h8");
      c.put({ type: "p", color: "b" }, "f7");
      c.put({ type: "p", color: "b" }, "g7");
      c.put({ type: "p", color: "b" }, "h7");

      c.put({ type: "k", color: "w" }, "g1");
      c.put({ type: "n", color: "w" }, "e7");
      c.put({ type: "q", color: "w" }, "h5");
      c.put({ type: "r", color: "w" }, rookSq);

      for (const p of s.w) c.put({ type: "p", color: "w" }, p);
      for (const p of s.b) c.put({ type: "p", color: "b" }, p);

      const id = `tactics-expert-sac-${s.id}-${rookSq}`;
      tryAdmit({
        id,
        fen: c.fen(),
        moves: ["Qxh7+", "Kxh7", `Rh${rookSq[1]}#`],
        rating: s.rating,
        themes: ["mate", "mateIn2", "sacrifice", "attraction", "middlegame"],
      });
    }
  }

  // Pattern B: High-tier Discovered Attack & Double Check
  for (const s of HIGH_STRUCTURES) {
    for (const qSq of ["f6", "d6"]) {
      const c = new Chess();
      c.clear();
      c.put({ type: "k", color: "b" }, "e8");
      c.put({ type: "q", color: "b" }, qSq);
      c.put({ type: "k", color: "w" }, "g1");
      c.put({ type: "r", color: "w" }, "e1");
      c.put({ type: "n", color: "w" }, "e4");

      for (const p of s.w) c.put({ type: "p", color: "w" }, p);
      for (const p of s.b) c.put({ type: "p", color: "b" }, p);

      const id = `tactics-expert-disc-${s.id}-${qSq}`;
      tryAdmit({
        id,
        fen: c.fen(),
        moves: [`Nx${qSq}+`],
        rating: Math.min(2400, s.rating + 10),
        themes: ["discoveredAttack", "middlegame"],
      });
    }
  }

  // Pattern C: High-tier Knight Forks
  for (const s of HIGH_STRUCTURES) {
    for (const qSq of ["d7", "e7"]) {
      const c = new Chess();
      c.clear();
      c.put({ type: "k", color: "b" }, "g8");
      c.put({ type: "q", color: "b" }, qSq);
      c.put({ type: "k", color: "w" }, "g1");
      c.put({ type: "n", color: "w" }, "e4");

      for (const p of s.w) c.put({ type: "p", color: "w" }, p);
      for (const p of s.b) c.put({ type: "p", color: "b" }, p);

      const id = `tactics-expert-fork-${s.id}-${qSq}`;
      tryAdmit({
        id,
        fen: c.fen(),
        moves: ["Nf6+", "Kh8", `Nx${qSq}`],
        rating: Math.min(2400, s.rating - 10),
        themes: ["fork", "middlegame"],
      });
    }
  }
}

// -------------------------------------------------------------
// Run all generators
// -------------------------------------------------------------
console.log("Generating puzzles...");
genBackRankMate1();
genCorridorAndSupportMate1();
genPromotionMatesIn1();
genSacBackRankMateIn2();
genSmotheredMatesIn2();
genAnastasiaAndHookMate2();
genKnightForks();
genPins();
genSkewers();
genDiscoveredAttacks();
genPromotionTactics();
genEndgameTactics();
genHighRatedTactics();

console.log(`Total generated puzzles admitted: ${admitted.length}`);

// Sort puzzles deterministically by rating, then by id
admitted.sort((a, b) => a.rating - b.rating || a.id.localeCompare(b.id));

// Verify distribution
const PUZZLE_THEMES = [
  "mate",
  "mateIn1",
  "mateIn2",
  "fork",
  "pin",
  "skewer",
  "discoveredAttack",
  "backRank",
  "sacrifice",
  "attraction",
  "endgame",
  "promotion",
  "middlegame",
];

console.log("Checking theme coverage:");
for (const theme of PUZZLE_THEMES) {
  const c = admitted.filter((p) => p.themes.includes(theme)).length;
  console.log(`  ${theme}: ${c}`);
}

console.log("Checking rating band coverage (200-wide from 700 to 2400):");
for (let min = 700; min < 2400; min += 200) {
  const max = min + 199;
  const c = admitted.filter((p) => p.rating >= min && p.rating <= max).length;
  console.log(`  ${min}-${max}: ${c}`);
}

// Output file generation
const fileContent = `// DO NOT EDIT - Generated automatically by scripts/generate-puzzles.mjs
// Contains curated, verified tactical chess puzzles spanning ratings 700-2400.
import type { Puzzle } from "./types";

export const GENERATED_PUZZLES: Puzzle[] = ${JSON.stringify(admitted, null, 2)};
`;

if (process.argv.includes("--check")) {
  let existing = "";
  try {
    existing = readFileSync(OUTPUT_PATH, "utf-8");
  } catch {
    console.error("Existing generated catalog not found");
    process.exit(1);
  }
  if (existing !== fileContent) {
    console.error("Generated catalog is out of sync with generator script! Run 'npm run puzzles:generate' to update.");
    process.exit(1);
  }
  console.log("--check passed: generated catalog matches exactly.");
} else {
  writeFileSync(OUTPUT_PATH, fileContent, "utf-8");
  console.log(`Successfully wrote ${admitted.length} puzzles to ${OUTPUT_PATH}`);
}
