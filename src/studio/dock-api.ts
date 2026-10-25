import type { DockviewApi } from "dockview-react";
import { persistDockLayout, useStudioStore } from "@/src/store/studio-store";
import type { SiteLocale } from "@/src/i18n/locale.ts";
import { tPanels, type StudioPanelStringKey } from "@/src/i18n/studio-panel-strings.ts";
import {
  currentDockLayoutEpoch,
  DOCK_LAYOUT_VERSION,
  isBoardPanelId,
  isExplorerPanelId,
  sanitizeDockLayout,
} from "./dock-layout";
import { explorerSourceTitle, type ExplorerSource } from "@/src/lib/explorer-types";

export type StudioPanelId =
  | "engine"
  | "evalGraph"
  | "review"
  | "insights"
  | "notation"
  | "repertoire"
  | "explorer"
  | "games"
  | "fileGames"
  | "positionSearch"
  | "myStats";

const BOARD_TITLE: Record<SiteLocale, string> = {
  en: "Board",
  "pt-br": "Tabuleiro",
};

/** Localized fallback for a per-board session tab title. */
export function boardTitle(locale: SiteLocale, title: string): string {
  return title || BOARD_TITLE[locale];
}

const STATIC_PANEL_KEYS: Record<StudioPanelId, StudioPanelStringKey> = {
  engine: "panels.engine",
  evalGraph: "panels.evalGraph",
  review: "panels.review",
  insights: "panels.insights",
  notation: "panels.notation",
  repertoire: "panels.repertoire",
  explorer: "panels.explorer",
  games: "panels.games",
  fileGames: "panels.fileGames",
  positionSearch: "panels.positionSearch",
  myStats: "panels.myStats",
};

/** Localized tab title for a static dock panel (player panels handled separately). */
export function panelTitleForId(locale: SiteLocale, id: StudioPanelId): string {
  return tPanels(locale, STATIC_PANEL_KEYS[id]);
}

/** Localized player-games tab title for a display name. */
export function playerGamesTitle(locale: SiteLocale, title: string): string {
  return tPanels(locale, "panels.playerGames", { title });
}

/** Localized player-explorer tab title (display name passes through). */
export function playerExplorerTitle(locale: SiteLocale, title: string): string {
  return tPanels(locale, "panels.playerExplorer", { title });
}

export function boardPanelId(boardId: string): string {
  return `board:${boardId}`;
}

export function boardIdFromPanelId(panelId: string): string | null {
  if (!isBoardPanelId(panelId)) {
    return null;
  }
  return panelId.slice("board:".length);
}

// SIG-907: first board panel, used as the same-group sibling anchor.
export function firstBoardPanel(api: DockviewApi) {
  const panels = api.panels;
  for (const panel of panels) {
    if (isBoardPanelId(panel.id)) {
      return panel;
    }
  }
  return undefined;
}

// SIG-908: per-explorer panels are `explorer:<uid>` sharing contentComponent
// "explorer". The uid is opaque; the panel's source travels in dockview
// params so the header dropdown can change it without renaming the panel.
export function explorerPanelId(explorerUid: string): string {
  return `explorer:${explorerUid}`;
}

export function explorerIdFromPanelId(panelId: string): string | null {
  if (!isExplorerPanelId(panelId)) {
    return null;
  }
  return panelId.slice("explorer:".length);
}

export function firstExplorerPanel(api: DockviewApi) {
  for (const panel of api.panels) {
    if (isExplorerPanelId(panel.id)) {
      return panel;
    }
  }
  return undefined;
}

// Resolves the tab title for an explorer panel's source against the current
// library snapshot. Called at open/title-sync time (not render). Accepts an
// explicit snapshot so StudioDock title-sync can reuse its subscribed state;
// defaults to the store when omitted (open/persist paths).
export function explorerTitleForSource(
  source: ExplorerSource,
  databases: Array<{ id: string; name: string }> = useStudioStore.getState().files.databases,
  locale: SiteLocale = "en",
): string {
  return explorerSourceTitle(source, databases, locale);
}

// SIG-908: open (or focus) an `explorer:<uid>` panel side by side. The uid is
// opaque; the panel's source travels in dockview params so the header dropdown
// can change it without renaming the panel. Placement mirrors openBoardPanel:
// sibling `explorer:*` to the right, else the legacy bare explorer / notation
// group. A caller-supplied uid (tests) keeps id generation out of the dock.
export function openExplorerPanel(source?: ExplorerSource, explorerUid?: string): void {
  if (!dockApi) {
    return;
  }
  const locale = currentLocale();
  const effective = source ?? useStudioStore.getState().databaseSource;
  const uid = explorerUid ?? crypto.randomUUID().slice(0, 8);
  const id = explorerPanelId(uid);
  const existing = dockApi.getPanel(id);
  if (existing) {
    existing.api.setActive();
    return;
  }
  const sibling = firstExplorerPanel(dockApi) ?? dockApi.getPanel("explorer") ?? dockApi.getPanel("notation");
  dockApi.addPanel({
    id,
    component: "explorer",
    title: explorerTitleForSource(effective, useStudioStore.getState().files.databases, locale),
    params: { explorerId: uid, source: effective },
    position: sibling ? { referencePanel: sibling.id, direction: "right" } : undefined,
  });
}

// SIG-908: a panel's own source change via updateParameters does not fire
// onDidLayoutChange (dockview only saves on add/remove/active/resize), so
// persist explicitly — same sanitize+persist path as the debounced dock save.
export function persistExplorerSource(panelId: string, source: ExplorerSource): void {
  const panel = dockApi?.getPanel(panelId);
  if (!panel) {
    return;
  }
  panel.api.updateParameters({ ...panel.api.getParameters(), source });
  panel.setTitle(explorerTitleForSource(source, useStudioStore.getState().files.databases, currentLocale()));
  if (!dockApi) {
    return;
  }
  const epoch = currentDockLayoutEpoch();
  const snapshot = sanitizeDockLayout({ version: DOCK_LAYOUT_VERSION, dock: dockApi.toJSON() });
  if (!snapshot) {
    return;
  }
  void persistDockLayout(snapshot, epoch).catch(() => undefined);
}

// SIG-907: ids closed programmatically via closeBoardPanel (sidebar close,
// last-panel reseed) so the dock→store remove handler can skip them and avoid
// a closeBoard echo. Board ids are unique per session, so a stale entry can
// never collide with a future board.
const programmaticBoardCloses = new Set<string>();

export function consumeProgrammaticBoardClose(boardId: string): boolean {
  if (programmaticBoardCloses.has(boardId)) {
    programmaticBoardCloses.delete(boardId);
    return true;
  }
  return false;
}

let dockApi: DockviewApi | null = null;

export function registerStudioDock(api: DockviewApi | null): void {
  dockApi = api;
}

// SIG-1075: dock creation titles resolve from the current store locale so a
// restored/pt-br session seeds localized tabs; runtime switches re-title via
// the StudioDock locale effect (no panel recreation).
function currentLocale(): SiteLocale {
  return useStudioStore.getState().settings.locale;
}

export function seedDefaultLayout(api: DockviewApi, boardTitle: string, boardId: string): void {
  const locale = currentLocale();
  const firstBoard = boardPanelId(boardId);
  api.addPanel({
    id: firstBoard,
    component: "board",
    title: boardTitle || BOARD_TITLE[locale],
    params: { boardId },
  });
  api.addPanel({
    id: "notation",
    component: "notation",
    title: tPanels(locale, "panels.notation"),
    initialWidth: 460,
    position: { referencePanel: firstBoard, direction: "right" },
  });
  api.addPanel({
    id: "repertoire",
    component: "repertoire",
    title: tPanels(locale, "panels.repertoire"),
    inactive: true,
    position: { referencePanel: "notation" },
  });
  api.addPanel({
    id: "engine",
    component: "engine",
    title: tPanels(locale, "panels.engine"),
    initialHeight: 220,
    position: { referencePanel: firstBoard, direction: "below" },
  });
  api.addPanel({
    id: "evalGraph",
    component: "evalGraph",
    title: tPanels(locale, "panels.evalGraph"),
    inactive: true,
    position: { referencePanel: "engine" },
  });
  api.addPanel({
    id: "review",
    component: "review",
    title: tPanels(locale, "panels.review"),
    inactive: true,
    position: { referencePanel: "evalGraph" },
  });
  api.addPanel({
    id: "insights",
    component: "insights",
    title: tPanels(locale, "panels.insights"),
    inactive: true,
    position: { referencePanel: "review" },
  });
  api.addPanel({
    id: "explorer",
    component: "explorer",
    title: tPanels(locale, "panels.explorer"),
    inactive: true,
    position: { referencePanel: "notation" },
  });
  api.addPanel({
    id: "games",
    component: "games",
    title: tPanels(locale, "panels.games"),
    inactive: true,
    position: { referencePanel: "notation" },
  });
}

// SIG-915: one board tab group. New boards open in the SAME group as the
// existing board tab (reference without direction — the evalGraph/review
// pattern) so exactly one board is visible at a time, browser-tab style.
export function openBoardPanel(boardId: string, title?: string): void {
  if (!dockApi) {
    return;
  }
  const id = boardPanelId(boardId);
  const existing = dockApi.getPanel(id);
  if (existing) {
    existing.api.setActive();
    return;
  }
  const locale = currentLocale();
  const sibling = firstBoardPanel(dockApi);
  if (sibling) {
    dockApi.addPanel({
      id,
      component: "board",
      title: title || BOARD_TITLE[locale],
      params: { boardId },
      position: { referencePanel: sibling.id },
    });
    return;
  }
  const reference = dockApi.getPanel("notation") ?? dockApi.getPanel("engine");
  dockApi.addPanel({
    id,
    component: "board",
    title: title || BOARD_TITLE[locale],
    params: { boardId },
    position: reference ? { referencePanel: reference.id, direction: "left" } : undefined,
  });
}

export function closeBoardPanel(boardId: string): void {
  const panel = dockApi?.getPanel(boardPanelId(boardId));
  if (!panel) {
    return;
  }
  programmaticBoardCloses.add(boardId);
  panel.api.close();
}

export function openStudioPanel(id: StudioPanelId): void {
  if (!dockApi) {
    return;
  }
  const existing = dockApi.getPanel(id);
  if (existing) {
    existing.api.setActive();
    return;
  }

  if (id === "engine" || id === "evalGraph" || id === "review" || id === "insights") {
    const locale = currentLocale();
    const fallbackBoard = firstBoardPanel(dockApi);
    const reference =
      id === "review" || id === "insights"
        ? (dockApi.getPanel("evalGraph") ?? dockApi.getPanel("engine") ?? fallbackBoard)
        : id === "evalGraph"
          ? (dockApi.getPanel("engine") ?? fallbackBoard ?? dockApi.getPanel("notation"))
          : (fallbackBoard ?? dockApi.getPanel("notation"));
    dockApi.addPanel({
      id,
      component: id,
      title: panelTitleForId(locale, id),
      initialHeight: 220,
      position:
        id === "evalGraph" || id === "review" || id === "insights"
          ? reference
            ? { referencePanel: reference.id }
            : undefined
          : reference
            ? { referencePanel: reference.id, direction: "below" }
            : undefined,
    });
    return;
  }

  const reference =
    dockApi.getPanel("notation") ??
    dockApi.getPanel("explorer") ??
    dockApi.getPanel("games") ??
    firstBoardPanel(dockApi);
  dockApi.addPanel({
    id,
    component: id,
    title: panelTitleForId(currentLocale(), id),
    initialWidth: id === "notation" ? 460 : undefined,
    position: reference ? { referencePanel: reference.id } : undefined,
  });
}

/**
 * SIG-1075: OPEN_PANEL_ITEMS labels feed the View menu and stay English —
 * the chrome slice owns menu copy via `chrome.view.panel.*`; the panels
 * slice owns only tab titles (panelTitleForId). Do not translate here.
 */
export const OPEN_PANEL_ITEMS: Array<{ id: StudioPanelId; label: string }> = [
  { id: "notation", label: "Notation" },
  { id: "repertoire", label: "Repertoire" },
  { id: "engine", label: "Engine" },
  { id: "evalGraph", label: "Eval Graph" },
  { id: "review", label: "Game Review" },
  { id: "insights", label: "Insights" },
  { id: "explorer", label: "Ultra Database" },
  { id: "games", label: "Ultra Games" },
  { id: "fileGames", label: "Games" },
  { id: "positionSearch", label: "Position Search" },
  { id: "myStats", label: "My Stats" },
];
