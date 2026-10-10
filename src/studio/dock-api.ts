import type { DockviewApi } from "dockview-react";
import { isBoardPanelId } from "./dock-layout";

export type StudioPanelId =
  | "engine"
  | "evalGraph"
  | "review"
  | "notation"
  | "repertoire"
  | "explorer"
  | "games"
  | "fileGames";

const PANEL_TITLES: Record<StudioPanelId, string> = {
  engine: "Engine",
  evalGraph: "Eval Graph",
  review: "Game Review",
  notation: "Notation",
  repertoire: "Repertoire",
  explorer: "Ultra Database",
  games: "Ultra Games",
  fileGames: "Games",
};

const BOARD_TITLE = "Board";

export function boardPanelId(boardId: string): string {
  return `board:${boardId}`;
}

export function boardIdFromPanelId(panelId: string): string | null {
  if (!isBoardPanelId(panelId)) {
    return null;
  }
  return panelId.slice("board:".length);
}

export function firstBoardPanel(api: DockviewApi) {
  const panels = api.panels;
  for (const panel of panels) {
    if (isBoardPanelId(panel.id)) {
      return panel;
    }
  }
  return undefined;
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

export function seedDefaultLayout(api: DockviewApi, boardTitle: string, boardId: string): void {
  const firstBoard = boardPanelId(boardId);
  api.addPanel({
    id: firstBoard,
    component: "board",
    title: boardTitle || BOARD_TITLE,
    params: { boardId },
  });
  api.addPanel({
    id: "notation",
    component: "notation",
    title: PANEL_TITLES.notation,
    initialWidth: 460,
    position: { referencePanel: firstBoard, direction: "right" },
  });
  api.addPanel({
    id: "repertoire",
    component: "repertoire",
    title: PANEL_TITLES.repertoire,
    inactive: true,
    position: { referencePanel: "notation" },
  });
  api.addPanel({
    id: "engine",
    component: "engine",
    title: PANEL_TITLES.engine,
    initialHeight: 220,
    position: { referencePanel: firstBoard, direction: "below" },
  });
  api.addPanel({
    id: "evalGraph",
    component: "evalGraph",
    title: PANEL_TITLES.evalGraph,
    inactive: true,
    position: { referencePanel: "engine" },
  });
  api.addPanel({
    id: "review",
    component: "review",
    title: PANEL_TITLES.review,
    inactive: true,
    position: { referencePanel: "evalGraph" },
  });
  api.addPanel({
    id: "explorer",
    component: "explorer",
    title: PANEL_TITLES.explorer,
    inactive: true,
    position: { referencePanel: "notation" },
  });
  api.addPanel({
    id: "games",
    component: "games",
    title: PANEL_TITLES.games,
    inactive: true,
    position: { referencePanel: "notation" },
  });
}

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
  const sibling = firstBoardPanel(dockApi);
  if (sibling) {
    dockApi.addPanel({
      id,
      component: "board",
      title: title || BOARD_TITLE,
      params: { boardId },
      position: { referencePanel: sibling.id, direction: "right" },
    });
    return;
  }
  const reference = dockApi.getPanel("notation") ?? dockApi.getPanel("engine");
  dockApi.addPanel({
    id,
    component: "board",
    title: title || BOARD_TITLE,
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

  if (id === "engine" || id === "evalGraph" || id === "review") {
    const fallbackBoard = firstBoardPanel(dockApi);
    const reference =
      id === "review"
        ? (dockApi.getPanel("evalGraph") ?? dockApi.getPanel("engine") ?? fallbackBoard)
        : id === "evalGraph"
          ? (dockApi.getPanel("engine") ?? fallbackBoard ?? dockApi.getPanel("notation"))
          : (fallbackBoard ?? dockApi.getPanel("notation"));
    dockApi.addPanel({
      id,
      component: id,
      title: PANEL_TITLES[id],
      initialHeight: 220,
      position:
        id === "evalGraph" || id === "review"
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
    title: PANEL_TITLES[id],
    initialWidth: id === "notation" ? 460 : undefined,
    position: reference ? { referencePanel: reference.id } : undefined,
  });
}

export const OPEN_PANEL_ITEMS: Array<{ id: StudioPanelId; label: string }> = [
  { id: "notation", label: "Notation" },
  { id: "repertoire", label: "Repertoire" },
  { id: "engine", label: "Engine" },
  { id: "evalGraph", label: "Eval Graph" },
  { id: "review", label: "Game Review" },
  { id: "explorer", label: "Ultra Database" },
  { id: "games", label: "Ultra Games" },
  { id: "fileGames", label: "Games" },
];
