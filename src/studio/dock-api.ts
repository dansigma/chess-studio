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
  type DockPresetId,
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
  | "myStats"
  | "opponentPrep";

const BOARD_TITLE: Record<SiteLocale, string> = {
  en: "Board",
  "pt-br": "Tabuleiro",
};

/**
 * Localized per-board title. The stored default title "Board" (and an empty
 * one) is a sentinel localized at display time; any other title is shown as is.
 */
export function boardTitle(locale: SiteLocale, title: string): string {
  return !title || title === "Board" ? BOARD_TITLE[locale] : title;
}

/**
 * SIG-1197: tab titles per board id, with " · 2", " · 3"… on repeats in
 * board order, so two "Joe_Riau vs Skillfulness" tabs can be told apart.
 */
export function dedupedBoardTitles(
  locale: SiteLocale,
  boards: ReadonlyArray<{ id: string; title: string }>,
): Map<string, string> {
  const seen = new Map<string, number>();
  const titles = new Map<string, string>();
  for (const board of boards) {
    const base = boardTitle(locale, board.title);
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    titles.set(board.id, count === 1 ? base : `${base} · ${count}`);
  }
  return titles;
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
  opponentPrep: "panels.opponentPrep",
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

function addBoardPanel(api: DockviewApi, boardTitle: string, boardId: string): string {
  const id = boardPanelId(boardId);
  api.addPanel({
    id,
    component: "board",
    title: boardTitle || BOARD_TITLE[currentLocale()],
    params: { boardId },
  });
  return id;
}

type PanelPlacement = {
  initialWidth?: number;
  initialHeight?: number;
  /** Open as an inactive tab in `referencePanel`'s group (no direction), or split `direction` of it. */
  inactive?: boolean;
  direction?: "right" | "below" | "left" | "above";
};

function addStaticPanel(
  api: DockviewApi,
  id: Exclude<StudioPanelId, "fileGames" | "positionSearch" | "opponentPrep">,
  referencePanel: string,
  placement: PanelPlacement = {},
): void {
  api.addPanel({
    id,
    component: id,
    title: tPanels(currentLocale(), STATIC_PANEL_KEYS[id]),
    initialWidth: placement.initialWidth,
    initialHeight: placement.initialHeight,
    inactive: placement.inactive,
    position: { referencePanel, direction: placement.direction },
  });
}

// SIG-1316: the default layout ("Full analysis"). Left column: board over an
// analysis group (Engine · Eval Graph · Insights). Right column: a reading
// group (Notation · Repertoire · Game Review · My Stats) over Opening
// Explorer and Games side by side. The splits are added columns-first so each
// column is its own branch.
export function seedDefaultLayout(api: DockviewApi, boardTitle: string, boardId: string): void {
  const board = addBoardPanel(api, boardTitle, boardId);
  addStaticPanel(api, "notation", board, { direction: "right", initialWidth: 460 });
  addStaticPanel(api, "engine", board, { direction: "below", initialHeight: 220 });
  addStaticPanel(api, "explorer", "notation", { direction: "below", initialHeight: 280 });
  addStaticPanel(api, "games", "explorer", { direction: "right" });
  addStaticPanel(api, "repertoire", "notation", { inactive: true });
  addStaticPanel(api, "review", "repertoire", { inactive: true });
  addStaticPanel(api, "myStats", "review", { inactive: true });
  addStaticPanel(api, "evalGraph", "engine", { inactive: true });
  addStaticPanel(api, "insights", "evalGraph", { inactive: true });
}

// "Study / Repertoire": Repertoire up front on the right, Opening Explorer up
// front under the board.
function seedStudyLayout(api: DockviewApi, boardTitle: string, boardId: string): void {
  const board = addBoardPanel(api, boardTitle, boardId);
  addStaticPanel(api, "repertoire", board, { direction: "right", initialWidth: 460 });
  addStaticPanel(api, "explorer", board, { direction: "below", initialHeight: 260 });
  addStaticPanel(api, "engine", "repertoire", { direction: "below", initialHeight: 220 });
  addStaticPanel(api, "notation", "repertoire", { inactive: true });
  addStaticPanel(api, "review", "notation", { inactive: true });
  addStaticPanel(api, "myStats", "review", { inactive: true });
  addStaticPanel(api, "games", "explorer", { inactive: true });
  addStaticPanel(api, "evalGraph", "engine", { inactive: true });
  addStaticPanel(api, "insights", "evalGraph", { inactive: true });
}

// "Engine / Minimal": a big board with Engine and Eval Graph under it.
function seedMinimalLayout(api: DockviewApi, boardTitle: string, boardId: string): void {
  const board = addBoardPanel(api, boardTitle, boardId);
  addStaticPanel(api, "engine", board, { direction: "below", initialHeight: 240 });
  addStaticPanel(api, "evalGraph", "engine", { inactive: true });
}

export const DOCK_PRESET_SEEDS: Record<
  DockPresetId,
  (api: DockviewApi, boardTitle: string, boardId: string) => void
> = {
  full: seedDefaultLayout,
  study: seedStudyLayout,
  minimal: seedMinimalLayout,
};

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

// SIG-1247: the active board must always have a dock tab. A restored layout
// (or an import applied before the dock was ready) can leave the active board
// without a `board:*` panel; add it with its own title.
export function ensureActiveBoardPanel(): void {
  if (!dockApi) {
    return;
  }
  const state = useStudioStore.getState();
  const active = state.active();
  if (!dockApi.getPanel(boardPanelId(active.id))) {
    openBoardPanel(active.id, boardTitle(state.settings.locale, active.title));
  }
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
    // SIG-1316: Game Review goes with Notation (right column); Insights with
    // the engine group, as in the default layout.
    const reference =
      id === "review"
        ? (dockApi.getPanel("notation") ?? dockApi.getPanel("evalGraph") ?? dockApi.getPanel("engine") ?? fallbackBoard)
        : id === "insights"
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
  { id: "explorer", label: "Opening Explorer" },
  { id: "games", label: "Games" },
  { id: "fileGames", label: "Games" },
  { id: "positionSearch", label: "Position Search" },
  { id: "myStats", label: "My Stats" },
  { id: "opponentPrep", label: "Opponent prep" },
];
