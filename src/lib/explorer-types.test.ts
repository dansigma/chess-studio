import assert from "node:assert/strict";
import test from "node:test";
import {
  isCloudExplorerSource,
  isExplorerResponse,
  isExplorerSource,
  explorerSourceTitle,
  explorerGamesTitle,
  type ExplorerResponse,
} from "./explorer-types.ts";
import { parseExplorerSource } from "../studio/ExplorerPanel.tsx";
import { toJson } from "./supabase/database.types.ts";

const valid: ExplorerResponse = {
  source: "lichess",
  fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  white: 10,
  draws: 5,
  black: 8,
  opening: { eco: "A00", name: "Start" },
  moves: [
    { san: "e4", uci: "e2e4", games: 10, white: 5, draws: 2, black: 3, averageRating: null },
  ],
  games: [],
};

test("isExplorerResponse accepts a valid payload", () => {
  assert.equal(isExplorerResponse(valid), true);
});

test("isExplorerResponse rejects non-objects and mistyped fields", () => {
  assert.equal(isExplorerResponse(null), false);
  assert.equal(isExplorerResponse({}), false);
  assert.equal(isExplorerResponse({ ...valid, moves: "nope" }), false);
  assert.equal(isExplorerResponse({ ...valid, moves: [{ san: 1, uci: "e2e4", games: 1 }] }), false);
  assert.equal(isExplorerResponse({ ...valid, white: "10" }), false);
  // Move rows missing the ResultBar fields must not pass.
  assert.equal(
    isExplorerResponse({ ...valid, moves: [{ san: "e4", uci: "e2e4", games: 10 }] }),
    false,
  );
  assert.equal(
    isExplorerResponse({
      ...valid,
      moves: [{ ...valid.moves[0], averageRating: "2400" }],
    }),
    false,
  );
  // Opening badge fields must be valid when present.
  assert.equal(isExplorerResponse({ ...valid, opening: { eco: "A00" } }), false);
  assert.equal(isExplorerResponse({ ...valid, opening: null }), true);
  // Game rows are validated too.
  assert.equal(
    isExplorerResponse({
      ...valid,
      games: [{ id: "g1", winner: "white" }],
    }),
    false,
  );
  assert.equal(
    isExplorerResponse({
      ...valid,
      games: [
        {
          id: "g1",
          winner: "white",
          whiteName: "A",
          whiteRating: null,
          blackName: "B",
          blackRating: null,
          year: 2020,
          month: 1,
          event: null,
          eco: "A00",
          opening: null,
        },
      ],
    }),
    true,
  );
});

test("toJson round-trips explorer payloads through JSON", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(toJson(valid))), valid);
});

test("toJson mirrors JSON.stringify edge cases", () => {
  assert.deepEqual(toJson({ a: undefined, b: 1 }), { b: 1 });
  assert.deepEqual(toJson({ fn: () => 1, sym: Symbol("s"), b: 1 }), { b: 1 });
  assert.equal(toJson(Number.NaN), null);
  assert.equal(toJson(10n), "10");
});

test("curated source is recognized by parser, guards, and titles", () => {
  assert.equal(parseExplorerSource("curated"), "curated");
  assert.equal(isExplorerSource("curated"), true);
  assert.equal(isCloudExplorerSource("curated"), false);
  assert.equal(explorerSourceTitle("curated", []), "Curated Masters");
  assert.equal(explorerSourceTitle("curated", [], "pt-br"), "Mestres selecionados");
  assert.equal(explorerSourceTitle("lichess", []), "Online Database");
  assert.equal(explorerSourceTitle("lichess", [], "pt-br"), "Base de dados online");
  assert.equal(explorerSourceTitle("masters", []), "Opening Explorer");
  assert.equal(explorerSourceTitle("masters", [], "pt-br"), "Explorador de Abertura");
  assert.equal(explorerSourceTitle("chesscom", []), "Chess.com");
  assert.equal(explorerSourceTitle("chesscom", [], "pt-br"), "Chess.com");
  assert.equal(
    explorerSourceTitle("file:abc", [{ id: "abc", name: "Minha base" }], "pt-br"),
    "Minha base",
  );
  assert.equal(explorerSourceTitle("file:missing", [], "pt-br"), "Pessoal");
  assert.equal(explorerGamesTitle("curated", []), "Curated");
  assert.equal(explorerGamesTitle("curated", [], "pt-br"), "Selecionados");
  assert.equal(explorerGamesTitle("masters", [], "pt-br"), "Partidas");
  assert.equal(explorerGamesTitle("lichess", [], "pt-br"), "Online");

  const curatedResponse: ExplorerResponse = {
    ...valid,
    source: "curated",
  };
  assert.equal(isExplorerResponse(curatedResponse), true);
});
