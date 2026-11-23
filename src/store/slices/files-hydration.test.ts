import assert from "node:assert/strict";
import test, { mock } from "node:test";
import * as realUserFiles from "@/src/lib/user-files.ts";

let pendingRead: Promise<realUserFiles.FilesLibrary>;
const writes: realUserFiles.FilesLibrary[] = [];
const load = mock.fn(() => pendingRead);
mock.module("@/src/lib/user-files.ts", {
  namedExports: {
    ...realUserFiles,
    loadLocalFiles: load,
    saveLocalFiles: async (files: realUserFiles.FilesLibrary) => {
      writes.push(files);
      return true;
    },
  },
});
const { useStudioStore } = await import("../studio-store.ts");
const game = { id: "game", white: "A", black: "B", result: "1-0", event: "", date: "", pgn: "1. e4 e5", title: "" };

test("early Library changes survive a shared hydration and are written once after the read", async () => {
  const { promise, resolve } = Promise.withResolvers<realUserFiles.FilesLibrary>();
  pendingRead = promise;
  const hydration = useStudioStore.getState().hydrateLocalFiles();
  assert.equal(useStudioStore.getState().hydrateLocalFiles(), hydration);

  useStudioStore.getState().createFileFolder("Session folder");
  const folderId = useStudioStore.getState().files.folders[0].id;
  const databaseId = useStudioStore.getState().importParsedDatabase("Session database", [game], folderId);
  useStudioStore.setState({ activeFileGameId: game.id });
  assert.equal(writes.length, 0);

  const storedDatabase = { id: "stored", name: "Stored database", remoteId: null, folderId: null, games: [] };
  resolve({
    folders: [{ id: folderId, name: "Old name", parentId: null }],
    databases: [storedDatabase, { ...storedDatabase, id: databaseId }],
  });
  await hydration;

  const state = useStudioStore.getState();
  assert.equal(load.mock.callCount(), 1);
  assert.equal(state.filesHydrated, true);
  assert.deepEqual(state.files.folders, [{ id: folderId, name: "Session folder", parentId: null }]);
  assert.deepEqual(state.files.databases, [
    storedDatabase,
    { id: databaseId, name: "Session database", remoteId: null, folderId, games: [game] },
  ]);
  assert.equal(state.activeFileDatabaseId, databaseId);
  assert.equal(state.activeFileGameId, game.id);
  assert.deepEqual(writes, [state.files]);
});

test("a rejected read retains session databases, reports the failure and finishes hydration", async () => {
  const { promise, reject } = Promise.withResolvers<realUserFiles.FilesLibrary>();
  pendingRead = promise;
  writes.length = 0;
  useStudioStore.setState((state) => ({
    files: realUserFiles.EMPTY_FILES,
    filesHydrated: false,
    settings: { ...state.settings, locale: "pt-br" },
  }));
  const hydration = useStudioStore.getState().hydrateLocalFiles();
  const databaseId = useStudioStore.getState().importParsedDatabase("Session database", [game]);
  useStudioStore.setState({ activeFileGameId: "missing" });
  reject(new Error("IndexedDB unavailable"));
  await hydration;

  const state = useStudioStore.getState();
  assert.equal(state.filesHydrated, true);
  assert.equal(state.statusMessage, "Não foi possível carregar sua biblioteca local.");
  assert.equal(state.files.databases[0]?.id, databaseId);
  assert.equal(state.activeFileGameId, null);
  assert.deepEqual(writes, [state.files]);
});
