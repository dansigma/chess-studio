import assert from "node:assert/strict";
import test, { beforeEach, mock } from "node:test";
import * as userFiles from "@/src/lib/user-files.ts";

const ONE_GAME = '[White "Alpha"]\n[Black "Beta"]\n\n1. e4 e5 *';
const TWO_GAMES = ONE_GAME + '\n\n[White "Gamma"]\n[Black "Delta"]\n\n1. d4 d5 *';

const persistRemoteDatabase = mock.fn(async () => ({
  remoteId: "uploaded", indexError: null, saveError: null,
}));
mock.module("@/src/lib/user-files.ts", {
  namedExports: { ...userFiles, persistRemoteDatabase },
});

const { selectActiveBoard, useStudioStore } = await import("../studio-store.ts");
const initialState = useStudioStore.getState();

beforeEach(() => {
  useStudioStore.setState(initialState, true);
  useStudioStore.setState({ settings: { ...initialState.settings, locale: "en" } });
  persistRemoteDatabase.mock.resetCalls();
});

for (const name of ["Club Match", "Clipboard"]) {
  test(`opening one game from ${name} loads the board without saving a database`, async () => {
    useStudioStore.setState({ user: { id: "account", email: null } });
    const files = useStudioStore.getState().files;

    assert.equal(useStudioStore.getState().openPgnSource(name, ONE_GAME), "board");
    const state = useStudioStore.getState();
    assert.equal(selectActiveBoard(state).headers.White, "Alpha");
    assert.deepEqual(selectActiveBoard(state).path, [0, 0]);
    assert.equal(state.files, files);
    assert.equal(state.activeFileDatabaseId, null);
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(persistRemoteDatabase.mock.callCount(), 0);
  });
}

test("opening two games saves and selects a database and reports slot usage", () => {
  const store = useStudioStore.getState();
  store.importFileDatabase("Existing", ONE_GAME);

  assert.equal(store.openPgnSource("Club Match", TWO_GAMES), "database");
  const state = useStudioStore.getState();
  const database = state.files.databases[1];
  assert.equal(state.files.databases.length, 2);
  assert.equal(database.name, "Club Match");
  assert.equal(database.games.length, 2);
  assert.equal(state.activeFileDatabaseId, database.id);
  assert.equal(selectActiveBoard(state).headers.White, "Alpha");
  assert.equal(state.statusMessage, 'Saved to My files as "Club Match" (2/10 databases)');
});

test("at the database limit a multi-game PGN opens on the board with a localized limit message", () => {
  const store = useStudioStore.getState();
  for (let i = 0; i < userFiles.MAX_DATABASES; i += 1) {
    store.importFileDatabase(`Database ${i + 1}`, ONE_GAME);
  }
  const { files, activeFileDatabaseId, settings } = useStudioStore.getState();
  useStudioStore.setState({ settings: { ...settings, locale: "pt-br" } });

  assert.equal(store.openPgnSource("Club Match", TWO_GAMES), "board");
  const state = useStudioStore.getState();
  assert.equal(state.files, files);
  assert.equal(state.activeFileDatabaseId, activeFileDatabaseId);
  assert.equal(selectActiveBoard(state).headers.White, "Alpha");
  assert.equal(state.statusMessage, "Você atingiu o limite de 10 bases pessoais. Exclua uma base na Biblioteca para abrir este arquivo como uma base.");
});

test("an unreadable PGN leaves the board and library intact", () => {
  const { boards, files, openPgnSource } = useStudioStore.getState();

  assert.equal(openPgnSource("Unreadable", "   "), "failed");
  const state = useStudioStore.getState();
  assert.equal(state.boards, boards);
  assert.equal(state.files, files);
  assert.equal(state.statusMessage, "Could not open that PGN.");
});

test("openPgnSource keeps the games-quota message importFileDatabase reported", () => {
  const gamesQuota = "This database holds more than 25,000 games. Remove some games and try again.";
  useStudioStore.setState({
    importFileDatabase: () => {
      useStudioStore.setState({ statusMessage: gamesQuota });
      return "";
    },
  });

  assert.equal(useStudioStore.getState().openPgnSource("Huge", TWO_GAMES), "board");
  assert.equal(useStudioStore.getState().statusMessage, gamesQuota);
});

test("createFileDatabase saves an empty database in the target folder and syncs it", async () => {
  const { createFileDatabase, createFileFolder, settings } = useStudioStore.getState();
  createFileFolder("Club");
  useStudioStore.setState({ user: { id: "account", email: null }, settings: { ...settings, locale: "pt-br" } });
  const folderId = useStudioStore.getState().files.folders[0].id;

  const id = createFileDatabase("  Empty club database  ", folderId);
  assert.ok(id);
  const state = useStudioStore.getState();
  const database = { id, remoteId: null, name: "Empty club database", folderId, games: [] };
  assert.deepEqual(state.files.databases, [database]);
  assert.equal(state.activeFileDatabaseId, id);
  assert.equal(state.activeFileGameId, null);
  assert.equal(state.statusMessage, "Base “Empty club database” criada");

  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(persistRemoteDatabase.mock.callCount(), 1);
  assert.equal(useStudioStore.getState().files.databases[0].remoteId, "uploaded");
});

test("createFileDatabase rejects blank names and enforces the personal database quota", () => {
  const { createFileDatabase } = useStudioStore.getState();
  assert.equal(createFileDatabase("  ", null), "");
  for (let i = 0; i < userFiles.MAX_DATABASES; i += 1) {
    assert.ok(createFileDatabase(`Database ${i + 1}`, null));
  }
  const { files } = useStudioStore.getState();
  assert.equal(files.databases.length, userFiles.MAX_DATABASES);
  assert.equal(createFileDatabase("Over quota", null), "");
  assert.equal(useStudioStore.getState().files, files);
  assert.match(useStudioStore.getState().statusMessage ?? "", /up to 10 personal databases/);
});
