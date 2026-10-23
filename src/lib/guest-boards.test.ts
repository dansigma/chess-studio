import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { useStudioStore } from "../store/studio-store.ts";
import {
  clearGuestBoards,
  GUEST_BOARDS_KEY,
  loadGuestBoards,
  saveGuestBoards,
} from "./guest-boards.ts";
import { emptyBoard } from "../store/slices/board-helpers.ts";
import type { BoardSession } from "../store/slices/types.ts";

// SIG-1092 guest persistence: guests never touch Supabase, so the repertoire
// mark (and position) must survive a browser reload via localStorage.
// node --test runs each file in its own process; the window stub is installed
// after the imports so module init sees no browser.
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
  useStudioStore.setState({
    boards: [seedBoard("board-initial")],
    activeBoardId: "board-initial",
    user: null,
  });
});

describe("SIG-1092 guest board persistence", () => {
  it("round-trips the repertoire marks, position, and active board", () => {
    const white = seedBoard("board-white", {
      repertoireColor: "white",
      orientation: "black",
      title: "White repertoire",
      dirty: true,
    });
    const black = seedBoard("board-black", { repertoireColor: "black" });
    useStudioStore.getState().makeUciMove("e2", "e4");
    const played = useStudioStore
      .getState()
      .boards.find((board) => board.id === "board-initial");
    assert.ok(played && played.path.length > 0, "precondition: the seeded board has moves");

    const boards = [
      { ...white, tree: played?.tree ?? white.tree, path: played?.path ?? [] },
      black,
    ];
    saveGuestBoards(boards, "board-black");

    const raw = storage.get(GUEST_BOARDS_KEY);
    assert.ok(raw, "guest boards are written to localStorage");
    const envelope = JSON.parse(raw as string) as {
      boards: unknown[];
      activeBoardId: string;
    };
    assert.equal(envelope.activeBoardId, "board-black");
    assert.equal(envelope.boards.length, 2, "both non-preview session boards persist");

    const loaded = loadGuestBoards();
    assert.ok(loaded, "a stored snapshot hydrates");
    assert.equal(loaded.activeBoardId, "board-black");
    assert.equal(loaded.boards.length, 2);
    assert.equal(
      loaded.boards.find((board) => board.id === "board-white")?.repertoireColor,
      "white",
      "the White mark survives the reload",
    );
    assert.equal(
      loaded.boards.find((board) => board.id === "board-black")?.repertoireColor,
      "black",
      "the Black mark survives the reload",
    );
    assert.equal(
      loaded.boards.find((board) => board.id === "board-white")?.orientation,
      "black",
      "orientation survives the reload",
    );
    assert.ok(
      (loaded.boards.find((board) => board.id === "board-white")?.path.length ?? 0) > 0,
      "the played position survives the reload",
    );
    assert.ok(
      loaded.boards.every((board) => board.dirty === false && board.preview === false),
      "hydrated guest boards are clean, non-preview sessions",
    );
  });

  it("skips preview and account boards, fails closed on corrupt payloads", () => {
    const guest = seedBoard("board-guest", { repertoireColor: "white" });
    const preview = seedBoard("board-preview", { preview: true, repertoireColor: "black" });
    const account = seedBoard("board-account", { remoteId: "remote-1" });
    saveGuestBoards([guest, preview, account], "board-guest");

    const envelope = JSON.parse(storage.get(GUEST_BOARDS_KEY) as string) as {
      boards: unknown[];
    };
    assert.deepEqual(
      (envelope.boards as Array<{ id: string }>).map((board) => board.id),
      ["board-guest"],
      "only the session-local guest board persists",
    );

    storage.set(GUEST_BOARDS_KEY, "not-json{{{");
    assert.equal(loadGuestBoards(), null, "corrupt payloads hydrate to null");

    storage.set(
      GUEST_BOARDS_KEY,
      JSON.stringify({ version: 9999, boards: [], activeBoardId: "board-guest" }),
    );
    assert.equal(loadGuestBoards(), null, "unknown versions hydrate to null");

    storage.set(
      GUEST_BOARDS_KEY,
      JSON.stringify({
        version: 1,
        boards: [{ id: "board-bad", pgn: 42, repertoireColor: "green" }],
        activeBoardId: "board-bad",
      }),
    );
    assert.equal(loadGuestBoards(), null, "invalid records are skipped, not hydrated");

    clearGuestBoards();
    assert.equal(storage.has(GUEST_BOARDS_KEY), false, "clearGuestBoards drops the key");
    assert.equal(loadGuestBoards(), null, "missing payloads hydrate to null");
  });
});
