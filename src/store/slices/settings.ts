import { clampMaiaElo, clampMaiaLines, isMaiaChancesMode, MAIA_DEFAULT_ELO, MAIA_DEFAULT_LINES } from "@/src/engine/maia/protocol";
import { validateFen } from "chess.js";
import { OTHER_LINES, TRAINING_DEPTHS, type Scope } from "@/src/chess/repertoire-scope";
import { DEFAULT_SITE_LOCALE, siteLocaleFromLanguage, isSiteLocale } from "@/src/i18n/locale";
import { isBoardTheme } from "@/src/chess/board-themes";
import { isPieceSet } from "@/src/chess/piece-sets";
import { isMoveNotation } from "@/src/chess/move-notation";
import { isColorScheme } from "@/src/studio/color-scheme";
import { isNotationDensity } from "@/src/studio/notation-density";
import {
  DEFAULT_SIDEBAR_WIDTH,
  clampSidebarWidth,
} from "@/src/studio/sidebar-width";
import type { StateCreator } from "zustand";
import {
  clampDepth,
  clampLines,
  clampThreads,
  defaultEngineThreads,
  isEngineBuild,
} from "@/src/engine/stockfish-client";
import {
  DEFAULT_EXPLORER_FILTERS,
  XD_RATING_THRESHOLDS,
  readExplorerFilters,
} from "@/src/lib/explorer-filters";
import { DEFAULT_ASK_MASTER_LEVEL, isAskMasterLevel } from "@/src/lib/ask-master/level";
import { isTextSize } from "@/src/studio/text-size";
import type { StudioSettings, StudioState } from "./types";

export const SETTINGS_KEY = "studio-clone-settings";

export const DEFAULT_SETTINGS: StudioSettings = {
  trainingScope: {},
  showCoordinates: true,
  showEvalBar: true,
  showMaterialBalance: false,
  autoQueen: false,
  boardTheme: "studio",
  pieceSet: "classic",
  moveNotation: "english",
  notationDensity: "normal",
  textSize: "default",
  showClockTimes: false,
  colorScheme: "dark",
  gamePreviewEnabled: true,
  engineDepth: 30,
  multiPv: 2,
  engineThreads: 1,
  engineBuild: "lite",
  sidebarCollapsed: false,
  sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
  explorerFilters: DEFAULT_EXPLORER_FILTERS,
  xdExplorerFilters: DEFAULT_EXPLORER_FILTERS,
  askMasterLevel: DEFAULT_ASK_MASTER_LEVEL,
  moveSound: false,
  puzzleSound: true,
  engineSparkline: true,
  maiaEnabled: false,
  maiaElo: MAIA_DEFAULT_ELO,
  maiaChancesMode: "classical",
  maiaLines: MAIA_DEFAULT_LINES,
  locale: DEFAULT_SITE_LOCALE,
};

function readScope(value: unknown): Scope | undefined {
  if (!value || typeof value !== "object") return undefined;
  const scope: Scope = {};
  if ("variationFen" in value && typeof value.variationFen === "string" &&
    (value.variationFen === OTHER_LINES || validateFen(`${value.variationFen} 0 1`).ok)) {
    scope.variationFen = value.variationFen;
  }
  if ("maxMove" in value) {
    const maxMove = TRAINING_DEPTHS.find((depth) => depth === value.maxMove);
    if (maxMove !== undefined) scope.maxMove = maxMove;
  }
  return Object.keys(scope).length ? scope : undefined;
}

function readTrainingScope(value: unknown): StudioSettings["trainingScope"] {
  if (!value || typeof value !== "object") return {};
  const white = readScope("white" in value ? value.white : undefined);
  const black = readScope("black" in value ? value.black : undefined);
  return { ...(white && { white }), ...(black && { black }) };
}

export function loadLocalSettings(): StudioSettings {
  if (typeof window === "undefined") {
    return DEFAULT_SETTINGS;
  }
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      return { ...DEFAULT_SETTINGS, locale: siteLocaleFromLanguage(window.navigator?.language) };
    }
    const parsed = JSON.parse(raw) as Partial<StudioSettings>;
    return {
      trainingScope: readTrainingScope(parsed.trainingScope),
      showCoordinates:
        typeof parsed.showCoordinates === "boolean"
          ? parsed.showCoordinates
          : DEFAULT_SETTINGS.showCoordinates,
      showEvalBar:
        typeof parsed.showEvalBar === "boolean"
          ? parsed.showEvalBar
          : DEFAULT_SETTINGS.showEvalBar,
      boardTheme: isBoardTheme(parsed.boardTheme)
        ? parsed.boardTheme
        : DEFAULT_SETTINGS.boardTheme,
      showMaterialBalance:
        typeof parsed.showMaterialBalance === "boolean"
          ? parsed.showMaterialBalance
          : DEFAULT_SETTINGS.showMaterialBalance,
      autoQueen:
        typeof parsed.autoQueen === "boolean" ? parsed.autoQueen : DEFAULT_SETTINGS.autoQueen,
      pieceSet: isPieceSet(parsed.pieceSet) ? parsed.pieceSet : DEFAULT_SETTINGS.pieceSet,
      moveNotation: isMoveNotation(parsed.moveNotation)
        ? parsed.moveNotation
        : DEFAULT_SETTINGS.moveNotation,
      notationDensity: isNotationDensity(parsed.notationDensity)
        ? parsed.notationDensity
        : DEFAULT_SETTINGS.notationDensity,
      textSize: isTextSize(parsed.textSize) ? parsed.textSize : DEFAULT_SETTINGS.textSize,
      showClockTimes:
        typeof parsed.showClockTimes === "boolean"
          ? parsed.showClockTimes
          : DEFAULT_SETTINGS.showClockTimes,
      colorScheme: isColorScheme(parsed.colorScheme)
        ? parsed.colorScheme
        : DEFAULT_SETTINGS.colorScheme,
      gamePreviewEnabled:
        typeof parsed.gamePreviewEnabled === "boolean"
          ? parsed.gamePreviewEnabled
          : DEFAULT_SETTINGS.gamePreviewEnabled,
      engineDepth:
        typeof parsed.engineDepth === "number"
          ? parsed.engineDepth
          : DEFAULT_SETTINGS.engineDepth,
      multiPv:
        typeof parsed.multiPv === "number" ? parsed.multiPv : DEFAULT_SETTINGS.multiPv,
      engineThreads:
        typeof parsed.engineThreads === "number"
          ? clampThreads(parsed.engineThreads)
          : defaultEngineThreads(),
      engineBuild: isEngineBuild(parsed.engineBuild) ? parsed.engineBuild : DEFAULT_SETTINGS.engineBuild,
      sidebarCollapsed:
        typeof parsed.sidebarCollapsed === "boolean"
          ? parsed.sidebarCollapsed
          : DEFAULT_SETTINGS.sidebarCollapsed,
      sidebarWidth:
        typeof parsed.sidebarWidth === "number"
          ? clampSidebarWidth(parsed.sidebarWidth)
          : DEFAULT_SETTINGS.sidebarWidth,
      explorerFilters: readExplorerFilters(parsed.explorerFilters),
      xdExplorerFilters: readExplorerFilters(parsed.xdExplorerFilters, XD_RATING_THRESHOLDS),
      askMasterLevel: isAskMasterLevel(parsed.askMasterLevel) ? parsed.askMasterLevel : DEFAULT_ASK_MASTER_LEVEL,
      moveSound: typeof parsed.moveSound === "boolean" ? parsed.moveSound : DEFAULT_SETTINGS.moveSound,
      puzzleSound: typeof parsed.puzzleSound === "boolean" ? parsed.puzzleSound : DEFAULT_SETTINGS.puzzleSound,
      engineSparkline:
        typeof parsed.engineSparkline === "boolean" ? parsed.engineSparkline : DEFAULT_SETTINGS.engineSparkline,
      maiaEnabled: typeof parsed.maiaEnabled === "boolean" ? parsed.maiaEnabled : DEFAULT_SETTINGS.maiaEnabled,
      maiaElo: clampMaiaElo(parsed.maiaElo),
      maiaChancesMode: isMaiaChancesMode(parsed.maiaChancesMode)
        ? parsed.maiaChancesMode
        : DEFAULT_SETTINGS.maiaChancesMode,
      maiaLines: clampMaiaLines(parsed.maiaLines),
      locale: isSiteLocale(parsed.locale) ? parsed.locale : siteLocaleFromLanguage(window.navigator?.language),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export type SettingsSlice = Pick<
  StudioState,
  | "setTrainingScope"
  | "toggleCoordinates"
  | "toggleMoveSound"
  | "togglePuzzleSound"
  | "toggleEngineSparkline"
  | "setMaiaEnabled"
  | "setMaiaElo"
  | "setMaiaChancesMode"
  | "setMaiaLines"
  | "toggleEvalBar"
  | "toggleMaterialBalance"
  | "toggleAutoQueen"
  | "toggleGamePreview"
  | "pinPreviewBoard"
  | "setBoardTheme"
  | "setPieceSet"
  | "setMoveNotation"
  | "setNotationDensity"
  | "setTextSize"
  | "toggleClockTimes"
  | "setLocale"
  | "toggleNotationDensity"
  | "setColorScheme"
  | "setEngineDepth"
  | "setMultiPv"
  | "setEngineThreads"
  | "setEngineBuild"
  | "toggleSidebar"
  | "setSidebarWidth"
  | "setExplorerFilters"
  | "setAskMasterLevel"
  | "hydrateLocalSettings"
  | "hydrateSettings"
>;

// SIG-944: settings state/actions used to live inline in studio-store.ts. The
// store still owns the `settings` field itself (it spreads this slice alongside
// the others); this module owns every action that mutates it.
export const createSettingsSlice: StateCreator<StudioState, [], [], SettingsSlice> = (set, get) => ({
  setTrainingScope: (color, scope) => {
    get().stopTraining();
    set((state) => ({
      settings: {
        ...state.settings,
        trainingScope: { ...state.settings.trainingScope, [color]: readScope(scope) ?? {} },
      },
    }));
  },
  toggleCoordinates: () => {
    set((state) => ({
      settings: {
        ...state.settings,
        showCoordinates: !state.settings.showCoordinates,
      },
    }));
  },
  toggleMoveSound: () => {
    set((state) => ({
      settings: {
        ...state.settings,
        moveSound: !state.settings.moveSound,
      },
    }));
  },
  togglePuzzleSound: () => {
    set((state) => ({
      settings: {
        ...state.settings,
        puzzleSound: !state.settings.puzzleSound,
      },
    }));
  },
  toggleEngineSparkline: () => {
    set((state) => ({
      settings: {
        ...state.settings,
        engineSparkline: !state.settings.engineSparkline,
      },
    }));
  },
  setMaiaEnabled: (maiaEnabled) => {
    set((state) => ({ settings: { ...state.settings, maiaEnabled } }));
  },
  setMaiaElo: (elo) => {
    set((state) => ({ settings: { ...state.settings, maiaElo: clampMaiaElo(elo) } }));
  },
  setMaiaChancesMode: (maiaChancesMode) => {
    if (!isMaiaChancesMode(maiaChancesMode)) return;
    set((state) => ({ settings: { ...state.settings, maiaChancesMode } }));
  },
  setMaiaLines: (lines) => {
    set((state) => ({ settings: { ...state.settings, maiaLines: clampMaiaLines(lines) } }));
  },
  toggleMaterialBalance: () => {
    set((state) => ({
      settings: { ...state.settings, showMaterialBalance: !state.settings.showMaterialBalance },
    }));
  },
  toggleAutoQueen: () => {
    set((state) => ({
      settings: { ...state.settings, autoQueen: !state.settings.autoQueen },
    }));
  },
  toggleEvalBar: () => {
    set((state) => ({
      settings: {
        ...state.settings,
        showEvalBar: !state.settings.showEvalBar,
      },
    }));
  },
  toggleGamePreview: () => {
    set((state) => {
      const enabled = !state.settings.gamePreviewEnabled;
      return {
        settings: { ...state.settings, gamePreviewEnabled: enabled },
        boards: enabled
          ? state.boards
          : state.boards.map((board) => (board.preview ? { ...board, preview: false } : board)),
      };
    });
  },
  pinPreviewBoard: (id) => {
    set((state) => ({
      boards: state.boards.map((board) =>
        board.id === id && board.preview ? { ...board, preview: false } : board,
      ),
    }));
  },
  setBoardTheme: (boardTheme) => {
    set((state) => ({ settings: { ...state.settings, boardTheme } }));
  },
  setPieceSet: (pieceSet) => {
    set((state) => ({ settings: { ...state.settings, pieceSet } }));
  },
  setMoveNotation: (moveNotation) => {
    set((state) => ({ settings: { ...state.settings, moveNotation } }));
  },
  setNotationDensity: (notationDensity) => {
    set((state) => ({ settings: { ...state.settings, notationDensity } }));
  },
  setTextSize: (textSize) => {
    set((state) => ({ settings: { ...state.settings, textSize } }));
  },
  toggleClockTimes: () => {
    set((state) => ({
      settings: { ...state.settings, showClockTimes: !state.settings.showClockTimes },
    }));
  },
  setLocale: (locale) => {
    set((state) => ({ settings: { ...state.settings, locale } }));
  },
  toggleNotationDensity: () => {
    set((state) => ({
      settings: {
        ...state.settings,
        notationDensity: state.settings.notationDensity === "compact" ? "normal" : "compact",
      },
    }));
  },
  setColorScheme: (colorScheme) => {
    set((state) => ({ settings: { ...state.settings, colorScheme } }));
  },
  setEngineDepth: (engineDepth) => {
    set((state) => ({
      settings: { ...state.settings, engineDepth: clampDepth(engineDepth) },
    }));
  },
  setMultiPv: (multiPv) => {
    set((state) => ({
      settings: { ...state.settings, multiPv: clampLines(multiPv) },
    }));
  },
  setEngineThreads: (engineThreads) => {
    set((state) => ({
      settings: { ...state.settings, engineThreads: clampThreads(engineThreads) },
    }));
  },
  setEngineBuild: (engineBuild) => {
    set((state) => ({ settings: { ...state.settings, engineBuild } }));
  },
  toggleSidebar: () =>
    set((state) => ({
      settings: {
        ...state.settings,
        sidebarCollapsed: !state.settings.sidebarCollapsed,
      },
    })),
  setSidebarWidth: (sidebarWidth) =>
    set((state) => ({
      settings: {
        ...state.settings,
        sidebarWidth: clampSidebarWidth(sidebarWidth),
      },
    })),
  setExplorerFilters: (patch, source) => {
    const xd = source === "xadrez-digital";
    const key = xd ? "xdExplorerFilters" : "explorerFilters";
    set((state) => ({
      settings: {
        ...state.settings,
        [key]: readExplorerFilters({ ...state.settings[key], ...patch }, xd ? XD_RATING_THRESHOLDS : undefined),
      },
    }));
  },
  setAskMasterLevel: (askMasterLevel) => {
    set((state) => ({ settings: { ...state.settings, askMasterLevel } }));
  },
  hydrateLocalSettings: () => {
    set({ settings: loadLocalSettings() });
  },
  hydrateSettings: (partial) => {
    set((state) => ({
      settings: {
        ...state.settings,
        ...(partial.showCoordinates !== undefined
          ? { showCoordinates: partial.showCoordinates }
          : {}),
        ...(partial.showEvalBar !== undefined ? { showEvalBar: partial.showEvalBar } : {}),
        ...(partial.boardTheme !== undefined ? { boardTheme: partial.boardTheme } : {}),
        ...(partial.pieceSet !== undefined ? { pieceSet: partial.pieceSet } : {}),
        ...(partial.moveNotation !== undefined ? { moveNotation: partial.moveNotation } : {}),
        ...(partial.notationDensity !== undefined
          ? { notationDensity: partial.notationDensity }
          : {}),
        ...(partial.gamePreviewEnabled !== undefined
          ? { gamePreviewEnabled: partial.gamePreviewEnabled }
          : {}),
        ...(isSiteLocale(partial.locale) ? { locale: partial.locale } : {}),
        ...(partial.engineDepth !== undefined ? { engineDepth: clampDepth(partial.engineDepth) } : {}),
        ...(partial.multiPv !== undefined ? { multiPv: clampLines(partial.multiPv) } : {}),
        ...(partial.engineThreads !== undefined
          ? { engineThreads: clampThreads(partial.engineThreads) }
          : {}),
        ...(partial.sidebarWidth !== undefined
          ? { sidebarWidth: clampSidebarWidth(partial.sidebarWidth) }
          : {}),
      },
    }));
  },
});
