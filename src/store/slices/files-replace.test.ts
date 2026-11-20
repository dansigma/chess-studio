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
