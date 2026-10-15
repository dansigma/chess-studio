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
  readExplorerFilters,
} from "@/src/lib/explorer-filters";
import type { StudioSettings, StudioState } from "./types";

export const SETTINGS_KEY = "studio-clone-settings";

export const DEFAULT_SETTINGS: StudioSettings = {
  showCoordinates: true,
  showEvalBar: true,
  boardTheme: "studio",
  pieceSet: "classic",
  moveNotation: "english",
  notationDensity: "normal",
  colorScheme: "dark",
  gamePreviewEnabled: true,
  engineDepth: 30,
  multiPv: 2,
  engineThreads: 1,
  engineBuild: "lite",
  sidebarCollapsed: false,
  sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
  explorerFilters: DEFAULT_EXPLORER_FILTERS,
  moveSound: false,
  locale: DEFAULT_SITE_LOCALE,
};

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
      pieceSet: isPieceSet(parsed.pieceSet) ? parsed.pieceSet : DEFAULT_SETTINGS.pieceSet,
      moveNotation: isMoveNotation(parsed.moveNotation)
        ? parsed.moveNotation
        : DEFAULT_SETTINGS.moveNotation,
      notationDensity: isNotationDensity(parsed.notationDensity)
        ? parsed.notationDensity
        : DEFAULT_SETTINGS.notationDensity,
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
      moveSound: typeof parsed.moveSound === "boolean" ? parsed.moveSound : DEFAULT_SETTINGS.moveSound,
      locale: isSiteLocale(parsed.locale) ? parsed.locale : siteLocaleFromLanguage(window.navigator?.language),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export type SettingsSlice = Pick<
  StudioState,
  | "toggleCoordinates"
  | "toggleMoveSound"
  | "toggleEvalBar"
  | "toggleGamePreview"
  | "pinPreviewBoard"
  | "setBoardTheme"
  | "setPieceSet"
  | "setMoveNotation"
  | "setNotationDensity"
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
  | "hydrateLocalSettings"
  | "hydrateSettings"
>;

// SIG-944: settings state/actions used to live inline in studio-store.ts. The
// store still owns the `settings` field itself (it spreads this slice alongside
// the others); this module owns every action that mutates it.
export const createSettingsSlice: StateCreator<StudioState, [], [], SettingsSlice> = (set) => ({
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
  setExplorerFilters: (patch) =>
    set((state) => ({
      settings: {
        ...state.settings,
        explorerFilters: { ...state.settings.explorerFilters, ...patch },
      },
    })),
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
