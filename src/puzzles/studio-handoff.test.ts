import assert from "node:assert/strict";
import { test } from "node:test";
import { Chess } from "chess.js";
import { importPgn } from "../chess/pgn.ts";
import { mainlinePathForFen } from "../chess/tree.ts";
import { compilePuzzle } from "./engine";
import {
  buildPuzzlePgn,
  buildPuzzleStudioImport,
  lichessPuzzleUrl,
  openPuzzleInStudio,
} from "./studio-handoff";

const WHITE = compilePuzzle({
  id: "00sHx",
  fen: "6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1",
  moves: ["Re8#"],
  rating: 800,
  themes: ["mate"],
});
// Black to move, three plies: solver, reply, solver.
const BLACK = compilePuzzle({
  id: "mx-h-6162",
  fen: "r3k3/8/8/8/8/8/6PP/R5K1 b - - 3 17",
  moves: ["Rxa1+", "Kf2", "Ra2+"],
  rating: 1500,
  themes: [],
});

test("lichessPuzzleUrl links only 5-char Lichess ids", () => {
  assert.equal(lichessPuzzleUrl("00sHx"), "https://lichess.org/training/00sHx");
  assert.equal(lichessPuzzleUrl("queen-corridor"), null);
  assert.equal(lichessPuzzleUrl("mx-h-6162"), null);
  assert.equal(lichessPuzzleUrl("abcd"), null);
  assert.equal(lichessPuzzleUrl(""), null);
});

test("buildPuzzlePgn carries SetUp/FEN headers and the whole line", () => {
  const pgn = buildPuzzlePgn(WHITE, "Puzzle 00sHx");
  assert.ok(pgn);
  assert.match(pgn, /\[SetUp "1"\]/);
  assert.match(pgn, new RegExp(`\\[FEN "${WHITE.fen.replace(/[/]/g, "\\/")}"\\]`));
  assert.match(pgn, /1\. Re8# \*$/);
});

test("buildPuzzlePgn numbers a black-to-move line from the stored move number", () => {
  const pgn = buildPuzzlePgn(BLACK, "x");
  assert.ok(pgn);
  assert.match(pgn, /17\.\.\. Rxa1\+ 18\. Kf2 Ra2\+ \*$/);
});

test("the PGN opens in the Studio at the start FEN with the line as main line", () => {
  const payload = buildPuzzleStudioImport(BLACK, "rated", "en");
  assert.ok(payload);
  const imported = importPgn(payload.pgn);
  assert.equal(imported.tree.startFen, new Chess(BLACK.fen).fen());
  assert.deepEqual(mainlinePathForFen(imported.tree, payload.atFen), []);
  const line: string[] = [];
  let node = imported.tree.children[0];
  while (node) {
    line.push(node.uci);
    node = node.children[0];
  }
  assert.deepEqual(line, BLACK.uci);
});

test("titles are localized and mistakes get their own title", () => {
  assert.equal(buildPuzzleStudioImport(WHITE, "rated", "en")?.title, "Puzzle 00sHx");
  assert.equal(buildPuzzleStudioImport(WHITE, "rated", "pt-br")?.title, "Problema 00sHx");
  assert.equal(buildPuzzleStudioImport(BLACK, "mistakes", "en")?.title, "My mistake");
  assert.equal(buildPuzzleStudioImport(BLACK, "mistakes", "pt-br")?.title, "Meu erro");
});

test("an illegal line yields no PGN", () => {
  assert.equal(buildPuzzlePgn({ id: "x", fen: WHITE.fen, sans: ["Qh5"] }, "t"), null);
});

function stubWindow(storage: Map<string, string> | null) {
  Object.defineProperty(globalThis, "window", {
    value: storage
      ? {
          sessionStorage: {
            getItem: (key: string) => storage.get(key) ?? null,
            setItem: (key: string, value: string) => void storage.set(key, value),
            removeItem: (key: string) => void storage.delete(key),
          },
        }
      : {},
    configurable: true,
    writable: true,
  });
  return () => {
    // @ts-expect-error cleanup the node:test DOM stub
    delete globalThis.window;
  };
}

test("openPuzzleInStudio writes the handoff and goes to /studio", () => {
  const store = new Map<string, string>();
  const restore = stubWindow(store);
  try {
    const pushed: string[] = [];
    openPuzzleInStudio(WHITE, "rated", "en", (href) => pushed.push(href), "https://app.test");
    assert.deepEqual(pushed, ["/studio"]);
    const saved = JSON.parse(store.get("chess-studio:course-import") ?? "null");
    assert.equal(saved.title, "Puzzle 00sHx");
    assert.equal(saved.atFen, WHITE.fen);
    assert.match(saved.pgn, /1\. Re8#/);
  } finally {
    restore();
  }
});

test("openPuzzleInStudio falls back to the shared position without storage", () => {
  const restore = stubWindow(null);
  try {
    const pushed: string[] = [];
    openPuzzleInStudio(WHITE, "rated", "en", (href) => pushed.push(href), "https://app.test");
    assert.equal(pushed.length, 1);
    assert.ok(pushed[0].startsWith("https://app.test/studio?fen="));
  } finally {
    restore();
  }
});
