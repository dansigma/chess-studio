import { Chess } from "chess.js";
import { START_FEN } from "@/src/chess/tree";
import type {
  ExplorerGameRow,
  ExplorerMoveRow,
  ExplorerResponse,
  ExplorerSource,
} from "@/src/lib/explorer-types";
import { playerNameMatches } from "@/src/lib/player-search";
import type { PlayerGame, PlayerHit } from "@/src/lib/player-types";

type SampleGame = {
  id: string;
  pgn: string;
};

const SAMPLE_GAMES: SampleGame[] = [
  {
    id: "book-opera",
    pgn: `[Event "Paris Opera"]
[Site "Paris"]
[Date "1858.??.??"]
[White "Morphy, Paul"]
[Black "Duke of Brunswick"]
[Result "1-0"]
[ECO "C41"]
[WhiteElo "2700"]
[BlackElo "2300"]
[Opening "Philidor Defense"]

1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0`,
  },
  {
    id: "book-immortal",
    pgn: `[Event "London"]
[Site "London"]
[Date "1851.06.21"]
[White "Anderssen, Adolf"]
[Black "Kieseritzky, Lionel"]
[Result "1-0"]
[ECO "C33"]
[WhiteElo "2600"]
[BlackElo "2500"]
[Opening "King's Gambit Accepted"]

1. e4 e5 2. f4 exf4 3. Bc4 Qh4+ 4. Kf1 b5 5. Bxb5 Nf6 6. Nf3 Qh6 7. d3 Nh5 8. Nh4 Qg5 9. Nf5 c6 10. g4 Nf6 11. Rg1 cxb5 12. h4 Qg6 13. h5 Qg5 14. Qf3 Ng8 15. Bxf4 Qf6 16. Nc3 Bc5 17. Nd5 Qxb2 18. Bd6 Bxg1 19. e5 Qxa1+ 20. Ke2 Na6 21. Nxg7+ Kd8 22. Qf6+ Nxf6 23. Be7# 1-0`,
  },
  {
    id: "book-evergreen",
    pgn: `[Event "Berlin"]
[Site "Berlin"]
[Date "1852.??.??"]
[White "Anderssen, Adolf"]
[Black "Dufresne, Jean"]
[Result "1-0"]
[ECO "C52"]
[WhiteElo "2600"]
[BlackElo "2400"]
[Opening "Evans Gambit"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. b4 Bxb4 5. c3 Ba5 6. d4 exd4 7. O-O d3 8. Qb3 Qf6 9. e5 Qg6 10. Re1 Nge7 11. Ba3 b5 12. Qxb5 Rb8 13. Qa4 Bb6 14. Nbd2 Bb7 15. Ne4 Qf5 16. Bxd3 Qh5 17. Nf6+ gxf6 18. exf6 Rg8 19. Rad1 Qxf3 20. Rxe7+ Nxe7 21. Qxd7+ Kxd7 22. Bf5+ Ke8 23. Bd7+ Kf8 24. Bxe7# 1-0`,
  },
  {
    id: "book-ruy",
    pgn: `[Event "Sample Classical"]
[Site "Studio"]
[Date "1992.??.??"]
[White "Kasparov, Garry"]
[Black "Short, Nigel"]
[Result "1-0"]
[ECO "C92"]
[WhiteElo "2785"]
[BlackElo "2685"]
[Opening "Ruy Lopez"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Bb7 10. d4 Re8 11. Nbd2 Bf8 12. a4 h6 13. Bc2 exd4 14. cxd4 Nb4 15. Bb1 c5 16. d5 Nd7 1-0`,
  },
  {
    id: "book-sicilian",
    pgn: `[Event "Sample Sicilian"]
[Site "Studio"]
[Date "1999.??.??"]
[White "Kasparov, Garry"]
[Black "Topalov, Veselin"]
[Result "1-0"]
[ECO "B90"]
[WhiteElo "2812"]
[BlackElo "2700"]
[Opening "Sicilian Najdorf"]

1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Be3 e6 7. g4 e5 8. Nf5 g6 9. g5 gxf5 10. exf5 d5 11. Qf3 d4 12. O-O-O Nbd7 13. Bd2 dxc3 14. Bxc3 Bg7 1-0`,
  },
  {
    id: "book-french",
    pgn: `[Event "Sample French"]
[Site "Studio"]
[Date "1987.??.??"]
[White "Karpov, Anatoly"]
[Black "Jussupow, Artur"]
[Result "1/2-1/2"]
[ECO "C11"]
[WhiteElo "2725"]
[BlackElo "2645"]
[Opening "French Defense"]

1. e4 e6 2. d4 d5 3. Nc3 Nf6 4. e5 Nfd7 5. f4 c5 6. Nf3 Nc6 7. Be3 a6 8. Qd2 b5 9. dxc5 Bxc5 10. Bd3 Qb6 11. Bf2 O-O 12. O-O 1/2-1/2`,
  },
  {
    id: "book-caro",
    pgn: `[Event "Sample Caro-Kann"]
[Site "Studio"]
[Date "2006.??.??"]
[White "Anand, Viswanathan"]
[Black "Morozevich, Alexander"]
[Result "1-0"]
[ECO "B12"]
[WhiteElo "2779"]
[BlackElo "2742"]
[Opening "Caro-Kann"]

1. e4 c6 2. d4 d5 3. e5 Bf5 4. Nf3 e6 5. Be2 c5 6. Be3 cxd4 7. Nxd4 Ne7 8. O-O Nbc6 9. c4 Nxd4 10. Bxd4 dxc4 11. Na3 1-0`,
  },
  {
    id: "book-qg",
    pgn: `[Event "World Championship"]
[Site "Reykjavik"]
[Date "1972.07.23"]
[White "Fischer, Robert"]
[Black "Spassky, Boris"]
[Result "1-0"]
[ECO "D59"]
[WhiteElo "2785"]
[BlackElo "2660"]
[Opening "Queen's Gambit Declined"]

1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Be7 5. e3 O-O 6. Nf3 h6 7. Bh4 b6 8. cxd5 Nxd5 9. Bxe7 Qxe7 10. Nxd5 exd5 11. Rc1 Be6 12. Qa4 c5 13. Qa3 Rc8 14. Bb5 a6 15. dxc5 bxc5 16. O-O 1-0`,
  },
  {
    id: "book-nimzo",
    pgn: `[Event "AVRO"]
[Site "Netherlands"]
[Date "1938.11.22"]
[White "Botvinnik, Mikhail"]
[Black "Capablanca, Jose"]
[Result "1-0"]
[ECO "E34"]
[WhiteElo "2700"]
[BlackElo "2725"]
[Opening "Nimzo-Indian"]

1. d4 Nf6 2. c4 e6 3. Nc3 Bb4 4. e3 d5 5. a3 Bxc3+ 6. bxc3 c5 7. cxd5 exd5 8. Bd3 O-O 9. Ne2 b6 10. O-O Ba6 11. Bxa6 Nxa6 12. Bb2 Qd7 13. a4 1-0`,
  },
  {
    id: "book-kingsindian",
    pgn: `[Event "Sample King's Indian"]
[Site "Studio"]
[Date "1993.??.??"]
[White "Karpov, Anatoly"]
[Black "Kasparov, Garry"]
[Result "0-1"]
[ECO "E97"]
[WhiteElo "2760"]
[BlackElo "2805"]
[Opening "King's Indian"]

1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 4. e4 d6 5. Nf3 O-O 6. Be2 e5 7. O-O Nc6 8. d5 Ne7 9. Ne1 Nd7 10. Be3 f5 11. f3 f4 12. Bf2 g5 0-1`,
  },
  {
    id: "book-english",
    pgn: `[Event "World Championship"]
[Site "Reykjavik"]
[Date "1972.07.23"]
[White "Fischer, Robert"]
[Black "Spassky, Boris"]
[Result "1-0"]
[ECO "A13"]
[WhiteElo "2785"]
[BlackElo "2660"]
[Opening "English Opening"]

1. c4 e6 2. Nf3 d5 3. d4 Nf6 4. Nc3 Be7 5. Bg5 O-O 6. e3 h6 7. Bh4 b6 8. cxd5 Nxd5 9. Bxe7 Qxe7 10. Nxd5 exd5 11. Rc1 Be6 1-0`,
  },
  {
    id: "book-reti",
    pgn: `[Event "New York"]
[Site "New York"]
[Date "1924.??.??"]
[White "Reti, Richard"]
[Black "Capablanca, Jose"]
[Result "1-0"]
[ECO "A13"]
[WhiteElo "2550"]
[BlackElo "2725"]
[Opening "Reti Opening"]

1. Nf3 Nf6 2. c4 e6 3. g3 d5 4. Bg2 Bd6 5. O-O O-O 6. b3 Re8 7. Bb2 Nbd7 8. d3 c6 9. Nbd2 e5 10. cxd5 cxd5 11. Rc1 1-0`,
  },
  {
    id: "book-slav",
    pgn: `[Event "Sample Slav"]
[Site "Studio"]
[Date "2008.??.??"]
[White "Kramnik, Vladimir"]
[Black "Topalov, Veselin"]
[Result "1/2-1/2"]
[ECO "D17"]
[WhiteElo "2772"]
[BlackElo "2791"]
[Opening "Slav Defense"]

1. d4 d5 2. c4 c6 3. Nf3 Nf6 4. Nc3 dxc4 5. a4 Bf5 6. e3 e6 7. Bxc4 Bb4 8. O-O Nbd7 9. Qe2 O-O 10. e4 Bg6 11. Bd3 1/2-1/2`,
  },
  {
    id: "book-london",
    pgn: `[Event "Sample London"]
[Site "Studio"]
[Date "2018.??.??"]
[White "Carlsen, Magnus"]
[Black "Caruana, Fabiano"]
[Result "1/2-1/2"]
[ECO "D02"]
[WhiteElo "2835"]
[BlackElo "2832"]
[Opening "London System"]

1. d4 d5 2. Nf3 Nf6 3. Bf4 e6 4. e3 c5 5. c3 Nc6 6. Nbd2 Bd6 7. Bg3 O-O 8. Bd3 b6 9. Qe2 Bb7 10. Rd1 1/2-1/2`,
  },
];

type MoveAgg = {
  san: string;
  uci: string;
  white: number;
  draws: number;
  black: number;
};

type PositionAgg = {
  moves: Map<string, MoveAgg>;
  games: ExplorerGameRow[];
  white: number;
  draws: number;
  black: number;
};

function normalizeFen(fen: string): string {
  return fen.split(" ").slice(0, 4).join(" ");
}

function resultBucket(result: string): "white" | "draws" | "black" {
  if (result === "1-0") {
    return "white";
  }
  if (result === "0-1") {
    return "black";
  }
  return "draws";
}

function header(chess: Chess, key: string): string | undefined {
  const value = chess.header()[key];
  return typeof value === "string" ? value : undefined;
}

function emptyPosition(): PositionAgg {
  return {
    moves: new Map(),
    games: [],
    white: 0,
    draws: 0,
    black: 0,
  };
}

function yearFromDate(date: string | undefined): number | null {
  if (!date) {
    return null;
  }
  const year = Number(date.slice(0, 4));
  return Number.isFinite(year) ? year : null;
}

let index: Map<string, PositionAgg> | null = null;
const pgnById = new Map<string, string>();

function ensureIndex(): Map<string, PositionAgg> {
  if (index) {
    return index;
  }
  const built = new Map<string, PositionAgg>();
  for (const sample of SAMPLE_GAMES) {
    pgnById.set(sample.id, sample.pgn);
    const chess = new Chess();
    try {
      chess.loadPgn(sample.pgn);
    } catch {
      continue;
    }
    const result = header(chess, "Result") ?? "*";
    const bucket = resultBucket(result);
    const whiteName = header(chess, "White") ?? "White";
    const blackName = header(chess, "Black") ?? "Black";
    const eco = header(chess, "ECO") ?? null;
    const opening = header(chess, "Opening") ?? null;
    const event = header(chess, "Event") ?? null;
    const year = yearFromDate(header(chess, "Date"));
    const whiteRating = Number(header(chess, "WhiteElo") ?? "") || null;
    const blackRating = Number(header(chess, "BlackElo") ?? "") || null;
    const gameRow: ExplorerGameRow = {
      id: sample.id,
      winner:
        result === "1-0" ? "white" : result === "0-1" ? "black" : result.includes("1/2") ? "draw" : null,
      whiteName,
      whiteRating,
      blackName,
      blackRating,
      year,
      month: null,
      event,
      eco,
      opening,
      pgn: sample.pgn,
    };
    const replay = new Chess();
    const history = chess.history({ verbose: true });
    for (const move of history) {
      const key = normalizeFen(replay.fen());
      let pos = built.get(key);
      if (!pos) {
        pos = emptyPosition();
        built.set(key, pos);
      }
      pos[bucket] += 1;
      if (pos.games.length < 8 && !pos.games.some((row) => row.id === sample.id)) {
        pos.games.push(gameRow);
      }
      const uci = `${move.from}${move.to}${move.promotion ?? ""}`;
      const current = pos.moves.get(uci) ?? {
        san: move.san,
        uci,
        white: 0,
        draws: 0,
        black: 0,
      };
      current[bucket] += 1;
      pos.moves.set(uci, current);
      replay.move(move);
    }
    const terminal = normalizeFen(replay.fen());
    const endPos = built.get(terminal) ?? emptyPosition();
    endPos[bucket] += 1;
    if (endPos.games.length < 8 && !endPos.games.some((row) => row.id === sample.id)) {
      endPos.games.push(gameRow);
    }
    built.set(terminal, endPos);
  }
  index = built;
  return built;
}

export function getBookGamePgn(id: string): string | null {
  ensureIndex();
  return pgnById.get(id) ?? null;
}

export function lookupOpeningBook(
  source: ExplorerSource,
  fen: string,
): ExplorerResponse | null {
  const pos = ensureIndex().get(normalizeFen(fen));
  if (!pos) {
    return null;
  }
  const moves: ExplorerMoveRow[] = [...pos.moves.values()]
    .map((move) => ({
      san: move.san,
      uci: move.uci,
      white: move.white,
      draws: move.draws,
      black: move.black,
      games: move.white + move.draws + move.black,
      averageRating: 2650,
    }))
    .sort((a, b) => b.games - a.games);
  return {
    source,
    fen,
    white: pos.white,
    draws: pos.draws,
    black: pos.black,
    opening:
      normalizeFen(fen) === normalizeFen(START_FEN) || !pos.games[0]?.eco
        ? null
        : { eco: pos.games[0].eco ?? "", name: pos.games[0].opening ?? "" },
    moves,
    games: pos.games,
    notice:
      "Showing a built-in master sample book. Set LICHESS_TOKEN for live Lichess explorer stats.",
  };
}

export function emptyExplorer(
  source: ExplorerSource,
  fen: string,
  notice: string,
): ExplorerResponse {
  return {
    source,
    fen,
    white: 0,
    draws: 0,
    black: 0,
    opening: null,
    moves: [],
    games: [],
    notice,
  };
}

function parseBookGame(sample: SampleGame): PlayerGame | null {
  const chess = new Chess();
  try {
    chess.loadPgn(sample.pgn);
  } catch {
    return null;
  }
  const result = header(chess, "Result") ?? "*";
  const whiteName = header(chess, "White") ?? "White";
  const blackName = header(chess, "Black") ?? "Black";
  const year = yearFromDate(header(chess, "Date"));
  const winner: PlayerGame["winner"] =
    result === "1-0" ? "white" : result === "0-1" ? "black" : result.includes("1/2") ? "draw" : null;
  return {
    id: sample.id,
    winner,
    whiteName,
    whiteRating: Number(header(chess, "WhiteElo") ?? "") || null,
    blackName,
    blackRating: Number(header(chess, "BlackElo") ?? "") || null,
    year,
    month: null,
    event: header(chess, "Event") ?? null,
    eco: header(chess, "ECO") ?? null,
    opening: header(chess, "Opening") ?? null,
    pgn: sample.pgn,
    moves: chess.history().join(" "),
    color: "white",
    playerResult: null,
    playedAt: year ? Date.UTC(year, 0, 1) : null,
  };
}

function withPlayerSide(game: PlayerGame, username: string): PlayerGame {
  const target = username.toLowerCase();
  const color: "white" | "black" = game.whiteName.toLowerCase() === target ? "white" : "black";
  const playerResult =
    game.winner === "draw"
      ? "draw"
      : game.winner === "white" || game.winner === "black"
        ? game.winner === color
          ? "win"
          : "loss"
        : null;
  return { ...game, color, playerResult };
}

export function searchBookPlayers(query: string): PlayerHit[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) {
    return [];
  }
  const hits = new Map<string, PlayerHit>();
  for (const sample of SAMPLE_GAMES) {
    const game = parseBookGame(sample);
    if (!game) {
      continue;
    }
    for (const name of [game.whiteName, game.blackName]) {
      if (!playerNameMatches(name, query)) {
        continue;
      }
      const key = name.toLowerCase();
      if (!hits.has(key)) {
        hits.set(key, {
          id: `studio:${name}`,
          source: "studio",
          username: name,
          displayName: name,
          subtitle: "Studio · sample book",
        });
      }
    }
  }
  return [...hits.values()];
}

export function bookGamesForPlayer(username: string): PlayerGame[] {
  const target = username.toLowerCase();
  const games: PlayerGame[] = [];
  for (const sample of SAMPLE_GAMES) {
    const game = parseBookGame(sample);
    if (!game) {
      continue;
    }
    const white = game.whiteName.toLowerCase();
    const black = game.blackName.toLowerCase();
    if (white !== target && black !== target && !white.includes(target) && !black.includes(target)) {
      continue;
    }
    const matchedName = white === target || white.includes(target) ? game.whiteName : game.blackName;
    games.push(withPlayerSide(game, matchedName));
  }
  return games;
}
