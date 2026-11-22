import assert from "node:assert/strict";
import test from "node:test";
import { teardownDom } from "../../test-utils/dom.ts";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useStudioStore } from "@/src/store/studio-store";
import { REFERENCE_SOURCE_KEY } from "./reference-source";
import { useReferenceSourcePersistence } from "./use-reference-source-persistence";

test("Explorer restores the saved file source after the Library hydrates", (t) => {
  t.after(() => {
    cleanup();
    teardownDom();
  });
  window.localStorage.setItem(REFERENCE_SOURCE_KEY, "file:library-db");
  useStudioStore.setState({ databaseSource: "lichess", filesHydrated: false });
  renderHook(useReferenceSourcePersistence);
  act(() => useStudioStore.getState().setDatabaseSource("masters"));
  assert.equal(window.localStorage.getItem(REFERENCE_SOURCE_KEY), "file:library-db");

  act(() => useStudioStore.setState({
    files: { folders: [], databases: [{ id: "library-db", name: "Library", folderId: null, remoteId: null, games: [] }] },
    filesHydrated: true,
  }));
  assert.equal(useStudioStore.getState().databaseSource, "file:library-db");
  act(() => useStudioStore.getState().setDatabaseSource("lichess"));
  assert.equal(window.localStorage.getItem(REFERENCE_SOURCE_KEY), "lichess");
});
