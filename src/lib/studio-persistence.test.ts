// SIG-1111: round-trip tests for the store-free remote persistence helpers.
// Uses the shared chainable Supabase fake (`createFakeSupabase`) with the
// `insert().select("id").single()` chain it gained for board inserts, plus a
// minimal `window.localStorage` stub for the dock-layout local paths.
import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { createEmptyTree } from "../chess/tree.ts";
import { DEFAULT_SETTINGS } from "../store/slices/settings.ts";
import {
  DOCK_LAYOUT_VERSION,
  currentDockLayoutEpoch,
  readStoredDockLayout,
  sanitizeDockLayout,
  takeQueuedDockLayout,
  type DockLayoutSnapshot,
} from "../studio/dock-layout.ts";
import {
  createFakeSupabase,
  type FakeSupabaseClient,
  type FakeTableConfig,
} from "../test-utils/route-test.ts";
import type { BoardSession, StudioSettings } from "../store/slices/types.ts";

// One module mock for the whole file (node:test forbids re-mocking); each
// test installs its fake through the global holder before calling through.
mock.module("@/src/lib/supabase/client.ts", {
  namedExports: {
    createBrowserSupabase: () =>
      (globalThis as { __sig1111Fake?: FakeSupabaseClient | null }).__sig1111Fake ?? null,
  },
});

const {
  persistBoardRecord,
  persistSettingsRecord,
  loadRemoteSettingsForUser,
  forgetRemoteDockSync,
  persistDockLayoutRecord,
  syncRemoteDockLayout,
} = await import("./studio-persistence.ts");

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

function installFake(tables: Record<string, FakeTableConfig> = {}): FakeSupabaseClient {
  const fake = createFakeSupabase({ tables });
  (globalThis as { __sig1111Fake?: FakeSupabaseClient | null }).__sig1111Fake = fake;
  return fake;
}

function clearClient(): void {
  (globalThis as { __sig1111Fake?: FakeSupabaseClient | null }).__sig1111Fake = null;
}

function makeBoard(overrides: Partial<BoardSession> = {}): BoardSession {
  return {
    id: "board-1",
    remoteId: null,
    title: "My board",
    tree: createEmptyTree(),
    path: [],
    headers: { White: "White", Black: "Black" },
    orientation: "white",
    repertoireColor: null,
    dirty: false,
    preview: false,
    ...overrides,
  };
}

function makeSettings(overrides: Partial<StudioSettings> = {}): StudioSettings {
  return {
    ...DEFAULT_SETTINGS,
    showCoordinates: false,
    boardTheme: "green",
    pieceSet: "merida",
    engineDepth: 18,
    multiPv: 3,
    locale: "pt-br",
    ...overrides,
  };
}

const SNAPSHOT: DockLayoutSnapshot = {
  version: DOCK_LAYOUT_VERSION,
  dock: {
    grid: {
      root: {
        type: "leaf",
        data: { id: "g1", views: ["notation"], activeView: "notation" },
      },
    },
    panels: { notation: { id: "notation", contentComponent: "notation" } },
  },
} as unknown as DockLayoutSnapshot;

test("SIG-1111 persistBoardRecord inserts a new board with the expected columns", async () => {
  const fake = installFake({ boards: { insertSingle: { id: "remote-new" } } });

  const id = await persistBoardRecord(makeBoard(), "user-1");

  assert.equal(id, "remote-new");
  assert.equal(fake.calls.insert.length, 1);
  const row = fake.calls.insert[0] as { table: string; row: Record<string, unknown> };
  assert.equal(row.table, "boards");
  assert.deepEqual(Object.keys(row.row).sort(), [
    "current_node_path",
    "orientation",
    "pgn",
    "repertoire_color",
    "title",
    "updated_at",
    "user_id",
  ]);
  assert.equal(row.row.user_id, "user-1");
  assert.equal(row.row.title, "My board");
  assert.equal(typeof row.row.pgn, "string");
  assert.equal(typeof row.row.updated_at, "string");
});

test("SIG-1111 persistBoardRecord updates an existing board by remoteId", async () => {
  const fake = installFake();

  const id = await persistBoardRecord(makeBoard({ remoteId: "remote-1" }), "user-1");

  assert.equal(id, "remote-1");
  assert.equal(fake.calls.update.length, 1);
  assert.equal(fake.calls.insert.length, 0);
  const row = fake.calls.update[0] as { table: string; row: Record<string, unknown> };
  assert.equal(row.table, "boards");
  assert.deepEqual(Object.keys(row.row).sort(), [
    "current_node_path",
    "orientation",
    "pgn",
    "repertoire_color",
    "title",
    "updated_at",
  ]);
});

test("SIG-1111 persistBoardRecord throws on database errors", async () => {
  installFake({ boards: { updateError: new Error("update boom") } });
  await assert.rejects(persistBoardRecord(makeBoard({ remoteId: "remote-1" }), "user-1"));

  installFake({ boards: { writeError: new Error("insert boom") } });
  await assert.rejects(persistBoardRecord(makeBoard(), "user-1"));
});

test("SIG-1111 persistBoardRecord returns null without a user or client", async () => {
  const fake = installFake();

  assert.equal(await persistBoardRecord(makeBoard(), null), null);
  assert.equal(fake.calls.insert.length, 0);
  assert.equal(fake.calls.update.length, 0);

  clearClient();
  assert.equal(await persistBoardRecord(makeBoard(), "user-1"), null);
});

test("SIG-1111 settings round-trip persists and loads the same values", async () => {
  const settings = makeSettings();
  const persisted = installFake();
  await persistSettingsRecord(settings, "user-1");

  assert.equal(persisted.calls.upsert.length, 1);
  const row = persisted.calls.upsert[0] as { table: string; row: Record<string, unknown> };
  assert.equal(row.table, "user_settings");
  assert.deepEqual(row.row, {
    user_id: "user-1",
    show_coordinates: false,
    piece_theme: "merida",
    board_theme: "green",
    engine_depth: 18,
    multi_pv: 3,
    locale: "pt-br",
  });

  // The remote row rides back through loadRemoteSettingsForUser.
  installFake({
    user_settings: {
      maybeSingle: {
        show_coordinates: false,
        board_theme: "green",
        piece_theme: "merida",
        engine_depth: 18,
        multi_pv: 3,
        locale: "pt-br",
      },
    },
  });
  const loaded = await loadRemoteSettingsForUser("user-1");
  assert.deepEqual(loaded, {
    showCoordinates: false,
    boardTheme: "green",
    pieceSet: "merida",
    engineDepth: 18,
    multiPv: 3,
    locale: "pt-br",
  });
});

test("SIG-1111 loadRemoteSettingsForUser drops invalid locales and themes", async () => {
  installFake({
    user_settings: {
      maybeSingle: {
        show_coordinates: true,
        board_theme: "nope",
        piece_theme: "nope",
        engine_depth: 12,
        multi_pv: 1,
        locale: "xx",
      },
    },
  });

  const loaded = await loadRemoteSettingsForUser("user-1");
  assert.deepEqual(loaded, {
    showCoordinates: true,
    boardTheme: undefined,
    pieceSet: undefined,
    engineDepth: 12,
    multiPv: 1,
    locale: undefined,
  });
});

test("SIG-1111 loadRemoteSettingsForUser returns null on errors and missing input", async () => {
  installFake({ user_settings: { selectError: new Error("select boom") } });
  assert.equal(await loadRemoteSettingsForUser("user-1"), null);

  installFake();
  assert.equal(await loadRemoteSettingsForUser("user-1"), null);
  assert.equal(await loadRemoteSettingsForUser(null), null);

  clearClient();
  assert.equal(await loadRemoteSettingsForUser("user-1"), null);
});

test("SIG-1111 persistSettingsRecord throws on write errors and no-ops without a user", async () => {
  installFake({ user_settings: { writeError: new Error("upsert boom") } });
  await assert.rejects(persistSettingsRecord(makeSettings(), "user-1"));

  const fake = installFake();
  await persistSettingsRecord(makeSettings(), null);
  assert.equal(fake.calls.upsert.length, 0);
});

test("SIG-1111 persistDockLayoutRecord writes the layout JSON and forgetRemoteDockSync resets the guard", async () => {
  storage.clear();
  const epoch = currentDockLayoutEpoch();
  const fake = installFake();

  await persistDockLayoutRecord(SNAPSHOT, epoch, "user-1");

  assert.equal(fake.calls.upsert.length, 1);
  const row = fake.calls.upsert[0] as { table: string; row: Record<string, unknown> };
  assert.equal(row.table, "user_settings");
  assert.equal(row.row.user_id, "user-1");
  assert.ok(row.row.layout !== undefined, "layout column is upserted");
  assert.deepEqual(readStoredDockLayout(), sanitizeDockLayout(SNAPSHOT));

  await persistDockLayoutRecord(null, epoch, "user-1");
  assert.equal(readStoredDockLayout(), null);

  // A stale epoch never reaches Supabase.
  const { bumpDockLayoutEpoch } = await import("../studio/dock-layout.ts");
  const stale = epoch;
  bumpDockLayoutEpoch();
  const before = fake.calls.upsert.length;
  await persistDockLayoutRecord(SNAPSHOT, stale, "user-1");
  assert.equal(fake.calls.upsert.length, before);
});

test("SIG-1111 syncRemoteDockLayout applies the remote layout once per user", async () => {
  storage.clear();
  forgetRemoteDockSync();
  const fake = installFake({ user_settings: { maybeSingle: { layout: SNAPSHOT } } });

  await syncRemoteDockLayout("user-sync-1");

  assert.deepEqual(readStoredDockLayout(), sanitizeDockLayout(SNAPSHOT));
  const queued = takeQueuedDockLayout();
  assert.deepEqual(queued, sanitizeDockLayout(SNAPSHOT));

  // Second call for the same user is guarded — no second fetch.
  const fromCalls = fake.calls.from.length;
  await syncRemoteDockLayout("user-sync-1");
  assert.equal(fake.calls.from.length, fromCalls);

  // Forgetting the sync resets the guard so the next call refetches.
  forgetRemoteDockSync();
  await syncRemoteDockLayout("user-sync-1");
  assert.ok(fake.calls.from.length > fromCalls, "refetches after forgetRemoteDockSync");
});

test("SIG-1111 syncRemoteDockLayout pushes the local layout when remote is empty", async () => {
  storage.clear();
  forgetRemoteDockSync();
  const { writeStoredDockLayout } = await import("../studio/dock-layout.ts");
  writeStoredDockLayout(SNAPSHOT);
  const fake = installFake();

  await syncRemoteDockLayout("user-sync-2");

  const layouts = fake.calls.upsert.filter((call) => call.table === "user_settings");
  assert.ok(layouts.length >= 1, "local layout is pushed remotely");
});

test("SIG-1111 syncRemoteDockLayout swallows select errors", async () => {
  storage.clear();
  forgetRemoteDockSync();
  installFake({ user_settings: { selectError: new Error("select boom") } });

  await syncRemoteDockLayout("user-sync-3");
  assert.equal(readStoredDockLayout(), null);
});
