import assert from "node:assert/strict";
import test from "node:test";
import { exportPgn } from "../chess/pgn.ts";
import { buildPuzzleStudioImport, type StudioPuzzle } from "../puzzles/studio-handoff.ts";
import { COURSE_STUDY_IMPORT_KEY, readCourseStudyImport, writeCourseStudyImport } from "../chess/share-board.ts";
import { mergeSessionBoards, type RemoteBoardRow } from "../lib/session-boards.ts";
import { useStudioStore, emptyBoard } from "../store/studio-store.ts";
import { applyStudioEntryImport, entryImportReady } from "./entry-import.ts";

const session = new Map<string, string>();
(globalThis as { window?: unknown }).window = {
  location: { search: "" },
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  sessionStorage: {
    getItem: (key: string) => session.get(key) ?? null,
    setItem: (key: string, value: string) => void session.set(key, String(value)),
    removeItem: (key: string) => void session.delete(key),
  },
};

const PUZZLE_FEN = "3r2k1/5ppp/8/8/8/8/1Q3PPP/3R2K1 w - - 0 1";
const puzzle: StudioPuzzle = { id: "00sHx", fen: PUZZLE_FEN, sans: ["Qb8", "Rxb8", "Rd8+"] };

function remoteRow(id: string, title: string): RemoteBoardRow {
  return {
    id,
    title,
    pgn: "1. e4 e5 *",
    current_node_path: null,
    orientation: "white",
    repertoire_color: null,
    closed_at: null,
    updated_at: new Date().toISOString(),
  } as unknown as RemoteBoardRow;
}

function reset() {
  session.clear();
  const placeholder = emptyBoard("Posição inicial");
  useStudioStore.setState({ boards: [placeholder], activeBoardId: placeholder.id });
}

function seedPuzzleHandoff() {
  const payload = buildPuzzleStudioImport(puzzle, "catalog" as never, "en" as never);
  assert.ok(payload);
  assert.ok(writeCourseStudyImport(payload));
}

// What StudioShell does when the signed-in restore lands: replace `boards`
// from the local snapshot merged with the Supabase rows.
function signedInRestore() {
  const merged = mergeSessionBoards(null, [remoteRow("r1", "Synced one"), remoteRow("r2", "Synced two")]);
  assert.ok(merged);
  useStudioStore.setState({ boards: merged.boards, activeBoardId: merged.activeBoardId });
}

test("SIG-1244 root cause: importing before the signed-in restore loses the board", () => {
  reset();
  seedPuzzleHandoff();
  applyStudioEntryImport("");
  assert.equal(useStudioStore.getState().boards.length, 2);
  signedInRestore();
  assert.ok(!useStudioStore.getState().boards.some((b) => b.title.includes("00sHx")));
});

test("SIG-1244: import applied after the restore adds one board and keeps synced boards", () => {
  reset();
  seedPuzzleHandoff();
  // Mount order: auth unresolved, then signed in but restore pending, then settled.
  assert.equal(entryImportReady({ authResolved: false, hasUser: false, restoreSettled: false }), false);
  assert.equal(entryImportReady({ authResolved: true, hasUser: true, restoreSettled: false }), false);
  signedInRestore();
  assert.equal(entryImportReady({ authResolved: true, hasUser: true, restoreSettled: true }), true);
  applyStudioEntryImport("");
  const { boards, activeBoardId } = useStudioStore.getState();
  assert.equal(boards.length, 3);
  assert.deepEqual(boards.slice(0, 2).map((b) => b.title), ["Synced one", "Synced two"]);
  const opened = boards.find((b) => b.id === activeBoardId);
  assert.ok(opened);
  assert.match(opened.title, /00sHx/);
  assert.equal(opened.remoteId ?? null, null);
  assert.match(exportPgn(opened.tree, opened.headers), /1\. Qb8 Rxb8 2\. Rd8\+/);
  assert.equal(opened.headers.FEN, PUZZLE_FEN);
  assert.equal(readCourseStudyImport(), null);
  assert.equal(session.has(COURSE_STUDY_IMPORT_KEY), false);
});

test("SIG-1244: the payload is consumed once (a second pass adds no board)", () => {
  reset();
  seedPuzzleHandoff();
  applyStudioEntryImport("");
  const count = useStudioStore.getState().boards.length;
  applyStudioEntryImport("");
  assert.equal(useStudioStore.getState().boards.length, count);
});

test("SIG-1244: guests are ready as soon as auth resolves, with no restore", () => {
  assert.equal(entryImportReady({ authResolved: true, hasUser: false, restoreSettled: false }), true);
});
