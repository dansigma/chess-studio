import assert from "node:assert/strict";
import test, { mock } from "node:test";
import * as realUserFiles from "@/src/lib/user-files.ts";

const writes: Array<[string, string, string]> = [];
mock.module("@/src/lib/user-files.ts", {
  namedExports: {
    ...realUserFiles,
    persistRemoteDatabase: async () => assert.fail("A synced database must not use the initial upload"),
    deleteRemoteGame: async (remoteId: string, game: realUserFiles.FileGame) => {
      writes.push(["delete", remoteId, game.id]);
      return null;
    },
    updateRemoteGame: async (remoteId: string, game: realUserFiles.FileGame) => {
      writes.push(["update", remoteId, game.id]);
      return null;
    },
    insertRemoteGame: async (remoteId: string, game: realUserFiles.FileGame) => {
      writes.push(["insert", remoteId, game.id]);
      return null;
    },
  },
});
const { useStudioStore } = await import("../studio-store.ts");

const game = (id: string) => ({ id, white: "A", black: "B", result: "1-0", event: "", date: "", pgn: "1. e4 e5", title: "" });
const db = (id: string, remoteId: string | null = null) => ({ id, remoteId, name: id, folderId: null, games: [game("old")] });

test("replaceFileDatabaseGames swaps the games, keeps id and position", () => {
  useStudioStore.setState((s) => ({ files: { ...s.files, databases: [db("a"), db("b")] }, user: null, activeFileDatabaseId: "a", activeFileGameId: "old" }));
  const ok = useStudioStore.getState().replaceFileDatabaseGames("a", [game("n1"), game("n2")]);
  assert.equal(ok, true);
  const { databases } = useStudioStore.getState().files;
  assert.deepEqual(databases.map((d) => d.id), ["a", "b"]);
  assert.deepEqual(databases[0].games.map((x) => x.id), ["n1", "n2"]);
  assert.equal(databases[1].games.length, 1);
  assert.equal(useStudioStore.getState().activeFileGameId, null);
  assert.match(useStudioStore.getState().statusMessage ?? "", /2 games/);
});

test("replaceFileDatabaseGames ignores an unknown id", () => {
  useStudioStore.setState((s) => ({ files: { ...s.files, databases: [db("a")] }, user: null }));
  assert.equal(useStudioStore.getState().replaceFileDatabaseGames("zzz", []), false);
});

test("signed in: replacing games applies only the changes to the same remote database", async () => {
  const unchanged = game("keep");
  const database = { ...db("a", "r1"), games: [game("old"), unchanged] };
  useStudioStore.setState((s) => ({
    files: { ...s.files, databases: [database] },
    user: { id: "u1", email: null },
  }));
  useStudioStore.getState().replaceFileDatabaseGames("a", [unchanged, game("new")]);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(writes, [
    ["delete", "r1", "old"],
    ["insert", "r1", "new"],
  ]);
  useStudioStore.setState({ user: null });
});

test("updating and deleting a single game syncs by id and unlinks each open copy", async () => {
  writes.length = 0;
  const unchanged = game("keep");
  const database = { ...db("a", "r1"), games: [game("old"), unchanged] };
  useStudioStore.setState({
    files: { folders: [], databases: [database] },
    user: { id: "u1", email: null },
  });
  const store = useStudioStore.getState;
  store().openFileGame(database.games[0]);
  const first = store().active();
  store().openFileGame(database.games[0], { openInNewBoard: true });
  const second = store().active();
  assert.equal(first.sourceDatabaseId, "a");
  assert.equal(second.sourceGameId, "old");

  const pgn = '[Event "Final"]\n[Date "2025.03.01"]\n[White "Alice"]\n[Black "Bob"]\n[Result "0-1"]\n\n1. d4 d5 0-1';
  assert.equal(store().updateFileGame("a", "old", "bad pgn"), false);
  assert.equal(store().updateFileGame("a", "old", pgn), true);
  const updated = store().files.databases[0].games[0];
  assert.deepEqual(updated, {
    id: "old", pgn, white: "Alice", black: "Bob", event: "Final", date: "2025.03.01",
    result: "0-1", title: "Alice vs Bob",
  });
  assert.equal(store().activeFileGameId, "old");

  assert.equal(store().deleteFileGame("a", "old"), true);
  assert.equal(store().deleteFileGame("a", "old"), false);
  assert.deepEqual(store().files.databases[0].games, [unchanged]);
  assert.equal(store().activeFileGameId, null);
  for (const original of [first, second]) {
    const board = store().boards.find((entry) => entry.id === original.id);
    assert.equal(board?.tree, original.tree);
    assert.equal(board?.sourceDatabaseId, undefined);
    assert.equal(board?.sourceGameId, undefined);
  }
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(writes, [["update", "r1", "old"], ["delete", "r1", "old"]]);
  useStudioStore.setState({ user: null });
});

test("importing a PGN clears the active board's personal game link", () => {
  const database = db("a");
  useStudioStore.setState({ files: { folders: [], databases: [database] } });
  const store = useStudioStore.getState;
  store().openFileGame(database.games[0]);
  assert.equal(store().active().sourceGameId, "old");
  store().importPgnText("1. d4 *");
  assert.equal(store().active().sourceDatabaseId, undefined);
  assert.equal(store().active().sourceGameId, undefined);
});
