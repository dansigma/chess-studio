import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
  clearSessionBoards,
  loadSessionBoards,
  mergeSessionBoards,
  saveSessionBoards,
  sessionKeyFor,
  type RemoteBoardRow,
} from "./session-boards.ts";
import { useStudioStore } from "../store/studio-store.ts";
import { emptyBoard } from "../store/slices/board-helpers.ts";
import type { BoardSession } from "../store/slices/types.ts";

// SIG-1186 session snapshots: per-user local journal of pending changes plus
// the active board. node --test runs each file in its own process; the window
// stub is installed after the imports so module init sees no browser.
const storage = new Map<string, string>();

(globalThis as { window?: unknown }).window = {
  localStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, String(value));
    },
    removeItem: (key: string) => {
      storage.delete(key);
    },
  },
};

function seedBoard(id: string, overrides: Partial<BoardSession> = {}): BoardSession {
  return { ...emptyBoard(`Board ${id}`, id), ...overrides };
}

beforeEach(() => {
  storage.clear();
});

describe("SIG-1186 session board snapshot", () => {
  it("round-trips boards, cursor, dirty flags, and the active board", async () => {
    const local = seedBoard("board-local", {
      remoteId: null,
      dirty: true,
      repertoireColor: "white",
      orientation: "black",
      title: "Local work",
    });
    // Play a real move so the PGN actually encodes the cursor path —
    // a hand-written path into an empty tree fails closed to [] by design.
    const saved = seedBoard("remote-1", {
      remoteId: "remote-1",
      dirty: true,
      title: "Saved board",
    });
    const { useStudioStore: liveStore } = await import("../store/studio-store.ts");
    useStudioStore.setState({ boards: [local, saved], activeBoardId: "board-local" });
    liveStore.getState().makeUciMove("e2", "e4");
    const played = liveStore.getState().boards.find((board) => board.id === "board-local");
    assert.ok(played && played.path.length > 0, "precondition: the board has moves");
    saveSessionBoards("user-a", liveStore.getState().boards, "remote-1");

    const raw = storage.get(sessionKeyFor("user-a"));
    assert.ok(raw, "session boards are written to localStorage");

    const loaded = loadSessionBoards("user-a");
    assert.ok(loaded, "a stored snapshot hydrates");
    assert.equal(loaded.activeBoardId, "remote-1");
    assert.equal(loaded.boards.length, 2);
    assert.equal(
      loaded.boards.find((board) => board.id === "board-local")?.remoteId,
      null,
      "session-only boards keep their null remoteId",
    );
    assert.equal(
      loaded.boards.find((board) => board.id === "remote-1")?.dirty,
      true,
      "dirty flags survive the snapshot",
    );
    assert.deepEqual(
      loaded.boards.find((board) => board.id === "board-local")?.path,
      played?.path,
      "cursor position survives the snapshot",
    );
    assert.equal(
      loaded.boards.find((board) => board.id === "board-local")?.repertoireColor,
      "white",
    );
    assert.ok(
      loaded.boards.every((board) => board.preview === false),
      "hydrated boards are non-preview sessions",
    );
  });

  it("isolates users and drops preview boards", () => {
    const mine = seedBoard("board-mine", { remoteId: "remote-mine", dirty: true });
    const preview = seedBoard("board-preview", { preview: true });
    saveSessionBoards("user-a", [mine, preview], "board-mine");

    assert.equal(loadSessionBoards("user-b"), null, "a second account sees nothing");
    const loaded = loadSessionBoards("user-a");
    assert.ok(loaded);
    assert.deepEqual(
      loaded.boards.map((board) => board.id),
      ["board-mine"],
      "preview boards are dropped on save",
    );

    clearSessionBoards("user-a");
    assert.equal(loadSessionBoards("user-a"), null, "clear drops the key");
  });

  it("fails closed on corrupt payloads and unknown versions", () => {
    const key = sessionKeyFor("user-a");
    storage.set(key, "not-json{{{");
    assert.equal(loadSessionBoards("user-a"), null);

    storage.set(
      key,
      JSON.stringify({ version: 9999, boards: [], activeBoardId: "x" }),
    );
    assert.equal(loadSessionBoards("user-a"), null);

    storage.set(
      key,
      JSON.stringify({
        version: 1,
        boards: [{ id: "bad", pgn: 42 }],
        activeBoardId: "bad",
      }),
    );
    assert.equal(loadSessionBoards("user-a"), null);

    storage.set(
      key,
      JSON.stringify({
        version: 1,
        boards: [{ id: "ok", pgn: "", path: [99], remoteId: "r", dirty: true }],
        activeBoardId: "missing",
      }),
    );
    const loaded = loadSessionBoards("user-a");
    assert.ok(loaded, "valid boards hydrate even with a stale active id");
    assert.equal(
      loaded.activeBoardId,
      "ok",
      "a stale activeBoardId falls back to the first board",
    );
    assert.equal(loaded.boards[0].dirty, true, "remoteId and dirty round-trip");
    assert.equal(loaded.boards[0].remoteId, "r");
    assert.equal(loadSessionBoards(""), null, "empty user ids hydrate to null");
  });
});

describe("SIG-1186 boot merge", () => {
  const row = (id: string, title: string): RemoteBoardRow => ({
    id,
    title,
    pgn: "",
    current_node_path: null,
    orientation: "white",
    repertoire_color: null,
  });

  it("prefers the saved active board when its local id differs from the remote id", () => {
    const local = {
      boards: [
        seedBoard("local-a", { remoteId: "remote-a", title: "A", dirty: false }),
        seedBoard("local-b", { remoteId: "remote-b", title: "B", dirty: false }),
      ],
      activeBoardId: "local-a",
    };
    // Rows arrive ordered by updated_at desc: B is newer than A.
    const merged = mergeSessionBoards(local, [row("remote-b", "B"), row("remote-a", "A")]);
    assert.ok(merged, "rows merge into a session");
    assert.deepEqual(
      merged.boards.map((board) => board.id),
      ["remote-b", "remote-a"],
      "clean local boards are replaced by their remote rows",
    );
    assert.equal(
      merged.activeBoardId,
      "remote-a",
      "the saved active board wins by remoteId, not the newest remote",
    );
  });

  it("keeps a dirty local board and its id as the active board", () => {
    const local = {
      boards: [seedBoard("local-a", { remoteId: "remote-a", dirty: true })],
      activeBoardId: "local-a",
    };
    const merged = mergeSessionBoards(local, [row("remote-a", "A")]);
    assert.ok(merged);
    assert.equal(merged.boards[0].id, "local-a", "a dirty local board is kept verbatim");
    assert.equal(merged.activeBoardId, "local-a");
  });

  it("SIG-1199: skips closed rows that are not open in the local snapshot", () => {
    const local = {
      boards: [seedBoard("local-a", { remoteId: "remote-a", dirty: false })],
      activeBoardId: "local-a",
    };
    const closed = { ...row("remote-b", "B"), closed_at: "2026-11-01T00:00:00Z" };
    const merged = mergeSessionBoards(local, [row("remote-a", "A"), closed]);
    assert.ok(merged);
    assert.deepEqual(merged.boards.map((board) => board.id), ["remote-a"]);
    assert.equal(mergeSessionBoards(null, [closed]), null, "all rows closed leaves the placeholder");
  });

  it("SIG-1199: a closed row still open in this browser's snapshot stays open", () => {
    const local = {
      boards: [seedBoard("local-a", { remoteId: "remote-a", dirty: false })],
      activeBoardId: "local-a",
    };
    const closedElsewhere = { ...row("remote-a", "A"), closed_at: "2026-11-01T00:00:00Z" };
    const merged = mergeSessionBoards(local, [closedElsewhere]);
    assert.ok(merged);
    assert.deepEqual(merged.boards.map((board) => board.id), ["remote-a"]);
  });

  it("keeps the snapshot when the remote read fails", () => {
    const local = {
      boards: [seedBoard("local-a", { remoteId: "remote-a", dirty: false })],
      activeBoardId: "local-a",
    };
    assert.deepEqual(mergeSessionBoards(local, null), local, "a failed read never wipes the snapshot");
  });
});
