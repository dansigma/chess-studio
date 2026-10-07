import type { Puzzle } from "./types";

/**
 * Positions to solve. `fen` is the side to move. `moves` is the main line in SAN:
 * the solver plays the first move and every other move after that; the replies in
 * between are played automatically.
 */
export const PUZZLE_CATALOG: Puzzle[] = [
  {
    id: "queen-corridor",
    fen: "7k/5Qpp/8/8/8/8/6PP/6K1 w - - 0 1",
    moves: ["Qf8#"],
    rating: 750,
    themes: ["mate", "mateIn1", "middlegame"],
  },
  {
    id: "back-rank-rook",
    fen: "6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1",
    moves: ["Re8#"],
    rating: 800,
    themes: ["mate", "mateIn1", "backRank", "endgame"],
  },
  {
    id: "hanging-bishop",
    fen: "4k3/8/4b3/8/8/8/4R3/4K3 w - - 0 1",
    moves: ["Rxe6"],
    rating: 820,
    themes: ["pin", "endgame"],
  },
  {
    id: "rook-roll",
    fen: "k7/8/1K6/8/8/8/8/7R w - - 0 1",
    moves: ["Rh8#"],
    rating: 880,
    themes: ["mate", "mateIn1", "endgame"],
  },
  {
    id: "queen-support",
    fen: "k7/8/1K6/8/8/8/8/Q7 w - - 0 1",
    moves: ["Qa7#"],
    rating: 920,
    themes: ["mate", "mateIn1", "endgame"],
  },
  {
    id: "promote-f",
    fen: "7k/5P2/6K1/8/8/8/8/8 w - - 0 1",
    moves: ["f8=Q#"],
    rating: 960,
    themes: ["mate", "mateIn1", "promotion", "endgame"],
  },
  {
    id: "promote-e",
    fen: "6k1/4P3/6K1/8/8/8/8/8 w - - 0 1",
    moves: ["e8=Q#"],
    rating: 980,
    themes: ["mate", "mateIn1", "promotion", "endgame"],
  },
  {
    id: "pinned-queen",
    fen: "4k3/4q3/8/8/8/8/4R3/4K3 w - - 0 1",
    moves: ["Rxe7+"],
    rating: 1020,
    themes: ["pin", "endgame"],
  },
  {
    id: "double-rook-back-rank",
    fen: "r5k1/5ppp/8/8/8/8/4RPPP/4R1K1 w - - 0 1",
    moves: ["Re8+", "Rxe8", "Rxe8#"],
    rating: 1080,
    themes: ["mate", "mateIn2", "backRank", "sacrifice", "attraction"],
  },
  {
    id: "smothered-knight",
    fen: "5r1k/6pp/4Q2N/8/8/8/8/6K1 w - - 0 1",
    moves: ["Qg8+", "Rxg8", "Nf7#"],
    rating: 1120,
    themes: ["mate", "mateIn2", "sacrifice", "attraction", "middlegame"],
  },
  {
    id: "queen-sac-back-rank",
    fen: "r5k1/5ppp/8/8/8/8/4QPPP/4R1K1 w - - 0 1",
    moves: ["Qe8+", "Rxe8", "Rxe8#"],
    rating: 1180,
    themes: ["mate", "mateIn2", "backRank", "sacrifice", "attraction", "middlegame"],
  },
  {
    id: "knight-fork-queen",
    fen: "4q1k1/8/8/8/4N3/8/8/6K1 w - - 0 1",
    moves: ["Nf6+", "Kh8", "Nxe8"],
    rating: 1220,
    themes: ["fork", "middlegame"],
  },
  {
    id: "knight-fork-queen-d7",
    fen: "6k1/3q4/8/8/4N3/8/8/6K1 w - - 0 1",
    moves: ["Nf6+", "Kh8", "Nxd7"],
    rating: 1260,
    themes: ["fork", "middlegame"],
  },
  {
    id: "knight-fork-black",
    fen: "6k1/8/8/4n3/8/8/8/4Q1K1 b - - 0 1",
    moves: ["Nf3+", "Kh1", "Nxe1"],
    rating: 1280,
    themes: ["fork", "endgame"],
  },
  {
    id: "rook-skewer",
    fen: "4q3/4k3/8/8/8/8/8/4R1K1 w - - 0 1",
    moves: ["Re2+", "Kf6", "Rxe8"],
    rating: 1340,
    themes: ["skewer", "endgame"],
  },
  {
    id: "rook-skewer-c",
    fen: "2q5/2k5/8/8/8/8/8/2R3K1 w - - 0 1",
    moves: ["Rc2+", "Kb6", "Rxc8"],
    rating: 1380,
    themes: ["skewer", "endgame"],
  },
  {
    id: "discovered-knight",
    fen: "4k3/8/5q2/8/4N3/8/8/4R1K1 w - - 0 1",
    moves: ["Nxf6+"],
    rating: 1440,
    themes: ["discoveredAttack", "middlegame"],
  },
  {
    id: "discovered-bishop",
    fen: "4k3/8/2q5/8/4B3/8/8/4R1K1 w - - 0 1",
    moves: ["Bxc6+"],
    rating: 1500,
    themes: ["discoveredAttack", "middlegame"],
  },
];
