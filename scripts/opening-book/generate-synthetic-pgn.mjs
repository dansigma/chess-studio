// scripts/opening-book/generate-synthetic-pgn.mjs
// SIG-1226: synthetic Lichess-style PGN for testing the opening book pipeline
// where the real dumps (tens of GB) cannot be had. Games follow a handful of
// weighted opening lines (some rare enough to fail the 1% / 20-game rules),
// deviate with a random legal move, then play random legal moves. Headers use
// the Lichess fields the filter reads (WhiteElo, BlackElo, TimeControl, Event,
// Termination, Variant), with a spread of ratings, speeds and junk games.
//
//   node scripts/opening-book/generate-synthetic-pgn.mjs --games 50000 --seed 1226 > synthetic.pgn
//
// SIG-1229: --style otb | corr emits databases shaped like the masters and
// correspondence sources instead: no Lichess fields, a pool of named players
// written in several formats ("Carlsen, Magnus", "Carlsen, M", "Magnus
// Carlsen"), FIDE-like or ICCF-like Elos (some missing or low), no TimeControl
// (or a day-long one), some online Site values, exact duplicates with the
// names re-formatted, and one player who repeats a pet line against everybody
// (many games, one distinct player). Default style `lichess` is unchanged.
import { Chess } from "chess.js";
import { pathToFileURL } from "node:url";

// [weight, SAN line]. Weights are relative frequencies of the line.
export const OPENING_LINES = [
  // Queen's Gambit Declined, Tartakower (Fischer-Spassky 1972, game 6)
  [26, "c4 e6 Nf3 d5 d4 Nf6 Nc3 Be7 Bg5 O-O e3 h6 Bh4 b6 cxd5 Nxd5 Bxe7 Qxe7 Nxd5 exd5 Rc1 Be6"],
  [6, "c4 e6 Nf3 d5 d4 Nf6 Nc3 Be7 Bg5 O-O e3 h6 Bh4 Ne4 Bxe7 Qxe7"],
  [1, "c4 e6 Nf3 d5 d4 Nf6 Nc3 Be7 Bg5 O-O e3 h6 Bf4 c5"],
  // Ruy Lopez, Closed
  [20, "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O h3 Nb8"],
  [5, "e4 e5 Nf3 Nc6 Bb5 Nf6 O-O Nxe4 d4 Nd6 Bxc6 dxc6 dxe5 Nf5"],
  [1, "e4 e5 Nf3 Nc6 Bb5 f5 Nc3 fxe4 Nxe4 d5"],
  // Italian
  [7, "e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O O-O"],
  // Sicilian Najdorf
  [18, "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5 Nb3 Be6 f3 Be7"],
  [4, "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6 Be3 Bg7 f3 O-O"],
  [1, "e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 e5 Nb5 d6"],
  // Pirc, 150 Attack (Kasparov-Topalov, Wijk aan Zee 1999)
  [6, "e4 d6 d4 Nf6 Nc3 g6 Be3 Bg7 Qd2 c6 f3 b5 Nge2 Nbd7 Bh6 Bxh6 Qxh6 Bb7"],
  [1, "e4 d6 d4 Nf6 Nc3 g6 Be3 Bg7 Qd2 c6 f3 O-O"],
  // Caro-Kann and French
  [8, "e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6 h4 h6 Nf3 Nd7"],
  [6, "e4 e6 d4 d5 Nc3 Bb4 e5 c5 a3 Bxc3+ bxc3 Ne7"],
  // Nimzo / King's Indian / English
  [7, "d4 Nf6 c4 e6 Nc3 Bb4 e3 O-O Bd3 d5 Nf3 c5 O-O Nc6"],
  [5, "d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5 O-O Nc6"],
  [3, "c4 c5 Nc3 Nc6 g3 g6 Bg2 Bg7 Nf3 e6"],
  // Rare first moves
  [1, "b4 e5 Bb2 Bxb4 Bxe5 Nf6"],
  [1, "g4 d5 Bg2 Bxg4 c4 c6"],
];

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TIME_CONTROLS = [
  ["15+0", 2], // ultraBullet
  ["60+0", 12], // bullet
  ["120+1", 8], // bullet
  ["180+0", 14], // blitz
  ["300+3", 14], // blitz
  ["600+0", 12], // rapid
  ["900+10", 10], // rapid
  ["1800+0", 6], // classical
  ["1800+20", 4], // classical
  ["-", 3], // correspondence
];
const SPEED_NAMES = { 15: "UltraBullet", 60: "Bullet", 120: "Bullet", 180: "Blitz", 300: "Blitz", 600: "Rapid", 900: "Rapid", 1800: "Classical" };

function pickWeighted(random, items) {
  const total = items.reduce((sum, item) => sum + item[0], 0);
  let roll = random() * total;
  for (const item of items) {
    roll -= item[0];
    if (roll < 0) {
      return item;
    }
  }
  return items[items.length - 1];
}

function formatClock(seconds) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** One synthetic game: { headers, plies: SAN[] }. */
export function syntheticGame(random, index) {
  const [, line] = pickWeighted(random, OPENING_LINES);
  const book = line.split(" ");
  const board = new Chess();
  const sans = [];
  // How long the game follows the line before deviating (sometimes never).
  const deviateAt = random() < 0.55 ? book.length : Math.floor(random() * book.length);
  const target = random() < 0.06 ? 8 + Math.floor(random() * 10) : 24 + Math.floor(random() * 23);
  while (sans.length < target) {
    let san;
    if (sans.length < deviateAt && sans.length < book.length) {
      san = book[sans.length];
    } else {
      const legal = board.moves();
      if (legal.length === 0) {
        break;
      }
      san = legal[Math.floor(random() * legal.length)];
    }
    board.move(san);
    sans.push(san);
  }
  const [, timeControl] = pickWeighted(random, TIME_CONTROLS.map(([tc, w]) => [w, tc]));
  const strong = random() < 0.4;
  const rating = () => (strong ? 2300 + Math.floor(random() * 400) : 1500 + Math.floor(random() * 900));
  const white = rating();
  // Some "strong" games still have one player under the bar.
  const black = random() < 0.15 ? 2000 + Math.floor(random() * 250) : rating();
  const result = board.isCheckmate() ? (board.turn() === "b" ? "1-0" : "0-1") : ["1-0", "0-1", "1/2-1/2"][Math.floor(random() * 3)];
  const base = Number(timeControl.split("+")[0]);
  const speedName = timeControl === "-" ? "Correspondence" : SPEED_NAMES[base] ?? "Classical";
  const headers = {
    Event: `Rated ${speedName} game`,
    Site: `https://lichess.org/${index.toString(36).padStart(8, "0")}`,
    Date: "2024.01.15",
    White: `white${index}`,
    Black: `black${index}`,
    Result: result,
    WhiteElo: String(white),
    BlackElo: String(black),
    TimeControl: timeControl,
    Termination: random() < 0.04 ? "Abandoned" : "Normal",
  };
  if (random() < 0.01) {
    headers.Variant = "Chess960";
  }
  return { headers, plies: sans };
}

// ---- SIG-1229: OTB-like and correspondence-like games --------------------------------------

// [surname, given name, base Elo]. Includes diacritics and compound surnames.
const PLAYER_POOL = [
  ["Carlsen", "Magnus", 2830], ["Caruana", "Fabiano", 2800], ["Nakamura", "Hikaru", 2780], ["Giri", "Anish", 2770],
  ["Ding", "Liren", 2790], ["Nepomniachtchi", "Ian", 2790], ["Firouzja", "Alireza", 2760], ["Gukesh", "Dommaraju", 2760],
  ["Rapport", "Richárd", 2740], ["Radjabov", "Teimour", 2720], ["Mamedyarov", "Shakhriyar", 2730], ["Duda", "Jan-Krzysztof", 2730],
  ["Vachier-Lagrave", "Maxime", 2760], ["Grischuk", "Alexander", 2760], ["Wei", "Yi", 2730], ["Aronian", "Levon", 2750],
  ["Andersen", "Mads", 2650], ["Grandelius", "Nils", 2680], ["Šarić", "Ivan", 2670], ["Kovalev", "Vladislav", 2660],
  ["Müller", "Jörg", 2480], ["García", "José", 2460], ["Žižić", "Petar", 2440], ["Łukasz", "Piotr", 2420],
  ["Øyen", "Henrik", 2410], ["Nguyen", "Thai Dai Van", 2560], ["Rodriguez", "Carlos", 2310], ["Petrov", "Sergei", 2290],
  ["Rossi", "Marco", 2250], ["Dubois", "Luc", 2210], ["Novak", "Jan", 2180], ["Kowalski", "Tomasz", 2150],
  ["Silva", "João", 2120], ["Meier", "Hans", 2060], ["Costa", "Pedro", 2020], ["Santos", "Rui", 1980],
  ["Berg", "Anders", 1940], ["Moreau", "Paul", 1900], ["Lindqvist", "Olof", 2380], ["Takahashi", "Kenji", 2340],
];
const PET_PLAYER = ["Smith", "John", 2400];
const PET_LINE = "b4 e5 Bb2 Bxb4 Bxe5 Nf6 Bb2 O-O";
const OTB_SITES = ["Reykjavik ISL", "Wijk aan Zee NED", "Moscow RUS", "Dortmund GER", "Stavanger NOR", "Bucharest ROU", "Zagreb CRO", "Madrid ESP"];
const ONLINE_SITES = ["lichess.org", "Chess.com", "Internet Chess Club", "chess24.com"];
const CORR_EVENTS = ["ICCF World Championship Final", "ICCF Webserver Open", "IECG Email Tournament", "LSS Server Daily", "Correspondence Chess Olympiad"];
const CORR_SITES = ["ICCF", "iccf.com", "Server", "LSS", "IECG"];

function asDiacriticFree(text) {
  return text.normalize("NFD").replace(/\p{M}+/gu, "");
}

/** The same player written in one of several formats. */
export function nameVariant(random, [surname, given]) {
  const roll = random();
  const firstInitial = given[0];
  if (roll < 0.3) {
    return `${surname}, ${given}`;
  }
  if (roll < 0.5) {
    return `${surname}, ${firstInitial}`;
  }
  if (roll < 0.65) {
    return `${given} ${surname}`;
  }
  if (roll < 0.75) {
    return `${surname},${firstInitial}.`;
  }
  if (roll < 0.9) {
    return asDiacriticFree(`${surname}, ${given}`);
  }
  return `${surname.toUpperCase()}, ${given}`;
}

function playOut(random, line, deviateOften = false) {
  const book = line.split(" ");
  const board = new Chess();
  const sans = [];
  const deviateAt = random() < (deviateOften ? 0.3 : 0.55) ? book.length : Math.floor(random() * book.length);
  const target = random() < 0.05 ? 8 + Math.floor(random() * 10) : 24 + Math.floor(random() * 23);
  while (sans.length < target) {
    let san;
    if (sans.length < deviateAt && sans.length < book.length) {
      san = book[sans.length];
    } else {
      const legal = board.moves();
      if (legal.length === 0) {
        break;
      }
      san = legal[Math.floor(random() * legal.length)];
    }
    board.move(san);
    sans.push(san);
  }
  return { sans, mate: board.isCheckmate(), whiteMoved: sans.length };
}

function pickPlayer(random, minBase = 0) {
  const pool = PLAYER_POOL.filter((player) => player[2] >= minBase);
  return pool[Math.floor(random() * pool.length)];
}

function resultOf(random, game) {
  return game.mate ? (game.sans.length % 2 === 1 ? "1-0" : "0-1") : ["1-0", "0-1", "1/2-1/2"][Math.floor(random() * 3)];
}

function eloTag(random, base) {
  const value = base + Math.floor(random() * 60) - 30;
  return random() < 0.08 ? undefined : String(value);
}

/** One OTB-like (style "otb") or correspondence-like (style "corr") game. */
export function databaseGame(random, index, style) {
  const pet = random() < 0.15;
  const [, line] = pet ? [0, PET_LINE] : pickWeighted(random, OPENING_LINES);
  const game = playOut(random, line, true);
  const white = pet ? PET_PLAYER : pickPlayer(random);
  let black = pickPlayer(random);
  while (black === white) {
    black = pickPlayer(random);
  }
  const corr = style === "corr";
  const headers = {};
  const year = 2005 + Math.floor(random() * 20);
  const month = 1 + Math.floor(random() * 12);
  const day = 1 + Math.floor(random() * 28);
  if (corr) {
    const otb = random() < 0.05;
    const live = !otb && random() < 0.04;
    headers.Event = otb ? `Open ${year}` : CORR_EVENTS[Math.floor(random() * CORR_EVENTS.length)];
    headers.Site = otb ? OTB_SITES[Math.floor(random() * OTB_SITES.length)] : live ? "lichess.org" : CORR_SITES[Math.floor(random() * CORR_SITES.length)];
    if (live) {
      headers.TimeControl = "180+0";
    } else if (!otb && random() < 0.5) {
      headers.TimeControl = random() < 0.5 ? "1/259200" : "10/259200";
    }
  } else {
    const online = random() < 0.06;
    headers.Event = online ? "Titled Arena" : `Open ${year}`;
    headers.Site = online ? ONLINE_SITES[Math.floor(random() * ONLINE_SITES.length)] : OTB_SITES[Math.floor(random() * OTB_SITES.length)];
    if (random() < 0.25) {
      headers.TimeControl = "40/7200:3600";
    }
  }
  headers.Date = `${year}.${String(month).padStart(2, "0")}.${String(day).padStart(2, "0")}`;
  headers.Round = String(1 + Math.floor(random() * 9));
  const scale = corr ? -400 : 0; // correspondence ratings sit lower than top FIDE ratings
  headers.White = nameVariant(random, white);
  headers.Black = nameVariant(random, black);
  headers.Result = resultOf(random, game);
  const whiteElo = eloTag(random, corr ? 2250 + (white[2] % 450) : white[2] + scale);
  const blackElo = eloTag(random, corr ? 2250 + (black[2] % 450) : black[2] + scale);
  if (whiteElo) {
    headers.WhiteElo = whiteElo;
  }
  if (blackElo) {
    headers.BlackElo = blackElo;
  }
  return { headers, plies: game.sans, players: { white, black }, index };
}

export function formatGame({ headers, plies }, random = () => 0.5) {
  const lines = Object.entries(headers).map(([name, value]) => `[${name} "${value}"]`);
  const clock = headers.TimeControl === undefined || !/^\d+\+\d+$/.test(headers.TimeControl) ? 0 : Number(headers.TimeControl.split("+")[0]);
  const parts = [];
  plies.forEach((san, ply) => {
    const number = Math.floor(ply / 2) + 1;
    const stamp = `{ [%clk ${formatClock(clock - ply * 2 * random())}] }`;
    parts.push(ply % 2 === 0 ? `${number}. ${san} ${stamp}` : `${number}... ${san} ${stamp}`);
  });
  return `${lines.join("\n")}\n\n${parts.join(" ")} ${headers.Result}\n\n`;
}

/**
 * Generates `games` games as PGN text chunks. `style`: lichess (default), otb or
 * corr. In the database styles ~5% of the games are exact repeats of an earlier
 * one with the player names re-formatted (the same game from two collections).
 */
export function* syntheticPgn({ games, seed, style = "lichess" }) {
  const random = mulberry32(seed);
  const recent = [];
  for (let i = 0; i < games; i += 1) {
    if (style === "lichess") {
      yield formatGame(syntheticGame(random, i), random);
      continue;
    }
    if (recent.length > 20 && random() < 0.05) {
      const original = recent[Math.floor(random() * recent.length)];
      const copy = {
        ...original,
        headers: { ...original.headers, White: nameVariant(random, original.players.white), Black: nameVariant(random, original.players.black) },
      };
      yield formatGame(copy, random);
      continue;
    }
    const game = databaseGame(random, i, style);
    recent.push(game);
    if (recent.length > 200) {
      recent.shift();
    }
    yield formatGame(game, random);
  }
}

function main() {
  const argv = process.argv.slice(2);
  const value = (flag, fallback) => {
    const at = argv.indexOf(flag);
    return at >= 0 ? Number(argv[at + 1]) : fallback;
  };
  const styleAt = argv.indexOf("--style");
  const style = styleAt >= 0 ? argv[styleAt + 1] : "lichess";
  for (const chunk of syntheticPgn({ games: value("--games", 50000), seed: value("--seed", 1226), style })) {
    process.stdout.write(chunk);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}
