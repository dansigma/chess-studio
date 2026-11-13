// SIG-1315: /studio?broadcast=<roundId>:<gameId>&ply=<n> loads the round PGN and opens the game.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { beforeEach, test } from "node:test";
import { exportPgn } from "../chess/pgn.ts";
import { getFenAt } from "../chess/tree.ts";
import { useStudioStore, emptyBoard } from "../store/studio-store.ts";
import { applyStudioEntryImport } from "./entry-import.ts";

const ROUND_PGN = readFileSync(new URL("../lib/live/fixtures/round.pgn", import.meta.url), "utf8");
const ROUND = "djmeJZUw";
const ARONIAN = "IoIVJ0i3"; // 1. e4 c5 2. Nf3 d6 ... 23. Nf3 1/2-1/2

const location = { pathname: "/studio", search: "", hash: "" };
const replaced: string[] = [];
(globalThis as { window?: unknown }).window = {
  location,
  history: {
    state: null,
    replaceState: (_state: unknown, _title: string, url: string) => {
      replaced.push(url);
      const query = url.indexOf("?");
      location.search = query >= 0 ? url.slice(query) : "";
    },
  },
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
};

const fetched: string[] = [];
let respond: () => Promise<Response> = async () => new Response(ROUND_PGN, { status: 200 });
globalThis.fetch = (async (input: string | URL) => {
  fetched.push(String(input));
  return respond();
}) as typeof fetch;

beforeEach(() => {
  replaced.length = 0;
  fetched.length = 0;
  respond = async () => new Response(ROUND_PGN, { status: 200 });
  const placeholder = emptyBoard("Posição inicial");
  useStudioStore.setState((state) => ({
    boards: [placeholder],
    activeBoardId: placeholder.id,
    statusMessage: null,
    settings: { ...state.settings, locale: "en" },
  }));
});

function open(search: string) {
  location.search = search;
  return applyStudioEntryImport(search);
}

test("the link opens the right game of the round on a new board, at the linked ply", async () => {
  await open(`?broadcast=${ROUND}:${ARONIAN}&ply=4`);
  assert.equal(fetched.length, 1);
  assert.match(fetched[0]!, new RegExp(`/api/broadcast/round/${ROUND}\\.pgn`));
  const { boards } = useStudioStore.getState();
  assert.equal(boards.length, 2);
  const board = useStudioStore.getState().active();
  assert.equal(board.title, "Aronian, Levon vs Hong, Andrew");
  assert.equal(board.path.length, 4);
  assert.equal(getFenAt(board.tree, board.path), "rnbqkbnr/pp2pppp/3p4/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 3");
  assert.equal(board.headers.Event, "Total Chess World Championship Tour Pilot 2026 | Group Stage | Combined");
  assert.equal(board.headers.Site, `https://lichess.org/broadcast/total-chess-world-championship-tour-pilot-2026-group-stage-combined/round-3/${ROUND}`);
  assert.equal(board.headers.White, "Aronian, Levon");
  assert.equal(board.headers.WhiteElo, "2719");
  assert.equal(board.headers.WhiteTitle, "GM");
  assert.equal(board.headers.BlackElo, "2609");
  assert.equal(board.headers.BlackTitle, "GM");
  assert.equal(board.headers.Result, "1/2-1/2");
  assert.match(exportPgn(board.tree, board.headers), /23\. Nf3/);
  assert.equal(useStudioStore.getState().statusMessage, null);
});

test("without ply the game opens at its last known move", async () => {
  await open(`?broadcast=${ROUND}:${ARONIAN}`);
  const board = useStudioStore.getState().active();
  assert.equal(board.path.length, 45);
});

test("the link params are cleared after use, keeping the rest of the URL", async () => {
  await open(`?broadcast=${ROUND}:${ARONIAN}&ply=4&view=library`);
  assert.deepEqual(replaced, ["/studio?view=library"]);
  assert.equal(location.search, "?view=library");
});

test("a failed fetch keeps the Studio as it was and shows a status message", async () => {
  respond = async () => new Response("", { status: 429 });
  await open(`?broadcast=${ROUND}:${ARONIAN}&ply=4`);
  assert.equal(useStudioStore.getState().boards.length, 1);
  assert.equal(useStudioStore.getState().statusMessage, "Could not load that broadcast game from Lichess.");
  assert.deepEqual(replaced, ["/studio"]);
});

test("a game that isn't in the round shows the status message (pt-BR)", async () => {
  useStudioStore.setState((state) => ({ settings: { ...state.settings, locale: "pt-br" } }));
  await open(`?broadcast=${ROUND}:nope`);
  assert.equal(useStudioStore.getState().boards.length, 1);
  assert.equal(useStudioStore.getState().statusMessage, "Não foi possível carregar essa partida da transmissão do Lichess.");
});

test("a network error shows the status message", async () => {
  respond = async () => {
    throw new TypeError("network");
  };
  await open(`?broadcast=${ROUND}:${ARONIAN}`);
  assert.equal(useStudioStore.getState().boards.length, 1);
  assert.ok(useStudioStore.getState().statusMessage);
});

test("a malformed link is ignored: no request, the URL is left alone", async () => {
  await open("?broadcast=nogame");
  assert.equal(fetched.length, 0);
  assert.deepEqual(replaced, []);
  assert.equal(useStudioStore.getState().boards.length, 1);
});
