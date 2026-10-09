import { isBoardTheme } from "@/src/chess/board-themes";
import { isPieceSet } from "@/src/chess/piece-sets";
import { isMoveNotation } from "@/src/chess/move-notation";
import { isColorScheme } from "@/src/studio/color-scheme";
import { clampThreads, defaultEngineThreads, isEngineBuild } from "@/src/engine/stockfish-client";
import {
  DEFAULT_EXPLORER_FILTERS,
  readExplorerFilters,
} from "@/src/lib/explorer-filters";
import type { StudioSettings } from "./types";

export const SETTINGS_KEY = "studio-clone-settings";

export const DEFAULT_SETTINGS: StudioSettings = {
  showCoordinates: true,
  showEvalBar: true,
  boardTheme: "studio",
  pieceSet: "classic",
  moveNotation: "english",
  colorScheme: "dark",
  gamePreviewEnabled: true,
  engineDepth: 30,
  multiPv: 2,
  engineThreads: 1,
  engineBuild: "lite",
  sidebarCollapsed: false,
  explorerFilters: DEFAULT_EXPLORER_FILTERS,
  moveSound: true,
};

export function loadLocalSettings(): StudioSettings {
  if (typeof window === "undefined") {
    return DEFAULT_SETTINGS;
  }
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      return DEFAULT_SETTINGS;
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
      explorerFilters: readExplorerFilters(parsed.explorerFilters),
      moveSound: typeof parsed.moveSound === "boolean" ? parsed.moveSound : DEFAULT_SETTINGS.moveSound,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}
