import assert from "node:assert/strict";
import test, { mock } from "node:test";
import * as realUserFiles from "@/src/lib/user-files.ts";

const persistCalls: Array<[realUserFiles.FileDatabase, string]> = [];
mock.module("@/src/lib/user-files.ts", {
  namedExports: {
    ...realUserFiles,
    persistRemoteDatabase: async (database: realUserFiles.FileDatabase, userId: string) => {
      persistCalls.push([database, userId]);
      return { remoteId: "r1", indexError: null, saveError: null };
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

test("signed in: the full new list goes to persistRemoteDatabase with the same remote id", async () => {
  useStudioStore.setState((s) => ({ files: { ...s.files, databases: [db("a", "r1")] }, user: { id: "u1" } as never }));
  useStudioStore.getState().replaceFileDatabaseGames("a", [game("n1"), game("n2")]);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(persistCalls.length, 1);
  const [database, userId] = persistCalls[0];
  assert.equal(database.id, "a");
  assert.equal(database.remoteId, "r1");
  assert.deepEqual(database.games.map((x) => x.id), ["n1", "n2"]);
  assert.equal(userId, "u1");
  useStudioStore.setState({ user: null });
});
