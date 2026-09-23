import type { DockviewApi } from "dockview-react";

export type StudioPanelId =
  | "board"
  | "engine"
  | "evalGraph"
  | "notation"
  | "repertoire"
  | "explorer"
  | "games"
  | "fileGames";

const PANEL_TITLES: Record<StudioPanelId, string> = {
  board: "Board",
  engine: "Engine",
  evalGraph: "Eval Graph",
  notation: "Notation",
  repertoire: "Repertoire",
  explorer: "Ultra Database",
  games: "Ultra Games",
  fileGames: "Games",
};

let dockApi: DockviewApi | null = null;

export function registerStudioDock(api: DockviewApi | null): void {
  dockApi = api;
}

export function seedDefaultLayout(api: DockviewApi, boardTitle: string): void {
  api.addPanel({
    id: "board",
    component: "board",
    title: boardTitle || PANEL_TITLES.board,
  });
  api.addPanel({
    id: "notation",
    component: "notation",
    title: PANEL_TITLES.notation,
    initialWidth: 460,
    position: { referencePanel: "board", direction: "right" },
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
    position: { referencePanel: "board", direction: "below" },
  });
  api.addPanel({
    id: "evalGraph",
    component: "evalGraph",
    title: PANEL_TITLES.evalGraph,
    inactive: true,
    position: { referencePanel: "engine" },
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

export function openStudioPanel(id: StudioPanelId): void {
  if (!dockApi) {
    return;
  }
  const existing = dockApi.getPanel(id);
  if (existing) {
    existing.api.setActive();
    return;
  }

  if (id === "board") {
    const reference = dockApi.getPanel("notation") ?? dockApi.getPanel("engine");
    dockApi.addPanel({
      id,
      component: id,
      title: PANEL_TITLES.board,
      position: reference ? { referencePanel: reference.id, direction: "left" } : undefined,
    });
    return;
  }

  if (id === "engine" || id === "evalGraph") {
    const reference =
      id === "evalGraph"
        ? (dockApi.getPanel("engine") ?? dockApi.getPanel("board") ?? dockApi.getPanel("notation"))
        : (dockApi.getPanel("board") ?? dockApi.getPanel("notation"));
    dockApi.addPanel({
      id,
      component: id,
      title: PANEL_TITLES[id],
      initialHeight: 220,
      position:
        id === "evalGraph"
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
    dockApi.getPanel("board");
  dockApi.addPanel({
    id,
    component: id,
    title: PANEL_TITLES[id],
    initialWidth: id === "notation" ? 460 : undefined,
    position: reference ? { referencePanel: reference.id } : undefined,
  });
}

export const OPEN_PANEL_ITEMS: Array<{ id: StudioPanelId; label: string }> = [
  { id: "board", label: "Board" },
  { id: "notation", label: "Notation" },
  { id: "repertoire", label: "Repertoire" },
  { id: "engine", label: "Engine" },
  { id: "evalGraph", label: "Eval Graph" },
  { id: "explorer", label: "Ultra Database" },
  { id: "games", label: "Ultra Games" },
  { id: "fileGames", label: "Games" },
];
