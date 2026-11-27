// SIG-1403: opening a game from the Library switches to the Studio board and
// honours an active position filter.
import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import { DEFAULT_LIBRARY_FILTERS, type LibraryGameItem, type LibrarySourceAdapter } from "@/src/lib/library/types.ts";

const PGN = '[Event "Test"]\n[White "Carlsen"]\n[Black "Caruana"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 1-0';
const FEN = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";

const ITEM: LibraryGameItem = {
  key: "my-games:1", sourceId: "my-games", gameId: "1",
  white: "Carlsen", whiteElo: 2850, black: "Caruana", blackElo: 2800,
  result: "1-0", eco: "C65", opening: "Berlin Defence", plyCount: null, event: null, date: "2020",
};

// The adapter outcome is swapped per test; the source registry is mocked so the
// test never touches a real Library source.
let adapter: LibrarySourceAdapter;
const getLibrarySource = mock.fn(() => adapter);
const openBoardPanel = mock.fn();
mock.module("@/src/lib/library/sources", { namedExports: { getLibrarySource } });
mock.module("@/src/studio/dock-api", { namedExports: { openBoardPanel } });

const { openLibraryGame, saveLibraryGameToDatabase } = await import("./open-library-game.ts");
const { useLibraryStore } = await import("./library-store.ts");
const { useStudioStore } = await import("@/src/store/studio-store.ts");

const originalOpenFileGame = useStudioStore.getState().openFileGame;
const openFileGame = mock.fn();

beforeEach(() => {
  adapter = {
    id: "my-games",
    loadPgn: async () => PGN,
  } as unknown as LibrarySourceAdapter;
  getLibrarySource.mock.resetCalls();
  openBoardPanel.mock.resetCalls();
  openFileGame.mock.resetCalls();
  useLibraryStore.setState({ filters: DEFAULT_LIBRARY_FILTERS });
  useStudioStore.setState({
    workspaceView: "library",
    statusMessage: null,
    openFileGame: openFileGame as unknown as typeof originalOpenFileGame,
  });
});

afterEach(() => {
  useLibraryStore.setState({ filters: DEFAULT_LIBRARY_FILTERS });
  useStudioStore.setState({ openFileGame: originalOpenFileGame, statusMessage: null });
});

test("opening a game switches to the Studio board and opens its panel", async () => {
  await openLibraryGame(ITEM, "en");

  assert.equal(useStudioStore.getState().workspaceView, "studio");
  assert.equal(openFileGame.mock.callCount(), 1);
  const [, options] = openFileGame.mock.calls[0]!.arguments as [unknown, Record<string, unknown>];
  assert.deepEqual(options, { openInNewBoard: true });
  assert.equal(openBoardPanel.mock.callCount(), 1);
  assert.equal(useStudioStore.getState().statusMessage, null);
});

test("an active position filter opens the board at the searched FEN", async () => {
  useLibraryStore.setState({
    filters: { ...DEFAULT_LIBRARY_FILTERS, position: { fen: FEN } },
  });

  await openLibraryGame(ITEM, "en");

  assert.equal(useStudioStore.getState().workspaceView, "studio");
  const [, options] = openFileGame.mock.calls[0]!.arguments as [unknown, Record<string, unknown>];
  assert.deepEqual(options, { openInNewBoard: true, atFen: FEN });
});

test("a failed load stays in the Library and reports the error", async () => {
  adapter = {
    id: "my-games",
    loadPgn: async () => {
      throw new Error("boom");
    },
  } as unknown as LibrarySourceAdapter;

  await openLibraryGame(ITEM, "en");

  assert.equal(useStudioStore.getState().workspaceView, "library");
  assert.match(useStudioStore.getState().statusMessage ?? "", /boom/);
  assert.equal(openFileGame.mock.callCount(), 0);
  assert.equal(openBoardPanel.mock.callCount(), 0);
});

test("a PGN that loads while the dialog is open does not replace its game", async () => {
  await saveLibraryGameToDatabase(ITEM, "en");
  adapter = { id: "my-games", loadPgn: async () => "1. d4 *" } as unknown as LibrarySourceAdapter;
  await saveLibraryGameToDatabase(ITEM, "en");

  assert.equal(useStudioStore.getState().addToDatabasePgn, PGN);
  assert.equal(useStudioStore.getState().workspaceView, "library");
  useStudioStore.getState().setAddToDatabaseOpen(false);
});

test("a failed PGN load reports the error and opens no dialog", async () => {
  adapter = { id: "my-games", loadPgn: async () => { throw new Error("offline"); } } as unknown as LibrarySourceAdapter;
  await saveLibraryGameToDatabase(ITEM, "en");

  assert.equal(useStudioStore.getState().addToDatabaseOpen, false);
  assert.match(useStudioStore.getState().statusMessage ?? "", /offline/);
});

test("personal Library games open with the stored game identity and database link", async () => {
  const initial = useStudioStore.getState();
  const id = initial.importFileDatabase("Personal", PGN);
  const game = useStudioStore.getState().files.databases.find((database) => database.id === id)!.games[0];
  useStudioStore.setState({ openFileGame: originalOpenFileGame });
  try {
    await openLibraryGame({ ...ITEM, sourceId: `file:${id}`, gameId: game.id }, "en");
    const board = useStudioStore.getState().active();
    assert.equal(board.sourceDatabaseId, id);
    assert.equal(board.sourceGameId, game.id);
    assert.equal(getLibrarySource.mock.callCount(), 0);
  } finally {
    useStudioStore.setState({ files: initial.files, boards: initial.boards, activeBoardId: initial.activeBoardId });
  }
});
