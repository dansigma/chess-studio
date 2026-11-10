// SIG-1270: Chess.com has no shared games database, so the Databases sidebar
// must not list it, and its source count must match the rows shown.
import { after, afterEach, before, test } from "node:test";
import assert from "node:assert/strict";
import { setupDom, teardownDom } from "../test-utils/dom.ts";
import { act, cleanup, render, screen } from "@testing-library/react";
import { DatabasesSidebar } from "./DatabasesSidebar";
import { useStudioStore } from "@/src/store/studio-store";

before(() => {
  setupDom();
});

afterEach(() => {
  cleanup();
  useStudioStore.setState({ databaseSource: "masters" });
});

after(() => {
  teardownDom();
});

test("lists only the three public sources, without Chess.com, and counts them", async () => {
  useStudioStore.setState({ databaseSource: "masters" });
  await act(async () => {
    render(<DatabasesSidebar />);
  });
  assert.equal(screen.queryByText(/Chess\.com/), null);
  assert.equal(screen.queryByText(/Published games of the open player/), null);
  assert.ok(screen.getByText(/3 sources/));
});

test("a stale chesscom databaseSource renders without error and selects no row", async () => {
  useStudioStore.setState({ databaseSource: "chesscom" });
  await act(async () => {
    render(<DatabasesSidebar />);
  });
  assert.equal(screen.queryByText(/Chess\.com/), null);
  assert.ok(screen.getByText(/3 sources/));
});
