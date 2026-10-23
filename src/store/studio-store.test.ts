import assert from "node:assert/strict";
import test from "node:test";
import { START_FEN, createEmptyTree, getFenAt } from "../chess/tree.ts";
import { importPgn } from "../chess/pgn.ts";
import { getDueRepertoireMoves, repertoireMoveKey, type SpacedRepetitionItem } from "../chess/repertoire.ts";
import { loadLocalBookmarks, saveLocalBookmarks, type PlayerBookmark } from "../lib/player-bookmarks.ts";
import { clearGuestBoards, GUEST_BOARDS_KEY } from "../lib/guest-boards.ts";
import type { PlayerGame, PlayerHit } from "../lib/player-types.ts";
import { EMPTY_FILES, loadLocalFiles, saveLocalFiles, type FilesLibrary } from "../lib/user-files.ts";
import { useStudioStore, selectActiveBoard, type BoardSession, type StudioSettings } from "./studio-store.ts";

// Regression coverage for the cross-user residue fix (spec t_c7273126):
// setUser resets the previous user's session state on sign-out and on a
// direct user switch, while global preferences survive. The store's cache
// helpers no-op without a browser window, so a Map-backed localStorage is
// installed here — after the store import, so module init sees no browser —
// to exercise the real save/load round-trip. node --test runs each file in
// its own process, so the stub cannot leak into other suites.
const storage = new Map<string, string>();
const writes: string[] = [];

(globalThis as { window?: unknown }).window = {
  localStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, String(value));
      writes.push(key);
    },
    removeItem: (key: string) => {
      storage.delete(key);
      writes.push(key);
    },
  },
};

const initial = useStudioStore.getState();
const initialBoard = initial.boards[0];

const USER_A = { id: "user-a", email: "a@example.com" };
const USER_B = { id: "user-b", email: "b@example.com" };
const LAYOUT_NONCE = 7;

const PLAYER_A: PlayerHit = {
  id: "a-player",
  source: "lichess",
  username: "a-player",
  displayName: "A Player",
  subtitle: "GM",
};

const GAME_A: PlayerGame = {
  id: "game-a1",
  winner: "white",
  whiteName: "A White",
  whiteRating: 2100,
  blackName: "A Black",
  blackRating: 2000,
  year: 2024,
  month: 5,
  event: "A Open",
  eco: "C50",
  opening: "A Opening",
  pgn: "1. e4 e5",
  moves: "e4 e5",
  timeClass: "rapid",
  color: "white",
  playerResult: "win",
  playedAt: 1,
};

const FILES_A: FilesLibrary = {
  folders: [{ id: "folder-a1", name: "A folder", parentId: null }],
  databases: [
    { id: "db-a1", remoteId: "remote-db-a1", name: "A db", folderId: "folder-a1", games: [] },
  ],
};

const BOOKMARK_A: PlayerBookmark = { ...PLAYER_A, bookmarkedAt: 1 };

// Reads the whole store after a reset; anything found here is cross-user residue.
const RESIDUE_MARKERS = [
  "A-",
  "a-player",
  "A board",
  "A folder",
  "A db",
  "A Player",
  "A White",
  "A Black",
  "A Open",
  "A Opening",
  "remote-a1",
  "remote-db-a1",
  "file:db-a1",
];

function residueBoard(): BoardSession {
  return {
    id: "board-a1",
    remoteId: "remote-a1",
    title: "A board",
    tree: createEmptyTree(),
    path: [],
    headers: { White: "A White", Black: "A Black" },
    orientation: "black",
    repertoireColor: null,
    dirty: false,
    preview: false,
  };
}

type SignedInSeed = {
  settings: StudioSettings;
  layoutNonce: number;
  cacheKeys: string[];
};

// Loads every session key with account-A residue (including non-default
// preferences, which must survive) and seeds the localStorage caches.
function seedSignedInUser(user: { id: string; email: string | null }): SignedInSeed {
  useStudioStore.setState({
    user,
    boards: [residueBoard()],
    activeBoardId: "board-a1",
    activity: "files",
    databaseSource: "file:db-a1",
    explorer: {
      source: "file:db-a1",
      fen: "A-FEN",
      white: 1,
      draws: 2,
      black: 3,
      opening: { eco: "C50", name: "A Opening" },
      moves: [],
      games: [],
      notice: "A-notice",
    },
    explorerLoading: true,
    statusMessage: "A-status",
    aboutOpen: true,
    notationEditor: "comment",
    enginePreview: { fen: "A-FEN", lastMove: "e2e4", key: "A-KEY" },
    engineEval: { pawns: 1.5, label: "+1.5" },
    evalByFen: { "A-FEN": { pawns: 1.5, label: "+1.5", depth: 20 } },
    threat: { uci: "A-e2e4", fen: "A-FEN" },
    showThreat: true,
    playerProfile: PLAYER_A,
    playerGames: [GAME_A],
    playerGamesLoading: true,
    playerGamesNotice: "A-notice",
    playerColorFilter: "white",
    playerResultFilter: "win",
    files: FILES_A,
    filesQuery: "A-query",
    activeFileDatabaseId: "db-a1",
    activeFileGameId: "game-a1",
    bookmarks: [BOOKMARK_A],
    setupMode: true,
    training: true,
    trainingStart: [0],
    drillDueOnly: true,
    repertoireProgress: {
      "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR:e7e5": {
        lastReviewedAt: "2026-10-10T00:00:00.000Z",
        intervalDays: 1,
        easeFactor: 2.5,
        dueDate: "2026-10-11T00:00:00.000Z",
        mistakeCount: 0,
      },
    },
  });

  const settings: StudioSettings = {
    ...useStudioStore.getState().settings,
    boardTheme: "brown",
    pieceSet: "merida",
    showCoordinates: false,
    sidebarCollapsed: true,
  };
  useStudioStore.setState({ settings, layoutNonce: LAYOUT_NONCE });

  writes.length = 0;
  saveLocalFiles(FILES_A);
  saveLocalBookmarks([BOOKMARK_A]);
  // SIG-1092: clearGuestBoards always writes removeItem (even when the key
  // is absent) so the reset's write set carries the guest-boards key too.
  clearGuestBoards();
  const cacheKeys = [...writes].sort();
  writes.length = 0;
  return { settings, layoutNonce: LAYOUT_NONCE, cacheKeys };
}

function resetStore(): void {
  useStudioStore.setState(initial);
  storage.clear();
  writes.length = 0;
}

// The defaults the reset must restore (contract spec §7: 28 CLEAR keys).
const CLEARED_DEFAULTS = {
  activity: "boards",
  databaseSource: "masters",
  explorer: null,
  explorerLoading: false,
  statusMessage: null,
  aboutOpen: false,
  notationEditor: null,
  enginePreview: null,
  engineEval: null,
  evalByFen: {},
  threat: null,
  showThreat: false,
  playerProfile: null,
  playerGames: [],
  playerGamesLoading: false,
  playerGamesNotice: null,
  playerColorFilter: "all",
  playerResultFilter: "all",
  files: EMPTY_FILES,
  filesQuery: "",
  activeFileDatabaseId: null,
  activeFileGameId: null,
  bookmarks: [],
  setupMode: false,
  training: false,
  trainingStart: null,
  drillDueOnly: false,
  repertoireProgress: {},
};

function assertSessionStateCleared(): void {
  const state = useStudioStore.getState();
  for (const key of Object.keys(CLEARED_DEFAULTS) as Array<keyof typeof CLEARED_DEFAULTS>) {
    assert.deepEqual(state[key], CLEARED_DEFAULTS[key], `${key} must be back at its default`);
  }
  assert.equal(state.boards.length, 1, "boards re-seeded to a single placeholder");
  assert.equal(state.activeBoardId, state.boards[0].id, "activeBoardId points at the re-seeded board");
}

// The re-seeded board must equal the module-init `[emptyBoard()]` state.
function assertReseededBoards(): void {
  const state = useStudioStore.getState();
  const board = state.boards[0];
  assert.deepEqual(
    { ...board, id: "<id>" },
    { ...initialBoard, id: "<id>" },
    "the re-seeded board matches the initial empty placeholder",
  );
  assert.notEqual(board.id, "board-a1", "the placeholder is a fresh board, not the previous user's");
  assert.equal(state.fen(), START_FEN, "the fresh placeholder sits at the initial position");
}

function collectResidue(value: unknown, path = "state", found: string[] = [], seen = new Set<unknown>()): string[] {
  if (typeof value === "string") {
    for (const marker of RESIDUE_MARKERS) {
      if (value.includes(marker)) {
        found.push(`${path}: ${value}`);
      }
    }
    return found;
  }
  if (typeof value !== "object" || value === null || seen.has(value)) {
    return found;
  }
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectResidue(item, `${path}[${index}]`, found, seen));
    return found;
  }
  for (const [key, item] of Object.entries(value)) {
    collectResidue(item, `${path}.${key}`, found, seen);
  }
  return found;
}

test("signing out wipes the previous user's session state and keeps global preferences", () => {
  resetStore();

  useStudioStore.getState().setUser(USER_A);
  const seed = seedSignedInUser(USER_A);
  assert.equal(useStudioStore.getState().playerProfile?.displayName, "A Player", "precondition: A's state is loaded");
  assert.ok(collectResidue(useStudioStore.getState()).length > 0, "precondition: A's residue is reachable");
  assert.deepEqual(loadLocalFiles(), FILES_A, "precondition: A's files cache is seeded");

  useStudioStore.getState().setUser(null);

  const state = useStudioStore.getState();
  assert.equal(state.user, null, "user cleared");
  assertSessionStateCleared();
  assertReseededBoards();
  assert.deepEqual(collectResidue(state), [], "no trace of A is reachable from the store");
  assert.equal(state.settings, seed.settings, "preferences survive by reference");
  assert.equal(state.settings.boardTheme, "brown", "board theme kept");
  assert.equal(state.settings.pieceSet, "merida", "piece set kept");
  assert.equal(state.layoutNonce, seed.layoutNonce, "dock layout nonce kept");
  assert.deepEqual(loadLocalFiles(), EMPTY_FILES, "files cache holds the empty library");
  assert.deepEqual(loadLocalBookmarks(), [], "bookmarks cache is empty");
  assert.equal(storage.has(GUEST_BOARDS_KEY), false, "guest boards cache cleared");
  assert.deepEqual([...writes].sort(), seed.cacheKeys, "the reset rewrote exactly the caches");
});

test("a direct user switch leaves zero residue from the previous account", () => {
  resetStore();

  useStudioStore.getState().setUser(USER_A);
  const seed = seedSignedInUser(USER_A);

  // No intermediate null: the auth callback can jump straight from A to B.
  useStudioStore.getState().setUser(USER_B);

  const state = useStudioStore.getState();
  assert.equal(state.user?.id, "user-b", "session switched to B");
  assertSessionStateCleared();
  assertReseededBoards();
  assert.deepEqual(collectResidue(state), [], "no trace of A is reachable from the store");
  assert.equal(state.settings, seed.settings, "preferences survive by reference");
  assert.equal(state.layoutNonce, seed.layoutNonce, "dock layout nonce kept");
  assert.deepEqual(loadLocalFiles(), EMPTY_FILES, "files cache holds the empty library");
  assert.deepEqual(loadLocalBookmarks(), [], "bookmarks cache is empty");
  assert.equal(storage.has(GUEST_BOARDS_KEY), false, "guest boards cache cleared");
  assert.deepEqual([...writes].sort(), seed.cacheKeys, "the reset rewrote exactly the caches");
});

test("the reset re-seeds boards to the initial empty placeholder", () => {
  resetStore();

  useStudioStore.getState().setUser(USER_A);
  seedSignedInUser(USER_A);
  const residueBoardId = useStudioStore.getState().boards[0].id;

  useStudioStore.getState().setUser(USER_B);

  const state = useStudioStore.getState();
  assertReseededBoards();
  assert.equal(state.boards.length, 1, "exactly one placeholder board");
  assert.notEqual(state.boards[0].id, residueBoardId, "the previous board id is not reused");
});

test("a same-user refresh and a sign-in from signed out leave the session untouched", () => {
  resetStore();

  // A -> A (fresh object, same id): token refreshes must not wipe in-flight work.
  useStudioStore.getState().setUser(USER_A);
  seedSignedInUser(USER_A);
  const boardsBefore = useStudioStore.getState().boards;
  const profileBefore = useStudioStore.getState().playerProfile;

  useStudioStore.getState().setUser({ ...USER_A });

  assert.equal(useStudioStore.getState().boards, boardsBefore, "boards untouched");
  assert.equal(useStudioStore.getState().playerProfile, profileBefore, "player state untouched");
  assert.deepEqual(writes, [], "no cache purge on a same-user refresh");
  assert.equal(loadLocalFiles().databases[0]?.name, "A db", "files cache untouched");

  // null -> A: guest work is preserved while signing in.
  resetStore();
  const guestBoard = useStudioStore.getState().boards[0];
  useStudioStore.getState().setUser(USER_A);
  assert.equal(useStudioStore.getState().boards[0], guestBoard, "boards untouched when signing in from signed out");
  assert.equal(useStudioStore.getState().user?.id, "user-a", "user set");
  assert.deepEqual(writes, [], "no cache purge on sign-in from signed out");

  // null -> null: a no-op.
  resetStore();
  useStudioStore.getState().setUser(null);
  assert.deepEqual(writes, [], "no cache purge on null -> null");
});

test("SIG-857: initial activeBoardId matches the placeholder board id", () => {
  assert.equal(initial.activeBoardId, initialBoard.id, "no empty-string active board id");
  assert.equal(selectActiveBoard(initial), initialBoard, "selector resolves the initial board");
});

test("SIG-857: selectActiveBoard falls back to boards[0] on a stale id", () => {
  resetStore();
  const state = useStudioStore.getState();
  assert.equal(
    selectActiveBoard({ boards: state.boards, activeBoardId: "stale-id" }),
    state.boards[0],
    "stale activeBoardId resolves to the first board",
  );
});

// SIG-910: single-click keeps the replaceable preview board; the opt-in
// new-board open leaves the preview untouched and appends an independent
// board (preview: false) as the active one.
test("SIG-910: listed-game opens reuse the preview unless opened in a new board", () => {
  resetStore();
  const store = useStudioStore.getState();
  assert.equal(store.settings.gamePreviewEnabled, true, "precondition: preview mode on");

  useStudioStore.getState().openListedGame({ title: "Game One", pgn: "1. e4 e5" });
  const afterFirst = useStudioStore.getState();
  assert.equal(afterFirst.boards.length, initial.boards.length + 1, "preview board appended");
  const previewId = afterFirst.activeBoardId;
  assert.equal(selectActiveBoard(afterFirst).preview, true, "preview board is active");
  assert.equal(selectActiveBoard(afterFirst).title, "Game One", "preview holds game one");

  useStudioStore.getState().openListedGame({ title: "Game Two", pgn: "1. d4 d5" });
  const afterSecond = useStudioStore.getState();
  assert.equal(afterSecond.boards.length, initial.boards.length + 1, "preview board reused");
  assert.equal(afterSecond.activeBoardId, previewId, "same preview board stays active");
  assert.equal(selectActiveBoard(afterSecond).title, "Game Two", "preview replaced in place");

  useStudioStore.getState().openListedGame({
    title: "Game Three",
    pgn: "1. c4 c5",
    openInNewBoard: true,
  });
  const afterThird = useStudioStore.getState();
  assert.equal(afterThird.boards.length, initial.boards.length + 2, "new board appended");
  assert.notEqual(afterThird.activeBoardId, previewId, "new board is active");
  assert.equal(selectActiveBoard(afterThird).preview, false, "new board is independent");
  assert.equal(selectActiveBoard(afterThird).title, "Game Three", "new board holds game three");
  const preview = afterThird.boards.find((board) => board.id === previewId);
  assert.equal(preview?.title, "Game Two", "existing preview untouched");
  assert.equal(preview?.preview, true, "existing board still marked preview");
});

// SIG-911: the GamesPanel/PlayerGamesPanel reveal calls
// `openBoardPanel(selectActiveBoard(getState()).id, ...)` after loading, so
// the load actions must leave a resolvable active board carrying the game.
// Preview ON (default): the first load creates the preview board and repeat
// loads reuse it, so re-clicking focuses the existing panel (no panel spam).
test("SIG-911: openListedGame leaves a resolvable active preview board with preview ON", () => {
  resetStore();
  const before = useStudioStore.getState();
  const countBefore = before.boards.length;

  before.openListedGame({ pgn: "1. e4 e5", title: "White vs Black" });
  const state = useStudioStore.getState();
  const active = selectActiveBoard(state);
  assert.equal(state.activeBoardId, active.id, "active board id resolves after load");
  assert.equal(active.title, "White vs Black", "loaded game title lands on the active board");
  assert.equal(active.preview, true, "first load creates the preview board");
  assert.equal(state.boards.length, countBefore + 1, "first load adds exactly one board");

  state.openListedGame({ pgn: "1. d4 d5", title: "Second vs Game" });
  const reused = useStudioStore.getState();
  assert.equal(reused.boards.length, countBefore + 1, "repeat load reuses the preview board");
  assert.equal(
    selectActiveBoard(reused).id,
    active.id,
    "repeat load stays on the same board the UI reveals",
  );
});

// SIG-911: preview OFF: every load creates a fresh non-preview board, so the
// UI reveal opens each new session in turn.
test("SIG-911: openListedGame leaves a resolvable active board with preview OFF", () => {
  resetStore();
  useStudioStore.setState((state) => ({
    settings: { ...state.settings, gamePreviewEnabled: false },
  }));
  const before = useStudioStore.getState();

  before.openListedGame({ pgn: "1. e4 e5", title: "White vs Black" });
  const state = useStudioStore.getState();
  const active = selectActiveBoard(state);
  assert.equal(state.activeBoardId, active.id, "active board id resolves after load");
  assert.equal(active.title, "White vs Black", "loaded game title lands on the active board");
  assert.equal(active.preview, false, "preview OFF creates a regular board");
  assert.equal(state.boards.length, before.boards.length + 1, "load adds exactly one board");
});

// SIG-911: the player-games path delegates to openListedGame; the UI reveal
// reads the same active board afterwards.
test("SIG-911: importPlayerGame leaves a resolvable active board", () => {
  resetStore();

  useStudioStore.getState().importPlayerGame(GAME_A);
  const state = useStudioStore.getState();
  const active = selectActiveBoard(state);
  assert.equal(state.activeBoardId, active.id, "active board id resolves after import");
  assert.equal(active.title, "A White vs A Black", "player game title lands on the active board");
});

// SIG-920: the Courses "Open in Studio" handoff imports the full variation PGN
// on a new board tab, positioned at the student's current step (atFen), while
// leaving the previous board untouched.
test("SIG-920: openListedGame imports a course line on a new board at atFen", () => {
  resetStore();
  const before = useStudioStore.getState();
  const previousId = before.activeBoardId;
  const coursePgn = "1. e4 c6 2. d4 d5 { Caro-Kann Advance idea } 3. e5 *";
  const imported = importPgn(coursePgn);
  const atFen = getFenAt(imported.tree, [0, 0]);

  before.openListedGame({
    title: "Caro-Kann — Advance",
    pgn: coursePgn,
    atFen,
    openInNewBoard: true,
  });

  const state = useStudioStore.getState();
  assert.equal(state.boards.length, before.boards.length + 1, "course import adds exactly one board");
  const active = selectActiveBoard(state);
  assert.equal(active.title, "Caro-Kann — Advance", "course title lands on the new board");
  assert.equal(active.preview, false, "course import bypasses preview onto a regular board");
  assert.deepEqual(active.path, [0, 0], "cursor lands at the student's step");
  const d5 = active.tree.children[0]?.children[0]?.children[0]?.children[0];
  assert.equal(d5?.san, "d5", "full mainline survives the import");
  assert.match(d5?.comment ?? "", /Caro-Kann Advance idea/, "variation comment survives the import");
  const previous = state.boards.find((board) => board.id === previousId);
  assert.ok(previous, "previous board still exists");
  assert.notEqual(active.id, previousId, "import does not clobber the previous board");
});

test("SIG-923: store spaced repetition drill engine updates progress and completes session", () => {
  resetStore();
  const repertoirePgn = "1. e4 e5 (1... c5) 2. Nf3 Nc6 *";
  const imported = importPgn(repertoirePgn);
  useStudioStore.setState((state) => ({
    boards: [
      {
        ...state.boards[0],
        tree: imported.tree,
        path: [],
      },
    ],
    repertoireProgress: {},
  }));

  const store = useStudioStore.getState();
  // Start due drill
  store.startDueDrill();
  let state = useStudioStore.getState();
  assert.equal(state.training, true, "training started");
  assert.equal(state.drillDueOnly, true, "due drill active");
  assert.deepEqual(state.boards[0].path, [], "initial root path has due move e4");

  // Make incorrect move
  const failed = store.makeUciMove("d2", "d4");
  assert.equal(failed, false, "d2d4 refused");
  state = useStudioStore.getState();
  assert.equal(state.statusMessage, "Not in the repertoire.");
  const fenKeyE4 = repertoireMoveKey(START_FEN, "e2e4");
  assert.ok(state.repertoireProgress[fenKeyE4], "failed move recorded");
  assert.equal(state.repertoireProgress[fenKeyE4]?.mistakeCount, 1);
  assert.equal(state.repertoireProgress[fenKeyE4]?.intervalDays, 1);

  // Make correct move e2e4
  const ok = store.makeUciMove("e2", "e4");
  assert.equal(ok, true, "e2e4 accepted");
  state = useStudioStore.getState();
  assert.ok(state.repertoireProgress[fenKeyE4]);
  // Next due position should be e4 with e5 or c5, or Nf3
  assert.equal(state.training, true);

  // Complete all due moves by marking progress as not due
  const future = new Date(Date.now() + 86400000 * 30).toISOString();
  const allDue = getDueRepertoireMoves(imported.tree, {});
  const allReviewed: Record<string, SpacedRepetitionItem> = {};
  for (const item of allDue) {
    allReviewed[repertoireMoveKey(item.fen, item.uci)] = {
      dueDate: future,
      intervalDays: 1,
      easeFactor: 2.5,
      lastReviewedAt: future,
      mistakeCount: 0,
    };
  }
  store.setRepertoireProgress(allReviewed);

  // Now starting due drill should report no reviews due
  store.stopTraining();
  store.startDueDrill();
  state = useStudioStore.getState();
  assert.equal(state.training, false);
  assert.equal(state.drillDueOnly, false);
  assert.equal(state.statusMessage, "No reviews due.");
});

