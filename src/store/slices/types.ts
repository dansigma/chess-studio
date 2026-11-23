import type { Scope } from "@/src/chess/repertoire-scope";
import type { VariationMergeConflict, VariationMergeDecisions } from "@/src/chess/repertoire-merge";
import type { SiteLocale } from "@/src/i18n/locale";
import type { BoardTheme } from "@/src/chess/board-themes";
import type { PieceSet } from "@/src/chess/piece-sets";
import type { MoveNotation } from "@/src/chess/move-notation";
import type { ColorScheme } from "@/src/studio/color-scheme";
import type { GameTree, Path } from "@/src/chess/tree";
import type { DeviationEvent } from "@/src/chess/repertoire-deviation";
import type { ReviewAnnotationEdit } from "@/src/chess/review-annotate";
import type { DueRepertoireMove, SpacedRepetitionItem } from "@/src/chess/repertoire";
import type { GameHeaders } from "@/src/chess/pgn";
import type { MistakeExercisesMap } from "@/src/lib/mistake-exercises-store";
import type { BoardMarks, MarkColor } from "@/src/chess/marks";
import type {
  PlayerColorFilter,
  PlayerGame,
  PlayerHit,
  PlayerResultFilter,
} from "@/src/lib/player-types";
import type { PlayerBookmark } from "@/src/lib/player-bookmarks";
import type { EngineBuild } from "@/src/engine/stockfish-client";
import type { ExplorerResponse, ExplorerSource } from "@/src/lib/explorer-types";
import type { ExplorerFilters } from "@/src/lib/explorer-filters";
import type { NotationDensity } from "@/src/studio/notation-density";
import type { DockPresetId } from "@/src/studio/dock-layout";
import type { SavedDockLayout } from "@/src/studio/dock-layouts";
import type { RetryState, RetryTarget } from "@/src/chess/retry";

export type { NotationDensity } from "@/src/studio/notation-density";
import type {
  FileDatabase,
  FileGame,
  FilesLibrary,
} from "@/src/lib/user-files";
import type { ParsedFileGame } from "@/src/chess/pgn-games";

export type BoardOrientation = "white" | "black";
// SIG-1273: center work area. Separate from ActivityView (sidebars only).
export type WorkspaceView = "studio" | "library" | "live";
export type ActivityView = "boards" | "bookmarks" | "mygames";

// SIG-1187: pending Forward continuation choice — the board and cursor position
// the chooser was opened from. Nullable so "no chooser open" needs no sentinel.
export type VariationChoice = {
  boardId: string;
  path: Path;
};

/**
 * SIG-1209: the Game Review retry session. Inactive is a bare `{ active: false }`;
 * active carries the pure machine state plus what the store needs to hand the
 * board over and give it back.
 */
export type RetrySession =
  | { active: false }
  | (RetryState & {
      active: true;
      boardId: string;
      exerciseKey: string;
      /** 0-based ply index of the mistake being retried (orders `queue`). */
      momentIndex: number;
      /** Path of the position before the mistake: the board sits here. */
      parentPath: Path;
      /** Where Exit puts the board back. */
      returnPath: Path;
      returnOrientation: BoardOrientation;
      /** The wrong move on the board for 600 ms, then null. */
      wrongFlash: { fen: string; from: string; to: string } | null;
      /** A record for this exercise already counted today. */
      freePractice: boolean;
      /** Every retryable mistake of the reviewed line, in game order. */
      queue: RetryTarget[];
    });

/**
 * SIG-1384: the one-level undo behind the Desfazer toast for a destructive cut
 * (`Delete` / `Ctrl+Delete`). `tree`/`path` are the board state just before the
 * cut; `cutTree` is the tree the cut produced, so any later edit (every tree
 * write is immutable) or board switch can invalidate the pending undo instead
 * of letting it clobber newer work.
 */
export type CutUndo = {
  boardId: string;
  tree: GameTree;
  path: Path;
  cutTree: GameTree;
};

export type BoardSession = {
  id: string;
  remoteId: string | null;
  title: string;
  tree: GameTree;
  path: Path;
  headers: GameHeaders;
  orientation: BoardOrientation;
  // SIG-1092: repertoire mark — which color this board is the repertoire
  // for, if any. One board per color per user (partial unique index).
  repertoireColor: BoardOrientation | null;
  dirty: boolean;
  preview: boolean;
  // SIG-968: pre-annotate snapshot for one level of "Undo annotations".
  // Set by annotateReview, cleared by undoReviewAnnotations and by any
  // wholesale tree replacement (import/load/setup/clone). Optional so all
  // existing constructors stay valid; absent means "no undo available".
  reviewAnnotateUndo?: GameTree;
  // SIG-1406: broadcast (roundId, gameId) link when opened from Live, used by
  // "Pull latest moves" and "Back to Live".
  liveSource?: { roundId: string; gameId: string };
};

export type EngineLineInsert = {
  pvUci: string[];
  evalLabel?: string;
};

export type EnginePreview = {
  fen: string;
  lastMove: string;
  key: string;
};

export type EngineEval = {
  pawns: number;
  label: string;
  // SIG-856: carried so the held eval stays coherent with its depth readout
  // while a fresh FEN has no live lines yet.
  depth?: number;
};

export type CachedEval = {
  pawns: number;
  label: string;
  depth: number;
};

// SIG-906: opponent's intended move from a null-move one-shot. `fen` is the
// real position the threat was computed for (FEN-guarded like
// enginePreview.key); the arrow layer only renders when it matches.
export type ThreatMark = {
  uci: string;
  fen: string;
};

// SIG-959: transient overlay drawn by the Insights panel (hover / tab marks).
// Lives outside `BoardSession.tree`, so it never marks a game dirty, never
// reaches the PGN and is never persisted. FEN-guarded like ThreatMark.
export type InsightMarks = {
  fen: string;
  marks: BoardMarks;
};

/** SIG-1194: the explorer move under the pointer, drawn as a transient arrow. */
export type ExplorerHover = {
  fen: string;
  from: string;
  to: string;
};

export type StudioSettings = {
  trainingScope: Partial<Record<BoardOrientation, Scope>>;
  showCoordinates: boolean;
  showEvalBar: boolean;
  boardTheme: BoardTheme;
  pieceSet: PieceSet;
  moveNotation: MoveNotation;
  notationDensity: NotationDensity;
  showClockTimes: boolean;
  colorScheme: ColorScheme;
  gamePreviewEnabled: boolean;
  engineDepth: number;
  multiPv: number;
  engineThreads: number;
  engineBuild: EngineBuild;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  explorerFilters: ExplorerFilters;
  moveSound: boolean;
  puzzleSound: boolean;
  /** SIG-1196: 40px eval sparkline under the engine control row. */
  engineSparkline: boolean;
  /** Site language; also drives Game Review explanations (SIG-971). */
  locale: SiteLocale;
};

export type UserInfo = {
  id: string;
  email: string | null;
  // SIG-1216: Supabase Auth `user_metadata.display_name`. Display-only; the
  // user can edit it, so it must never feed authorization.
  displayName?: string | null;
};

export type SettingsDialogSection = "linkedAccounts";

export type SettingsDialogState = {
  open: boolean;
  section: SettingsDialogSection | null;
};

export type StudioState = {
  boards: BoardSession[];
  activeBoardId: string;
  // SIG-907: false until remote board hydration settles (true immediately for
  // guests with nothing to load). Gates restore-time orphan pruning.
  boardsHydrated: boolean;
  activity: ActivityView;
  workspaceView: WorkspaceView;
  databaseSource: ExplorerSource;
  settings: StudioSettings;
  user: UserInfo | null;
  explorer: ExplorerResponse | null;
  explorerLoading: boolean;
  explorerError: string | null;
  explorerRetry: number;
  statusMessage: string | null;
  // SIG-1384: pending "Desfazer" for the last destructive cut; null when the
  // 5s window closed, the user dismissed it, or any newer edit landed.
  pendingCutUndo: CutUndo | null;
  aboutOpen: boolean;
  // SIG-1383: Help → "Shortcuts and gestures" reference dialog (desktop
  // MenuBar and mobile sheet share the flag; StudioShell renders it).
  shortcutsOpen: boolean;
  saveAsOpen: boolean;
  addToDatabaseOpen: boolean;
  settingsDialog: SettingsDialogState;
  notationEditor: "comment" | "commentBefore" | "headers" | null;
  layoutNonce: number;
  // SIG-1316: user-saved dock layouts, the last applied layout key
  // ("preset:<id>" / "saved:<id>") and the open Layouts dialog, if any.
  savedLayouts: SavedDockLayout[];
  currentLayoutKey: string | null;
  layoutDialog: "save" | "manage" | null;
  enginePreview: EnginePreview | null;
  engineEval: EngineEval | null;
  evalByFen: Record<string, CachedEval>;
  threat: ThreatMark | null;
  showThreat: boolean;
  insightMarks: InsightMarks | null;
  explorerHover: ExplorerHover | null;
  playerProfile: PlayerHit | null;
  playerGames: PlayerGame[];
  playerGamesLoading: boolean;
  playerGamesNotice: string | null;
  playerColorFilter: PlayerColorFilter;
  playerResultFilter: PlayerResultFilter;
  files: FilesLibrary;
  filesHydrated: boolean;
  hydrateLocalFiles: () => Promise<void>;
  uploadLocalDatabases: (remote: FilesLibrary) => Promise<void>;
  filesQuery: string;
  activeFileDatabaseId: string | null;
  activeFileGameId: string | null;
  bookmarks: PlayerBookmark[];
  setupMode: boolean;
  // SIG-1187: pending Forward continuation choice; null when no chooser open.
  variationChoice: VariationChoice | null;
  // SIG-1209: Game Review retry session; `{ active: false }` when none.
  retry: RetrySession;
  startRetry: (target: RetryTarget, queue?: RetryTarget[]) => boolean;
  /** Retry-mode move; returns false for illegal or locked moves. */
  retryMove: (from: string, to: string, promotion?: string) => boolean;
  retryHint: () => void;
  revealRetry: () => void;
  /** Opens the next retryable mistake in game order; false when there is none. */
  nextRetry: () => boolean;
  /** Leaves the retry; `restorePath: false` keeps the board where it is. */
  exitRetry: (options?: { restorePath?: boolean }) => void;
  active: () => BoardSession;
  fen: () => string;
  lastMove: () => { from: string; to: string } | null;
  sideToMove: () => "w" | "b";
  newBoard: () => void;
  closeBoard: (id?: string) => void;
  cloneBoard: () => void;
  setActiveBoard: (id: string) => void;
  makeUciMove: (from: string, to: string, promotion?: string) => boolean;
  playUciSequence: (ucis: string[]) => void;
  insertEngineLines: (fen: string, lines: (string[] | EngineLineInsert)[]) => void;
  setEnginePreview: (preview: EnginePreview | null) => void;
  setEngineEval: (value: EngineEval | null) => void;
  putEvalCache: (fen: string, value: CachedEval) => void;
  setThreat: (threat: ThreatMark | null) => void;
  setShowThreat: (show: boolean) => void;
  setInsightMarks: (marks: InsightMarks | null) => void;
  setExplorerHover: (hover: ExplorerHover | null) => void;
  goPath: (path: Path) => void;
  back: () => void;
  forward: () => void;
  chooseVariation: (index: number) => void;
  cancelVariationChoice: () => void;
  toStart: () => void;
  toEnd: () => void;
  undo: () => void;
  redo: () => void;
  flip: () => void;
  toggleCoordinates: () => void;
  toggleMoveSound: () => void;
  togglePuzzleSound: () => void;
  toggleEngineSparkline: () => void;
  toggleEvalBar: () => void;
  toggleGamePreview: () => void;
  pinPreviewBoard: (id: string) => void;
  setBoardTheme: (theme: BoardTheme) => void;
  setPieceSet: (set: PieceSet) => void;
  setMoveNotation: (notation: MoveNotation) => void;
  setNotationDensity: (density: NotationDensity) => void;
  toggleClockTimes: () => void;
  setLocale: (locale: SiteLocale) => void;
  toggleNotationDensity: () => void;
  setColorScheme: (scheme: ColorScheme) => void;
  setEngineDepth: (depth: number) => void;
  setMultiPv: (value: number) => void;
  setEngineThreads: (value: number) => void;
  setEngineBuild: (build: EngineBuild) => void;
  setActivity: (view: ActivityView) => void;
  setWorkspaceView: (view: WorkspaceView) => void;
  toggleLibrary: () => void;
  toggleLive: () => void;
  toggleSidebar: () => void;
  setSidebarWidth: (width: number) => void;
  setDatabaseSource: (source: ExplorerSource) => void;
  setExplorerFilters: (patch: Partial<ExplorerFilters>) => void;
  importPgnText: (pgn: string, title?: string) => void;
  openListedGame: (args: {
    title: string;
    pgn?: string;
    moves?: string;
    headers?: GameHeaders;
    atFen?: string;
    // SIG-910: opt-in side-by-side open. When set, the game loads on a new
    // independent board (preview: false) instead of reusing the preview board.
    openInNewBoard?: boolean;
    // SIG-1247: side at the bottom of the opened board; omitted keeps the default.
    orientation?: BoardOrientation;
    // SIG-1406: broadcast (roundId, gameId) link when opened from Live.
    liveSource?: { roundId: string; gameId: string };
  }) => void;
  /** SIG-1406: apply a merged live broadcast tree to a board without clearing variations. */
  applyLiveMerge: (boardId: string, tree: GameTree, path: Path, result?: string) => void;
  importPlayerGame: (game: PlayerGame, options?: { openInNewBoard?: boolean; title?: string }) => void;
  exportActivePgn: () => string;
  pruneAfter: () => void;
  promoteVariation: () => void;
  makeMainline: () => void;
  deleteVariation: () => void;
  /** SIG-1384: restore the tree + selection snapshotted by the last cut. */
  undoCut: () => void;
  /** SIG-1384: drop the pending cut undo (toast timeout, Escape, newer edit). */
  dismissCutUndo: () => void;
  setMoveComment: (comment: string) => void;
  setMoveCommentBefore: (comment: string) => void;
  insertNullMove: () => boolean;
  clearBoardMarks: () => void;
  toggleMoveNag: (nag: number, path?: Path) => void;
  clearMoveNags: (path?: Path) => void;
  // SIG-968: applies pre-built review edits (NAGs/comments) to the active
  // board in one write; stashes the pre-annotate tree for one undo level.
  annotateReview: (edits: ReviewAnnotationEdit[]) => void;
  undoReviewAnnotations: () => void;
  toggleBoardSquareMark: (square: string, color: MarkColor) => void;
  toggleBoardArrowMark: (from: string, to: string, color: MarkColor) => void;
  setHeaders: (headers: GameHeaders) => void;
  skipForward: () => void;
  training: boolean;
  trainingStart: Path | null;
  trainingCatalogPositions: ReadonlyMap<string, unknown> | undefined;
  trainingMiss: { fenKey: string; uci: string; hint: 0 | 1 | 2; alternate?: boolean } | null;
  showTrainingHint: () => void;
  trainingUserColor: "w" | "b";
  drillDueOnly: boolean;
  dueDrill: { queue: DueRepertoireMove[]; total: number; replaying: boolean } | null;
  skipDueReplay: () => void;
  repertoireProgress: Record<string, SpacedRepetitionItem>;
  setTrainingScope: (color: BoardOrientation, scope: Scope) => void;
  startTraining: (catalogPositions?: ReadonlyMap<string, unknown>) => void;
  stopTraining: () => void;
  startDueDrill: (catalogPositions?: ReadonlyMap<string, unknown>) => void;
  recordRepertoireMove: (fen: string, uci: string, correct: boolean) => void;
  setRepertoireProgress: (progress: Record<string, SpacedRepetitionItem>) => void;
  hydrateRepertoire: () => Promise<void>;
  // SIG-1096: persisted mistake exercises with SRS state, hydrated on login
  // like repertoire progress; consumed by the practice slice (SIG-1097).
  mistakeExercises: MistakeExercisesMap;
  setMistakeExercises: (exercises: MistakeExercisesMap) => void;
  hydrateMistakeExercises: () => Promise<void>;
  renameActive: (title: string) => void;
  renameBoard: (id: string, title: string) => void;
  pendingVariationMerge: {
    boardId: string;
    repertoire: GameTree;
    book: GameTree;
    color: BoardOrientation;
    title: string;
    conflicts: VariationMergeConflict[];
  } | null;
  addVariationToRepertoire: (tree: GameTree, color: BoardOrientation, title: string) => BoardSession | null;
  resolveVariationMerge: (decisions: VariationMergeDecisions) => BoardSession | null;
  cancelVariationMerge: () => void;
  setBoardRepertoire: (boardId: string, color: BoardOrientation | null) => void;
  trainDeviationLine: (event: DeviationEvent, color: BoardOrientation) => void;
  addGapToRepertoire: (event: DeviationEvent, color: BoardOrientation) => void;
  setExplorer: (data: ExplorerResponse | null) => void;
  setExplorerLoading: (loading: boolean) => void;
  setExplorerError: (error: string | null) => void;
  retryExplorer: () => void;
  setStatus: (message: string | null) => void;
  setAboutOpen: (open: boolean) => void;
  setShortcutsOpen: (open: boolean) => void;
  setSaveAsOpen: (open: boolean) => void;
  setAddToDatabaseOpen: (open: boolean) => void;
  openSettings: (section?: SettingsDialogSection) => void;
  closeSettings: () => void;
  setNotationEditor: (editor: "comment" | "commentBefore" | "headers" | null) => void;
  openPlayerView: (player: PlayerHit, color?: PlayerColorFilter) => void;
  setPlayerGames: (games: PlayerGame[], notice?: string | null) => void;
  setPlayerGamesLoading: (loading: boolean) => void;
  setPlayerColorFilter: (filter: PlayerColorFilter) => void;
  setPlayerResultFilter: (filter: PlayerResultFilter) => void;
  setFilesQuery: (query: string) => void;
  createFileFolder: (name?: string, parentId?: string | null) => void;
  renameFileFolder: (id: string, name: string) => void;
  renameFileDatabase: (id: string, name: string) => void;
  moveFileFolder: (id: string, targetParentId: string | null) => boolean;
  moveFileDatabase: (id: string, targetFolderId: string | null) => void;
  importFileDatabase: (
    name: string,
    pgn: string,
    folderId?: string | null,
  ) => string;
  /** Adds a database from already parsed games (the Library import queue). Returns its id. */
  importParsedDatabase: (
    name: string,
    games: ParsedFileGame[],
    folderId?: string | null,
  ) => string;
  /** Replaces a database's games, keeping its id (Library import: Replace / Merge). False if the id is unknown. */
  addActiveGameToDatabase: (destination: { id: string } | { name: string }) => boolean;
  replaceFileDatabaseGames: (id: string, games: ParsedFileGame[]) => boolean;
  showFileDatabase: (id: string) => void;
  openPgnSource: (name: string, pgn: string) => void;
  openFileGame: (game: FileGame, options?: { atFen?: string; openInNewBoard?: boolean }) => void;
  deleteFileFolder: (id: string) => void;
  deleteFileDatabase: (id: string) => void;
  mergeRemoteFiles: (remote: FilesLibrary | FileDatabase[]) => void;
  togglePlayerBookmark: (player: PlayerHit) => void;
  mergeRemoteBookmarks: (remote: PlayerBookmark[]) => void;
  hydrateRemoteBookmarks: () => Promise<void>;
  setSetupMode: (open: boolean) => void;
  applySetupFen: (fen: string) => boolean;
  openSharedPosition: (fen: string) => void;
  setUser: (user: UserInfo | null) => Promise<boolean> | undefined;
  resetSessionState: () => Promise<boolean>;
  hydrateSettings: (settings: Partial<StudioSettings>) => void;
  hydrateLocalSettings: () => void;
  hydrateRemoteBoard: (board: BoardSession) => void;
  // SIG-907: marks remote board hydration settled so StudioDock can prune
  // orphan `board:*` panels whose sessions never arrived.
  setBoardsHydrated: () => void;
  markSaved: (id: string, remoteId: string) => void;
  resetView: () => void;
  applyPresetLayout: (id: DockPresetId) => void;
  applySavedLayout: (id: string) => void;
  saveCurrentLayout: (name: string) => boolean;
  renameSavedLayout: (id: string, name: string) => boolean;
  updateSavedLayout: (id: string) => boolean;
  deleteSavedLayout: (id: string) => void;
  hydrateSavedLayouts: (layouts: SavedDockLayout[]) => void;
  setLayoutDialog: (dialog: "save" | "manage" | null) => void;
};

// Data (non-function) keys of the store; the reset payload must cover every
// session-scoped one so a future session key cannot silently survive sign-out.
// (Pick, not Record<..., unknown>: keeps the exact value types so the payload
// is checked for completeness AND assignability to Partial<StudioState>.)
export type SessionDataKey = {
  [K in keyof StudioState]: StudioState[K] extends (...args: never[]) => unknown ? never : K;
}[keyof StudioState];

export type SessionResetPayload = Pick<
  StudioState,
  Exclude<
    SessionDataKey,
    "settings" | "user" | "layoutNonce" | "savedLayouts" | "currentLayoutKey" | "layoutDialog"
  >
>;
