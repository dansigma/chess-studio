const STUDIO_PANELS = new Set([
  "notation",
  "repertoire",
  "engine",
  "evalGraph",
  "review",
  "insights",
  "explorer",
  "games",
  "fileGames",
  "positionSearch",
  "myStats",
  "opponentPrep",
]);

// SIG-907: per-board panels are `board:<boardId>` sharing contentComponent
// "board". The bare `board` id is retired (rejected by the sanitizer).
export function isBoardPanelId(id: string): boolean {
  if (!id.startsWith("board:")) {
    return false;
  }
  const suffix = id.slice("board:".length);
  return suffix.length > 0 && !/\s/.test(suffix);
}

// SIG-908: per-explorer panels are `explorer:<uid>` sharing contentComponent
// "explorer". The uid is opaque (crypto.randomUUID); the panel's source
// travels in dockview params (`params.source`), so the header dropdown can
// change it without renaming the panel. Unlike the retired bare `board`, the
// bare `explorer` id stays valid — it is the sidebar-driven default panel.
export function isExplorerPanelId(id: string): boolean {
  if (!id.startsWith("explorer:")) {
    return false;
  }
  const suffix = id.slice("explorer:".length);
  return suffix.length > 0 && !/\s/.test(suffix);
}

function isAllowedPanelId(id: string): boolean {
  return STUDIO_PANELS.has(id) || isBoardPanelId(id) || isExplorerPanelId(id);
}

export const DOCK_LAYOUT_VERSION = "board-tabs-1";
export const DOCK_LAYOUT_STORAGE_KEY = "studio-clone-dock-layout";

export type SanitizedDock = {
  grid: unknown;
  panels: Record<string, unknown>;
  activeGroup?: string;
} & Record<string, unknown>;

export type DockLayoutSnapshot = {
  version: typeof DOCK_LAYOUT_VERSION;
  dock: SanitizedDock;
};

// SIG-1316: built-in layout presets. Each one is a seed function in dock-api
// (`DOCK_PRESET_SEEDS`), not stored JSON; "full" is the default layout.
export const DOCK_PRESET_IDS = ["full", "study", "minimal"] as const;
export type DockPresetId = (typeof DOCK_PRESET_IDS)[number];

export function isDockPresetId(value: unknown): value is DockPresetId {
  return typeof value === "string" && (DOCK_PRESET_IDS as readonly string[]).includes(value);
}

// A layout the dock should place on its next (re)mount: a preset seed or a
// saved snapshot already remapped to the open boards.
export type PendingDockLayout =
  | { kind: "preset"; id: DockPresetId }
  | { kind: "snapshot"; snapshot: DockLayoutSnapshot };

let epoch = 0;
let queued: DockLayoutSnapshot | null = null;
let pending: PendingDockLayout | null = null;
let snapshotReader: (() => DockLayoutSnapshot | null) | null = null;
let listener: ((snapshot: DockLayoutSnapshot) => void) | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeGroup(
  data: Record<string, unknown>,
  allowed: ReadonlySet<string>,
): Record<string, unknown> | null {
  if (typeof data.id !== "string" || !Array.isArray(data.views)) {
    return null;
  }
  const views = data.views.filter((id): id is string => typeof id === "string" && allowed.has(id));
  if (views.length === 0) {
    return null;
  }
  const next: Record<string, unknown> = {
    ...data,
    views,
    activeView: typeof data.activeView === "string" && views.includes(data.activeView) ? data.activeView : views[0],
  };
  if (Array.isArray(data.tabGroups)) {
    next.tabGroups = data.tabGroups.flatMap((group) => {
      if (!isRecord(group) || !Array.isArray(group.panelIds)) {
        return [];
      }
      const panelIds = group.panelIds.filter(
        (id): id is string => typeof id === "string" && views.includes(id),
      );
      if (panelIds.length === 0) {
        return [];
      }
      return [{ ...group, panelIds }];
    });
  }
  return next;
}

function sanitizeNode(node: unknown, allowed: ReadonlySet<string>): Record<string, unknown> | null {
  if (!isRecord(node)) {
    return null;
  }
  if (node.type === "leaf") {
    if (!isRecord(node.data)) {
      return null;
    }
    const data = sanitizeGroup(node.data, allowed);
    if (!data) {
      return null;
    }
    return { ...node, data };
  }
  if (node.type === "branch") {
    if (!Array.isArray(node.data)) {
      return null;
    }
    const data = node.data
      .map((child) => sanitizeNode(child, allowed))
      .filter((child): child is Record<string, unknown> => child !== null);
    if (data.length === 0) {
      return null;
    }
    return { ...node, data };
  }
  return null;
}

function asBranch(root: Record<string, unknown>): Record<string, unknown> {
  if (root.type === "branch" && Array.isArray(root.data)) {
    return root;
  }
  return {
    type: "branch",
    data: [root],
    size: typeof root.size === "number" ? root.size : 1,
  };
}

function sanitizeWindowList(value: unknown, allowed: ReadonlySet<string>): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const next: Record<string, unknown>[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) {
      continue;
    }
    if (isRecord(entry.data)) {
      const data = sanitizeGroup(entry.data, allowed);
      if (data) {
        next.push({ ...entry, data });
      }
      continue;
    }
    if (isRecord(entry.grid)) {
      const root = sanitizeNode(entry.grid.root, allowed);
      if (root) {
        next.push({ ...entry, grid: { ...entry.grid, root: asBranch(root) } });
      }
    }
  }
  return next;
}

function sanitizeEdgeGroups(
  value: unknown,
  allowed: ReadonlySet<string>,
): Record<string, unknown> | null {
  if (!isRecord(value)) {
    return null;
  }
  const next: Record<string, unknown> = {};
  for (const side of ["top", "bottom", "left", "right"]) {
    const edge = value[side];
    if (!isRecord(edge)) {
      continue;
    }
    if (!isRecord(edge.group)) {
      next[side] = edge;
      continue;
    }
    if (!Array.isArray(edge.group.views)) {
      next[side] = edge;
      continue;
    }
    const group = sanitizeGroup(edge.group, allowed);
    if (!group) {
      continue;
    }
    next[side] = { ...edge, group };
  }
  return Object.keys(next).length > 0 ? next : null;
}

function collectGroupIds(node: unknown): string[] {
  if (!isRecord(node)) {
    return [];
  }
  if (node.type === "leaf" && isRecord(node.data) && typeof node.data.id === "string") {
    return [node.data.id];
  }
  if (node.type === "branch" && Array.isArray(node.data)) {
    return node.data.flatMap((child) => collectGroupIds(child));
  }
  return [];
}

function collectViews(node: unknown): string[] {
  if (!isRecord(node)) {
    return [];
  }
  if (node.type === "leaf" && isRecord(node.data) && Array.isArray(node.data.views)) {
    return node.data.views.filter((id): id is string => typeof id === "string");
  }
  if (node.type === "branch" && Array.isArray(node.data)) {
    return node.data.flatMap((child) => collectViews(child));
  }
  return [];
}

function windowGroupIds(entries: Record<string, unknown>[]): string[] {
  return entries.flatMap((entry) => {
    if (isRecord(entry.data)) {
      return typeof entry.data.id === "string" ? [entry.data.id] : [];
    }
    if (isRecord(entry.grid)) {
      return collectGroupIds(entry.grid.root);
    }
    return [];
  });
}

function windowViews(entries: Record<string, unknown>[]): string[] {
  return entries.flatMap((entry) => {
    if (isRecord(entry.data) && Array.isArray(entry.data.views)) {
      return entry.data.views.filter((id): id is string => typeof id === "string");
    }
    if (isRecord(entry.grid)) {
      return collectViews(entry.grid.root);
    }
    return [];
  });
}

export function sanitizeDockLayout(
  raw: unknown,
  knownBoardIds?: ReadonlySet<string>,
): DockLayoutSnapshot | null {
  if (!isRecord(raw) || raw.version !== DOCK_LAYOUT_VERSION || !isRecord(raw.dock)) {
    return null;
  }
  const dock = raw.dock;
  if (!isRecord(dock.panels) || !isRecord(dock.grid)) {
    return null;
  }
  const allowed = new Set<string>();
  for (const [id, panel] of Object.entries(dock.panels)) {
    if (!isAllowedPanelId(id) || !isRecord(panel)) {
      continue;
    }
    // SIG-907: optionally drop `board:*` panels whose session is gone.
    // Without known ids the sanitizer keeps every well-formed board panel
    // (restore path places verbatim; the dock prunes once boards hydrate).
    if (knownBoardIds && isBoardPanelId(id)) {
      const boardId = id.slice("board:".length);
      if (!knownBoardIds.has(boardId)) {
        continue;
      }
    }
    if (typeof panel.contentComponent === "string") {
      const expected = isBoardPanelId(id) || isExplorerPanelId(id) ? id.slice(0, id.indexOf(":")) : id;
      if (panel.contentComponent !== expected) {
        continue;
      }
    }
    allowed.add(id);
  }
  if (allowed.size === 0) {
    return null;
  }
  const root = sanitizeNode(dock.grid.root, allowed);
  if (!root) {
    return null;
  }
  const branch = asBranch(root);
  const floatingGroups = sanitizeWindowList(dock.floatingGroups, allowed);
  const popoutGroups = sanitizeWindowList(dock.popoutGroups, allowed);
  const edgeGroups = sanitizeEdgeGroups(dock.edgeGroups, allowed);
  const referenced = new Set([
    ...collectViews(branch),
    ...windowViews(floatingGroups),
    ...windowViews(popoutGroups),
  ]);
  if (edgeGroups) {
    for (const edge of Object.values(edgeGroups)) {
      if (isRecord(edge) && isRecord(edge.group) && Array.isArray(edge.group.views)) {
        for (const id of edge.group.views) {
          if (typeof id === "string") {
            referenced.add(id);
          }
        }
      }
    }
  }
  const panels: Record<string, unknown> = {};
  for (const [id, panel] of Object.entries(dock.panels)) {
    if (referenced.has(id) && isRecord(panel)) {
      panels[id] = panel;
    }
  }
  if (Object.keys(panels).length === 0) {
    return null;
  }
  const groupIds = [
    ...collectGroupIds(branch),
    ...windowGroupIds(floatingGroups),
    ...windowGroupIds(popoutGroups),
  ];
  const activeGroup =
    typeof dock.activeGroup === "string" && groupIds.includes(dock.activeGroup)
      ? dock.activeGroup
      : groupIds[0];
  const next: SanitizedDock = {
    ...dock,
    grid: { ...dock.grid, root: branch },
    panels,
  };
  if (activeGroup) {
    next.activeGroup = activeGroup;
  } else {
    delete next.activeGroup;
  }
  if (floatingGroups.length > 0) {
    next.floatingGroups = floatingGroups;
  } else {
    delete next.floatingGroups;
  }
  if (popoutGroups.length > 0) {
    next.popoutGroups = popoutGroups;
  } else {
    delete next.popoutGroups;
  }
  if (edgeGroups) {
    next.edgeGroups = edgeGroups;
  } else {
    delete next.edgeGroups;
  }
  return { version: DOCK_LAYOUT_VERSION, dock: next };
}

export function currentDockLayoutEpoch(): number {
  return epoch;
}

export function bumpDockLayoutEpoch(): void {
  epoch += 1;
  queued = null;
  pending = null;
}

export function queuePendingDockLayout(next: PendingDockLayout): void {
  pending = next;
}

export function takePendingDockLayout(): PendingDockLayout | null {
  const value = pending;
  pending = null;
  return value;
}

// The mounted dock registers a reader so store actions ("save current
// layout") can serialize the live arrangement without importing the dock.
export function setDockSnapshotReader(next: (() => DockLayoutSnapshot | null) | null): void {
  snapshotReader = next;
}

export function readLiveDockSnapshot(): DockLayoutSnapshot | null {
  return snapshotReader ? snapshotReader() : null;
}

function renameBoardIds(value: unknown, renames: ReadonlyMap<string, string>): unknown {
  if (typeof value === "string") {
    return renames.get(value) ?? value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => renameBoardIds(item, renames));
  }
  if (isRecord(value)) {
    const next: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      const newKey = renames.get(key) ?? key;
      if (key === "boardId" && typeof item === "string") {
        next[newKey] = renames.get(`board:${item}`)?.slice("board:".length) ?? item;
      } else {
        next[newKey] = renameBoardIds(item, renames);
      }
    }
    return next;
  }
  return value;
}

/**
 * SIG-1316: a saved layout carries the `board:<id>` panels of the boards that
 * were open when it was saved. Remap them onto the boards open now (in order);
 * surplus saved board panels are dropped, surplus open boards are left for the
 * caller to add to the board group. Never invents a board.
 */
export function remapBoardPanels(
  snapshot: DockLayoutSnapshot,
  boardIds: readonly string[],
): DockLayoutSnapshot | null {
  const saved: string[] = [];
  const seen = new Set<string>();
  const collect = (node: unknown): void => {
    if (!isRecord(node)) {
      return;
    }
    if (node.type === "leaf" && isRecord(node.data) && Array.isArray(node.data.views)) {
      for (const id of node.data.views) {
        if (typeof id === "string" && isBoardPanelId(id) && !seen.has(id)) {
          seen.add(id);
          saved.push(id);
        }
      }
    }
    if (node.type === "branch" && Array.isArray(node.data)) {
      node.data.forEach(collect);
    }
  };
  const dock = snapshot.dock;
  collect((dock.grid as { root?: unknown }).root);
  for (const id of Object.keys(dock.panels)) {
    if (isBoardPanelId(id) && !seen.has(id)) {
      seen.add(id);
      saved.push(id);
    }
  }
  const renames = new Map<string, string>();
  saved.slice(0, boardIds.length).forEach((id, index) => {
    renames.set(id, `board:${boardIds[index]}`);
  });
  const renamed = renameBoardIds({ version: snapshot.version, dock }, renames);
  return sanitizeDockLayout(renamed, new Set(boardIds));
}

// Existing users' saved layouts may predate the Review/Insights/My Stats/
// Repertoire panels; the dock adds those missing panels once. After that, a
// panel the user (or a preset) left out stays out across reloads.
const PANELS_ENSURED_KEY = "studio-clone-dock-panels-ensured";

export function panelsEnsured(): boolean {
  if (typeof window === "undefined") {
    return true;
  }
  try {
    return window.localStorage.getItem(PANELS_ENSURED_KEY) === "1";
  } catch {
    return true;
  }
}

export function markPanelsEnsured(): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(PANELS_ENSURED_KEY, "1");
  } catch {
    // Without storage the ensure pass simply repeats.
  }
}

export function readStoredDockLayout(): DockLayoutSnapshot | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(DOCK_LAYOUT_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return sanitizeDockLayout(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function writeStoredDockLayout(snapshot: DockLayoutSnapshot): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(DOCK_LAYOUT_STORAGE_KEY, JSON.stringify(snapshot));
}

export function clearStoredDockLayout(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(DOCK_LAYOUT_STORAGE_KEY);
}

export function setDockLayoutListener(next: ((snapshot: DockLayoutSnapshot) => void) | null): void {
  listener = next;
}

export function publishDockLayout(snapshot: DockLayoutSnapshot): void {
  if (listener) {
    listener(snapshot);
  } else {
    queued = snapshot;
  }
}

export function takeQueuedDockLayout(): DockLayoutSnapshot | null {
  const value = queued;
  queued = null;
  return value;
}
