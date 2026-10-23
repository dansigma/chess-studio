import type { SiteLocale } from "@/src/i18n/locale";
import type { BoardTheme } from "@/src/chess/board-themes";
import type { PieceSet } from "@/src/chess/piece-sets";
import type { MoveNotation } from "@/src/chess/move-notation";
import type { ColorScheme } from "@/src/studio/color-scheme";
import type { GameTree, Path } from "@/src/chess/tree";
import type { ReviewAnnotationEdit } from "@/src/chess/review-annotate";
import type { SpacedRepetitionItem } from "@/src/chess/repertoire";
import type { GameHeaders } from "@/src/chess/pgn";
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

export type { NotationDensity } from "@/src/studio/notation-density";
import type {
  FileDatabase,
  FileGame,
  FilesLibrary,
} from "@/src/lib/user-files";

export type BoardOrientation = "white" | "black";
export type ActivityView = "search" | "boards" | "databases" | "files" | "bookmarks" | "mygames";

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

export type StudioSettings = {
  showCoordinates: boolean;
  showEvalBar: boolean;
  boardTheme: BoardTheme;
  pieceSet: PieceSet;
  moveNotation: MoveNotation;
  notationDensity: NotationDensity;
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
  /** Site language; also drives Game Review explanations (SIG-971). */
  locale: SiteLocale;
};

export type UserInfo = {
  id: string;
  email: string | null;
};

export type StudioState = {
  boards: BoardSession[];
  activeBoardId: string;
  // SIG-907: false until remote board hydration settles (true immediately for
  // guests with nothing to load). Gates restore-time orphan pruning.
  boardsHydrated: boolean;
  activity: ActivityView;
  databaseSource: ExplorerSource;
  settings: StudioSettings;
  user: UserInfo | null;
  explorer: ExplorerResponse | null;
  explorerLoading: boolean;
  explorerError: string | null;
  explorerRetry: number;
  statusMessage: string | null;
  aboutOpen: boolean;
  notationEditor: "comment" | "commentBefore" | "headers" | null;
  layoutNonce: number;
  enginePreview: EnginePreview | null;
  engineEval: EngineEval | null;
  evalByFen: Record<string, CachedEval>;
  threat: ThreatMark | null;
  showThreat: boolean;
  insightMarks: InsightMarks | null;
  playerProfile: PlayerHit | null;
  playerGames: PlayerGame[];
  playerGamesLoading: boolean;
  playerGamesNotice: string | null;
  playerColorFilter: PlayerColorFilter;
  playerResultFilter: PlayerResultFilter;
  files: FilesLibrary;
  filesQuery: string;
  activeFileDatabaseId: string | null;
  activeFileGameId: string | null;
  bookmarks: PlayerBookmark[];
  setupMode: boolean;
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
  insertEngineLines: (fen: string, pvUcisList: string[][]) => void;
  setEnginePreview: (preview: EnginePreview | null) => void;
  setEngineEval: (value: EngineEval | null) => void;
  putEvalCache: (fen: string, value: CachedEval) => void;
  setThreat: (threat: ThreatMark | null) => void;
  setShowThreat: (show: boolean) => void;
  setInsightMarks: (marks: InsightMarks | null) => void;
  goPath: (path: Path) => void;
  back: () => void;
  forward: () => void;
  toStart: () => void;
  toEnd: () => void;
  undo: () => void;
  redo: () => void;
  flip: () => void;
  toggleCoordinates: () => void;
  toggleMoveSound: () => void;
  toggleEvalBar: () => void;
  toggleGamePreview: () => void;
  pinPreviewBoard: (id: string) => void;
  setBoardTheme: (theme: BoardTheme) => void;
  setPieceSet: (set: PieceSet) => void;
  setMoveNotation: (notation: MoveNotation) => void;
  setNotationDensity: (density: NotationDensity) => void;
  setLocale: (locale: SiteLocale) => void;
  toggleNotationDensity: () => void;
  setColorScheme: (scheme: ColorScheme) => void;
  setEngineDepth: (depth: number) => void;
  setMultiPv: (value: number) => void;
  setEngineThreads: (value: number) => void;
  setEngineBuild: (build: EngineBuild) => void;
  setActivity: (view: ActivityView) => void;
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
  }) => void;
  importPlayerGame: (game: PlayerGame, options?: { openInNewBoard?: boolean }) => void;
  exportActivePgn: () => string;
  pruneAfter: () => void;
  promoteVariation: () => void;
  makeMainline: () => void;
  deleteVariation: () => void;
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
  drillDueOnly: boolean;
  repertoireProgress: Record<string, SpacedRepetitionItem>;
  startTraining: () => void;
  stopTraining: () => void;
  startDueDrill: () => void;
  recordRepertoireMove: (fen: string, uci: string, correct: boolean) => void;
  setRepertoireProgress: (progress: Record<string, SpacedRepetitionItem>) => void;
  hydrateRepertoire: () => Promise<void>;
  renameActive: (title: string) => void;
  setBoardRepertoire: (boardId: string, color: BoardOrientation | null) => void;
  setExplorer: (data: ExplorerResponse | null) => void;
  setExplorerLoading: (loading: boolean) => void;
  setExplorerError: (error: string | null) => void;
  retryExplorer: () => void;
  setStatus: (message: string | null) => void;
  setAboutOpen: (open: boolean) => void;
  setNotationEditor: (editor: "comment" | "commentBefore" | "headers" | null) => void;
  openPlayerView: (player: PlayerHit, color?: PlayerColorFilter) => void;
  setPlayerGames: (games: PlayerGame[], notice?: string | null) => void;
  setPlayerGamesLoading: (loading: boolean) => void;
  setPlayerColorFilter: (filter: PlayerColorFilter) => void;
  setPlayerResultFilter: (filter: PlayerResultFilter) => void;
  setFilesQuery: (query: string) => void;
  createFileFolder: (name?: string, parentId?: string | null) => void;
  renameFileFolder: (id: string, name: string) => void;
  moveFileFolder: (id: string, targetParentId: string | null) => boolean;
  moveFileDatabase: (id: string, targetFolderId: string | null) => void;
  importFileDatabase: (
    name: string,
    pgn: string,
    folderId?: string | null,
    options?: { focusFiles?: boolean },
  ) => void;
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
  setUser: (user: UserInfo | null) => void;
  resetSessionState: () => void;
  hydrateSettings: (settings: Partial<StudioSettings>) => void;
  hydrateLocalSettings: () => void;
  hydrateRemoteBoard: (board: BoardSession) => void;
  // SIG-907: marks remote board hydration settled so StudioDock can prune
  // orphan `board:*` panels whose sessions never arrived.
  setBoardsHydrated: () => void;
  markSaved: (id: string, remoteId: string) => void;
  resetView: () => void;
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
  Exclude<SessionDataKey, "settings" | "user" | "layoutNonce">
>;
