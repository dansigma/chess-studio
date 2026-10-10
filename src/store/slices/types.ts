import type { BoardTheme } from "@/src/chess/board-themes";
import type { PieceSet } from "@/src/chess/piece-sets";
import type { MoveNotation } from "@/src/chess/move-notation";
import type { ColorScheme } from "@/src/studio/color-scheme";
import type { GameTree, Path } from "@/src/chess/tree";
import type { GameHeaders } from "@/src/chess/pgn";
import type { MarkColor } from "@/src/chess/marks";
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
import type {
  FileDatabase,
  FileGame,
  FilesLibrary,
} from "@/src/lib/user-files";

export type BoardOrientation = "white" | "black";
export type ActivityView = "search" | "boards" | "databases" | "files" | "bookmarks";

export type BoardSession = {
  id: string;
  remoteId: string | null;
  title: string;
  tree: GameTree;
  path: Path;
  headers: GameHeaders;
  orientation: BoardOrientation;
  dirty: boolean;
  preview: boolean;
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

export type StudioSettings = {
  showCoordinates: boolean;
  showEvalBar: boolean;
  boardTheme: BoardTheme;
  pieceSet: PieceSet;
  moveNotation: MoveNotation;
  colorScheme: ColorScheme;
  gamePreviewEnabled: boolean;
  engineDepth: number;
  multiPv: number;
  engineThreads: number;
  engineBuild: EngineBuild;
  sidebarCollapsed: boolean;
  explorerFilters: ExplorerFilters;
  moveSound: boolean;
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
  setColorScheme: (scheme: ColorScheme) => void;
  setEngineDepth: (depth: number) => void;
  setMultiPv: (value: number) => void;
  setEngineThreads: (value: number) => void;
  setEngineBuild: (build: EngineBuild) => void;
  setActivity: (view: ActivityView) => void;
  toggleSidebar: () => void;
  setDatabaseSource: (source: ExplorerSource) => void;
  setExplorerFilters: (patch: Partial<ExplorerFilters>) => void;
  importPgnText: (pgn: string, title?: string) => void;
  openListedGame: (args: {
    title: string;
    pgn?: string;
    moves?: string;
    headers?: GameHeaders;
    atFen?: string;
  }) => void;
  importPlayerGame: (game: PlayerGame) => void;
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
  toggleBoardSquareMark: (square: string, color: MarkColor) => void;
  toggleBoardArrowMark: (from: string, to: string, color: MarkColor) => void;
  setHeaders: (headers: GameHeaders) => void;
  skipForward: () => void;
  training: boolean;
  trainingStart: Path | null;
  startTraining: () => void;
  stopTraining: () => void;
  renameActive: (title: string) => void;
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
  createFileFolder: (name?: string) => void;
  importFileDatabase: (
    name: string,
    pgn: string,
    folderId?: string | null,
    options?: { focusFiles?: boolean },
  ) => void;
  showFileDatabase: (id: string) => void;
  openPgnSource: (name: string, pgn: string) => void;
  openFileGame: (game: FileGame, options?: { atFen?: string }) => void;
  deleteFileFolder: (id: string) => void;
  deleteFileDatabase: (id: string) => void;
  mergeRemoteFiles: (databases: FileDatabase[]) => void;
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
