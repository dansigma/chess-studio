import assert from "node:assert/strict";
import test, { mock } from "node:test";
import * as realUserFiles from "@/src/lib/user-files.ts";

const uploads: string[][] = [];
mock.module("@/src/lib/user-files.ts", {
  namedExports: {
    ...realUserFiles,
    persistRemoteDatabase: async (database: realUserFiles.FileDatabase) => {
      uploads.push(database.games.map(({ id }) => id));
      return { remoteId: "uploaded", indexError: null, saveError: null };
    },
  },
});
const { useStudioStore } = await import("../studio-store.ts");

const game = (id: string) => ({ id, white: "A", black: "B", result: "1-0", event: "", date: "", pgn: "1. e4 e5", title: "" });

for (const { ids, expectedUploads } of [
  { ids: ["b", "a"], expectedUploads: [] },
  { ids: ["c", "d"], expectedUploads: [["c", "d"]] },
]) {
  test(`sign-in upload with local game IDs ${ids.join(", ")}`, async () => {
    uploads.length = 0;
    const local = { id: "local", remoteId: null, name: "Library", folderId: null, games: ids.map(game) };
    const account = { ...local, id: "remote", remoteId: "remote", games: ["a", "b"].map(game) };
    useStudioStore.setState({
      files: { folders: [], databases: [local] },
      filesHydrated: true,
      user: { id: "account", email: null },
    });

    await useStudioStore.getState().uploadLocalDatabases({ folders: [], databases: [account] });

    assert.deepEqual(uploads, expectedUploads);
  });
}
