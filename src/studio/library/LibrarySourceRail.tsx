"use client";

// SIG-1337: the Library's sources rail — public databases, My Games and the PGN
// file tree live left of the games table; the old source bar above it is gone.
import Link from "next/link";
import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent, type ReactNode, type RefObject } from "react";
import {
  Bookmark,
  ChevronDown,
  ChevronRight,
  ClipboardPaste,
  Database as DatabaseIcon,
  Ellipsis,
  FileUp,
  Folder,
  FolderOpen,
  Globe,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import { tLibrary } from "@/src/i18n/library-strings";
import { explorerSourceTitle } from "@/src/lib/explorer-types";
import { MASTERS_SOURCE_ID } from "@/src/lib/library/masters-source";
import { getLibrarySource, listLibrarySources } from "@/src/lib/library/sources";
import { defaultLibraryFilters, type LibrarySourceId } from "@/src/lib/library/types";
import { useStudioStore } from "@/src/store/studio-store";
import { downloadTextFile } from "@/src/lib/download-file";
import { databaseExportFilename, databaseToPgn } from "@/src/lib/export-database-pgn";
import { Button, IconButton } from "../ui/Button";
import { Badge, Chip } from "../ui/Controls";
import { Dialog } from "../ui/Dialog";
import { MenuItem, MenuSurface } from "../ui/Menu";
import { Panel } from "../ui/Panel";
import { buildFolderTree, type FolderNode } from "../files-tree";
import { formatGameCount } from "./filter-chips";
import { selectAll, selectOnly, toggleSource } from "./library-sources";
import { readLibraryRailCollapsed, writeLibraryRailCollapsed } from "./library-layout";
import {
  FolderActionsMenu,
  FolderMoveDialog,
  FolderRenameDialog,
  FoldersMenu,
  PastePgnDialog,
  PopMenu,
  anchorBelow,
  folderScope,
  useMenuPosition,
  useSelectedFolderId,
  type MenuAnchor,
} from "./LibraryFolders";
import { useLibraryStore } from "./library-store";
import {
  FOLDER_EXPAND_DELAY_MS,
  LIBRARY_DATABASE_MIME,
  draggedDatabaseId,
  hasDatabaseDrag,
  hasFileDrag,
} from "./library-drag";
import { libraryToExplorerSource } from "./reference-source";
import { useLibraryImport } from "./use-library-import";

const MENU_MIN_WIDTH = 176;
const NESTED_INDENT = 14;
/** SIG-1343: the folder row a drag is over, and the accent ring that marks it. */
type DropTarget = { folderId: string | null };
const DROP_HIGHLIGHT = "bg-studio-accent-soft text-studio-accent-text ring-1 ring-inset ring-studio-accent";

/** SIG-1340: a menu anchored at the pointer of a context-menu event, kept inside the viewport. */
function pointerMenuAnchor(event: MouseEvent<Element>): MenuAnchor {
  return {
    x: Math.max(8, Math.min(event.clientX, window.innerWidth - MENU_MIN_WIDTH - 8)),
    y: event.clientY,
    top: event.clientY,
  };
}

export type LibrarySourceRailProps = {
  sourceErrors: Partial<Record<LibrarySourceId, string>>;
  /** When true, renders full-width inside a mobile BottomSheet without the desktop collapse chrome. */
  inSheet?: boolean;
};

/** My Games total, fetched once per mount; null while loading, on error or signed out. */
function useMyGamesCount(enabled: boolean): number | null {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const controller = new AbortController();
    const adapter = getLibrarySource("my-games");
    if (!adapter) {
      return;
    }
    void (async () => {
      try {
        const page = await adapter.list(defaultLibraryFilters(["my-games"]), null, 1, controller.signal);
        if (!controller.signal.aborted && typeof page.total === "number") {
          setCount(page.total);
        }
      } catch {
        // Signed out or offline: show the row without a count.
      }
    })();
    return () => controller.abort();
  }, [enabled]);
  return count;
}

type SourceKind = "public" | "mine" | "folder" | "file";

/** SIG-1340: what a rail row stands for, so each kind gets its own icon. */
function sourceKind(id: LibrarySourceId): SourceKind {
  if (id === MASTERS_SOURCE_ID) {
    return "public";
  }
  if (id === "my-games") {
    return "mine";
  }
  return id.startsWith("file:") ? "file" : "public";
}

/** The kind icon at the start of a row; faint at rest, accent on the selected row. */
function SourceKindIcon({
  kind,
  selected,
  expanded = true,
  className: extra = "",
}: {
  kind: SourceKind;
  selected: boolean;
  expanded?: boolean;
  className?: string;
}) {
  const className = `shrink-0 ${selected ? "text-studio-accent-text" : "text-studio-faint"} ${extra}`.trim();
  const common = {
    size: 14,
    className,
    "data-testid": "library-source-icon",
    "data-kind": kind,
  } as const;
  if (kind === "public") {
    return <Globe {...common} />;
  }
  if (kind === "mine") {
    return <UserRound {...common} />;
  }
  if (kind === "folder") {
    return expanded ? <FolderOpen {...common} /> : <Folder {...common} />;
  }
  return <DatabaseIcon {...common} />;
}

/**
 * Inline name editor for a PGN file row: Enter or clicking away saves the
 * trimmed name, Esc cancels, an empty name is refused on Enter (SIG-1404: on
 * blur it cancels instead of saving).
 */
export function FileNameInput({
  initial,
  label,
  onCommit,
  onCancel,
}: {
  initial: string;
  label: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  // Escape hides the editor; the blur that may follow must not save what was typed.
  const cancelledRef = useRef(false);
  // Enter already saved; the blur that follows must not save the same name again.
  const committedRef = useRef(false);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  /** Save the trimmed name once; an unchanged name just closes the editor. */
  const save = () => {
    if (committedRef.current) {
      return;
    }
    const next = value.trim();
    if (!next) {
      return;
    }
    if (next === initial.trim()) {
      cancelledRef.current = true;
      onCancel();
      return;
    }
    committedRef.current = true;
    onCommit(next);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      save();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      cancelledRef.current = true;
      onCancel();
    }
  };
  return (
    <input
      ref={ref}
      aria-label={label}
      value={value}
      maxLength={120}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={onKeyDown}
      onBlur={() => {
        if (cancelledRef.current || committedRef.current) {
          return;
        }
        // Empty on blur cancels; only Escape or an empty value may throw the text away.
        if (!value.trim()) {
          cancelledRef.current = true;
          onCancel();
          return;
        }
        save();
      }}
      className="h-7 min-w-0 flex-1 rounded-md bg-transparent px-2 text-dense font-medium text-studio-fg outline-none"
    />
  );
}

/** SIG-1337: collapsible rail listing every source plus the PGN folder tree. */
export function LibrarySourceRail({ sourceErrors, inSheet = false }: LibrarySourceRailProps) {
  const locale = useStudioStore((s) => s.settings.locale);
  const databases = useStudioStore((s) => s.files.databases);
  const folders = useStudioStore((s) => s.files.folders);
  const selected = useLibraryStore((s) => s.filters.sources);
  const setSources = useLibraryStore((s) => s.setSources);
  const setFolderId = useLibraryStore((s) => s.setFolderId);
  const selectedFolderId = useSelectedFolderId();
  // The adapter registry is not reactive; `databases` changes re-render this.
  const adapters = listLibrarySources();
  const ids = adapters.map((adapter) => adapter.id);
  const hasMyGames = ids.includes("my-games");
  const myGamesCount = useMyGamesCount(hasMyGames);
  const renameFileDatabase = useStudioStore((s) => s.renameFileDatabase);
  const deleteFileDatabase = useStudioStore((s) => s.deleteFileDatabase);
  const moveFileDatabase = useStudioStore((s) => s.moveFileDatabase);
  const referenceSource = useStudioStore((s) => s.databaseSource);
  const setDatabaseSource = useStudioStore((s) => s.setDatabaseSource);
  const importFiles = useLibraryImport();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(() => new Set());
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [menu, setMenu] = useState<(MenuAnchor & { databaseId: string }) | null>(null);
  const [folderMenu, setFolderMenu] = useState<(MenuAnchor & { folderId: string }) | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [importMenu, setImportMenu] = useState<MenuAnchor | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Read after mount so server and first client render agree.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCollapsed(readLibraryRailCollapsed());
  }, []);

  useEffect(() => {
    if (!menu) {
      return;
    }
    const onDown = (event: PointerEvent) => {
      const target = event.target as Element;
      if (!menuRef.current?.contains(target) && !target.closest?.('[data-testid="library-source-menu"]')) {
        setMenu(null);
      }
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [menu]);

  const selectedAvailable = ids.filter((id) => selected.includes(id));
  const allSelected = selectedAvailable.length === ids.length;
  const signedIn = useStudioStore((state) => Boolean(state.user));
  const t = (key: Parameters<typeof tLibrary>[1], vars?: Record<string, string | number>) => tLibrary(locale, key, vars);

  const count = (id: LibrarySourceId): string | null => {
    if (id === MASTERS_SOURCE_ID) {
      return t("library.sources.mastersLimit");
    }
    let total: number | null = null;
    if (id === "my-games") {
      total = myGamesCount;
    } else if (id.startsWith("file:")) {
      const db = databases.find((database) => `file:${database.id}` === id);
      total = db ? db.games.length : null;
    }
    return total === null
      ? null
      : t(total === 1 ? "library.sources.games.one" : "library.sources.games.other", {
          count: formatGameCount(total, locale),
        });
  };

  const name = (id: LibrarySourceId): string => adapters.find((item) => item.id === id)?.label(locale) ?? id;

  const click = (id: LibrarySourceId) => (event: MouseEvent) => {
    setSources(event.ctrlKey || event.metaKey ? toggleSource(selected, id, ids) : selectOnly(id));
  };

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    writeLibraryRailCollapsed(next);
  };

  const toggleFolder = (folderId: string) => {
    setCollapsedFolders((current) => {
      const next = new Set(current);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  // SIG-1343: a PGN row or a file from the computer can be dropped on a folder.
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const expandTimer = useRef<{ folderId: string; handle: ReturnType<typeof setTimeout> } | null>(null);

  const cancelFolderExpand = () => {
    if (expandTimer.current) {
      clearTimeout(expandTimer.current.handle);
      expandTimer.current = null;
    }
  };

  useEffect(() => {
    // A drag that ends anywhere (or is dropped outside the rail) leaves no highlight.
    const clear = () => {
      if (expandTimer.current) {
        clearTimeout(expandTimer.current.handle);
        expandTimer.current = null;
      }
      setDropTarget(null);
    };
    window.addEventListener("dragend", clear);
    window.addEventListener("drop", clear);
    return () => {
      window.removeEventListener("dragend", clear);
      window.removeEventListener("drop", clear);
      if (expandTimer.current) {
        clearTimeout(expandTimer.current.handle);
        expandTimer.current = null;
      }
    };
  }, []);

  /** Open a collapsed folder after the pointer rests on it, so the drop can go one level deeper. */
  const scheduleFolderExpand = (folderId: string) => {
    if (expandTimer.current?.folderId === folderId) {
      return;
    }
    cancelFolderExpand();
    if (!collapsedFolders.has(folderId)) {
      return;
    }
    expandTimer.current = {
      folderId,
      handle: setTimeout(() => {
        expandTimer.current = null;
        setCollapsedFolders((current) => {
          if (!current.has(folderId)) {
            return current;
          }
          const next = new Set(current);
          next.delete(folderId);
          return next;
        });
      }, FOLDER_EXPAND_DELAY_MS),
    };
  };

  const acceptsFileDrop = (event: DragEvent<HTMLElement>) => hasFileDrag(event) || hasDatabaseDrag(event);

  const moveDraggedDatabase = (folderId: string | null, event: DragEvent<HTMLElement>) => {
    const database = databases.find((item) => item.id === draggedDatabaseId(event));
    // Dropping a file on the folder it already lives in changes nothing.
    if (database && database.folderId !== folderId) {
      moveFileDatabase(database.id, folderId);
    }
  };

  const folderDragOver = (folderId: string) => (event: DragEvent<HTMLElement>) => {
    if (!acceptsFileDrop(event)) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = hasDatabaseDrag(event) ? "move" : "copy";
    setDropTarget((current) => (current?.folderId === folderId ? current : { folderId }));
    scheduleFolderExpand(folderId);
  };

  const folderDragLeave = (event: DragEvent<HTMLElement>) => {
    const next = event.relatedTarget as Node | null;
    if (next && event.currentTarget.contains(next)) {
      return;
    }
    cancelFolderExpand();
    setDropTarget(null);
  };

  const folderDrop = (folderId: string) => (event: DragEvent<HTMLElement>) => {
    if (!acceptsFileDrop(event)) {
      return;
    }
    // The Library root must not import the same drop again.
    event.preventDefault();
    event.stopPropagation();
    cancelFolderExpand();
    setDropTarget(null);
    if (hasDatabaseDrag(event)) {
      moveDraggedDatabase(folderId, event);
      return;
    }
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length > 0) {
      // The usual progress, limits and name-conflict questions, into this folder.
      void importFiles(files, { folderId });
    }
  };

  /** "My files" takes a dragged PGN row out of any folder; computer files still fall through to the root. */
  const headingDropTarget = dropTarget !== null && dropTarget.folderId === null;

  const headingDragOver = (event: DragEvent<HTMLElement>) => {
    if (!hasDatabaseDrag(event)) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropTarget((current) => (current?.folderId === null ? current : { folderId: null }));
  };

  const headingDragLeave = (event: DragEvent<HTMLElement>) => {
    const next = event.relatedTarget as Node | null;
    if (next && event.currentTarget.contains(next)) {
      return;
    }
    setDropTarget(null);
  };

  const headingDrop = (event: DragEvent<HTMLElement>) => {
    if (!hasDatabaseDrag(event)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setDropTarget(null);
    moveDraggedDatabase(null, event);
  };

  /** Every PGN source in a folder and its subfolders. */
  const fileIdsInFolder = (folderId: string): LibrarySourceId[] => {
    const scope = folderScope(folders, folderId);
    if (!scope) {
      return [];
    }
    return ids.filter((id) => {
      if (!id.startsWith("file:")) {
        return false;
      }
      const database = databases.find((item) => `file:${item.id}` === id);
      return database?.folderId ? scope.has(database.folderId) : false;
    });
  };

  const selectFolder = (folderId: string) => {
    // Clicking the current folder again leaves it: imports go back to no folder.
    if (selectedFolderId === folderId) {
      setFolderId(null);
      return;
    }
    // Imports land in the folder being viewed, and its files become the sources.
    setFolderId(folderId);
    // An empty folder selects no source, so the table shows that folder (empty)
    // instead of the previous selection; imports still land in it.
    setSources(fileIdsInFolder(folderId));
  };

  const sourceRow = (id: LibrarySourceId, depth = 0): ReactNode => {
    const adapter = adapters.find((item) => item.id === id);
    if (!adapter) {
      return null;
    }
    const isSelected = selected.includes(id);
    const isLast = isSelected && selectedAvailable.length <= 1;
    const error = sourceErrors[id];
    // The count (or Masters' "Top 15 per position") sits on a subline under
    // the name, so long names never truncate against it.
    const subline = count(id);
    const databaseId = id.startsWith("file:") ? id.slice("file:".length) : null;
    const database = databaseId ? databases.find((item) => item.id === databaseId) : undefined;
    const label = adapter.label(locale);
    const explorerSource = libraryToExplorerSource(id);
    const isReference = explorerSource !== null && explorerSource === referenceSource;
    const renaming = database !== undefined && renamingId === database.id;
    // Curated/Lichess have no row: Masters' tooltip says which database is really in use.
    const outsideLibrary =
      id === MASTERS_SOURCE_ID && referenceSource !== "masters" && !referenceSource.startsWith("file:");
    const referenceLabel = outsideLibrary
      ? `${t("library.sources.reference.other", { name: explorerSourceTitle(referenceSource, databases, locale) })}. ${t("library.sources.reference.use")}`
      : t("library.sources.reference.use");
    // The reference is marked by the REF badge; the action only appears where it changes something.
    const showReference = !renaming && explorerSource !== null && !isReference;
    const showRename = !renaming && database !== undefined;
    const showMenu = !renaming && database !== undefined;
    const hasActions = showReference || showRename || showMenu;
    // Multi-select is visible: a checkbox takes the kind icon's place on hover,
    // and stays while several sources are selected (Ctrl/⌘-click still works).
    const multi = selectedAvailable.length > 1;
    const checkboxShown = multi && isSelected;
    const checkboxClass = checkboxShown
      ? "opacity-100"
      : "pointer-events-none opacity-0 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100";
    const iconHiddenClass = checkboxShown
      ? "invisible"
      : "group-focus-within:invisible group-hover:invisible";
    const sourceActionsClass =
      "hidden shrink-0 items-center gap-0.5 pr-1 group-focus-within:flex group-hover:flex";
    const refBadge = isReference ? (
      <span title={t("library.sources.reference.title")} data-testid="library-source-ref-badge">
        <Badge tone="accent">{t("library.sources.reference.badge")}</Badge>
      </span>
    ) : null;
    const errorMark = error !== undefined ? (
      <span
        role="img"
        title={t("library.sources.failed", { message: error })}
        aria-label={t("library.sources.failed", { message: error })}
        className="shrink-0 text-studio-danger"
      >
        <TriangleAlert size={12} />
      </span>
    ) : null;
    // SIG-1343: only the PGN file rows can be dragged, and only onto a folder.
    const dragProps =
      database && !renaming
        ? {
            draggable: true,
            onDragStart: (event: DragEvent<HTMLDivElement>) => {
              event.dataTransfer.effectAllowed = "move";
              try {
                // Firefox starts no drag without data.
                event.dataTransfer.setData(LIBRARY_DATABASE_MIME, database.id);
              } catch {
                // Some environments refuse; the drag then ends without moving the file.
              }
            },
            onDragEnd: () => {
              cancelFolderExpand();
              setDropTarget(null);
            },
          }
        : {};
    return (
      <div key={id} data-depth={depth} style={{ paddingLeft: `${depth * NESTED_INDENT}px` }} className="flex min-w-0">
        <div
          {...dragProps}
          onContextMenu={
            database && !renaming
              ? (event) => {
                  event.preventDefault();
                  setMenu({ databaseId: database.id, ...pointerMenuAnchor(event) });
                }
              : undefined
          }
          className={`group relative flex min-w-0 flex-1 items-stretch rounded-md border ${
            isSelected
              ? "border-studio-accent bg-studio-accent-soft text-studio-accent-text"
              : "border-transparent text-studio-muted hover:bg-studio-hover hover:text-studio-fg"
          }`}
        >
          {renaming && database ? (
            <FileNameInput
              initial={database.name}
              label={t("library.sources.file.renameLabel")}
              onCommit={(next) => {
                renameFileDatabase(database.id, next);
                setRenamingId(null);
              }}
              onCancel={() => setRenamingId(null)}
            />
          ) : (
            <button
              type="button"
              data-testid="library-source-card"
              aria-pressed={isSelected}
              title={isLast ? t("library.sources.lastGuard") : undefined}
              onClick={click(id)}
              className={`min-w-0 flex-1 px-2 text-left ${
                subline !== null ? "flex flex-col justify-center gap-0.5 py-1" : "flex h-7 items-center gap-1.5"
              }`}
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <SourceKindIcon kind={sourceKind(id)} selected={isSelected} className={iconHiddenClass} />
                <span className="min-w-0 flex-1 truncate text-dense font-medium leading-tight" title={label}>
                  {label}
                </span>
                {refBadge}
                {errorMark}
              </span>
              {subline !== null ? (
                <span
                  data-testid="library-source-count"
                  className="truncate pl-5 text-caption leading-tight tabular-nums text-studio-faint"
                >
                  {subline}
                </span>
              ) : null}
            </button>
          )}
          {!renaming ? (
            <input
              type="checkbox"
              data-testid="library-source-checkbox"
              aria-label={t("library.sources.multiSelect", { name: label })}
              title={isLast ? t("library.sources.lastGuard") : t("library.sources.multiSelect", { name: label })}
              checked={isSelected}
              disabled={isLast}
              onChange={() => setSources(toggleSource(selected, id, ids))}
              onClick={(event) => event.stopPropagation()}
              className={`absolute left-2 ${subline !== null ? "top-[5px]" : "top-[7px]"} h-3.5 w-3.5 cursor-pointer accent-studio-accent transition-opacity disabled:cursor-default ${checkboxClass}`}
            />
          ) : null}
          {hasActions ? (
            <div className={sourceActionsClass}>
              {showReference && explorerSource !== null ? (
                <IconButton
                  label={referenceLabel}
                  size="sm"
                  data-testid="library-source-reference"
                  className="text-studio-muted"
                  onClick={(event) => {
                    event.stopPropagation();
                    setDatabaseSource(explorerSource);
                  }}
                >
                  <Bookmark size={14} />
                </IconButton>
              ) : null}
              {showRename && database ? (
                <IconButton
                  label={t("library.sources.file.rename")}
                  size="sm"
                  data-testid="library-source-rename"
                  className="text-studio-muted"
                  onClick={(event) => {
                    event.stopPropagation();
                    setRenamingId(database.id);
                  }}
                >
                  <Pencil size={14} />
                </IconButton>
              ) : null}
              {showMenu && database ? (
                <IconButton
                  label={t("library.sources.file.more")}
                  size="sm"
                  aria-haspopup="menu"
                  aria-expanded={menu?.databaseId === database.id}
                  data-testid="library-source-menu"
                  className="text-studio-muted"
                  onClick={(event) => {
                    event.stopPropagation();
                    if (menu?.databaseId === database.id) {
                      setMenu(null);
                      return;
                    }
                    const rect = event.currentTarget.getBoundingClientRect();
                    // Keep the menu (min-w-44 = 176px) inside the viewport near the right edge.
                    const x = Math.max(8, Math.min(rect.left, window.innerWidth - MENU_MIN_WIDTH - 8));
                    setMenu({ databaseId: database.id, x, y: rect.bottom + 4, top: rect.top });
                  }}
                >
                  <Ellipsis size={14} />
                </IconButton>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    );
  };

  const folderRow = (node: FolderNode, depth: number): ReactNode => {
    const expanded = !collapsedFolders.has(node.folder.id);
    const isCurrent = selectedFolderId === node.folder.id;
    const isDropTarget = dropTarget?.folderId === node.folder.id;
    const actionsClass =
      "pointer-events-none absolute inset-y-0 right-1 flex items-center gap-0.5 bg-inherit opacity-0 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100";
    return (
      <div key={`folder:${node.folder.id}`}>
        <div
          data-depth={depth}
          data-drop-target={isDropTarget ? "" : undefined}
          style={{ paddingLeft: `${depth * NESTED_INDENT}px` }}
          onContextMenu={(event) => {
            event.preventDefault();
            setFolderMenu({ folderId: node.folder.id, ...pointerMenuAnchor(event) });
          }}
          onDragOver={folderDragOver(node.folder.id)}
          onDragLeave={folderDragLeave}
          onDrop={folderDrop(node.folder.id)}
          className={`group relative flex min-w-0 items-center rounded-md ${
            isCurrent ? "bg-studio-hover-strong text-studio-fg" : "text-studio-muted hover:bg-studio-hover hover:text-studio-fg"
          } ${isDropTarget ? DROP_HIGHLIGHT : ""}`}
        >
          <IconButton
            label={expanded ? t("library.sources.folder.collapse", { name: node.folder.name }) : t("library.sources.folder.expand", { name: node.folder.name })}
            size="sm"
            aria-expanded={expanded}
            data-testid="library-folder-toggle"
            className="shrink-0"
            onClick={() => toggleFolder(node.folder.id)}
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </IconButton>
          <button
            type="button"
            data-testid="library-folder"
            aria-pressed={isCurrent}
            onClick={() => selectFolder(node.folder.id)}
            className="flex h-7 min-w-0 flex-1 items-center gap-1.5 pr-8 text-left text-dense font-medium"
          >
            <SourceKindIcon kind="folder" selected={isCurrent} expanded={expanded} />
            <span className="truncate">{node.folder.name}</span>
          </button>
          <div className={actionsClass}>
            <IconButton
              label={t("library.sources.file.rename")}
              size="sm"
              data-testid="library-folder-rename"
              className="text-studio-muted"
              onClick={(event) => {
                event.stopPropagation();
                setRenamingFolderId(node.folder.id);
              }}
            >
              <Pencil size={14} />
            </IconButton>
          </div>
        </div>
        {expanded ? (
          <>
            {node.children.map((child) => folderRow(child, depth + 1))}
            {node.databases.map((database) => sourceRow(`file:${database.id}`, depth + 1))}
          </>
        ) : null}
      </div>
    );
  };

  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept=".pgn"
      multiple
      hidden
      data-testid="library-import-input"
      onChange={(event) => {
        const files = Array.from(event.target.files ?? []);
        event.target.value = "";
        if (files.length > 0) {
          void importFiles(files);
        }
      }}
    />
  );

  const importControl = (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="shrink-0"
        aria-haspopup="menu"
        aria-expanded={importMenu !== null}
        data-popmenu-trigger=""
        onClick={(event) => setImportMenu(importMenu ? null : anchorBelow(event.currentTarget))}
      >
        {t("library.import.button")}
      </Button>
      {fileInput}
    </>
  );

  const menuDb = menu ? databases.find((item) => item.id === menu.databaseId) : undefined;
  const menuFolder = folderMenu ? folders.find((item) => item.id === folderMenu.folderId) : undefined;
  const renamingFolder = renamingFolderId ? folders.find((item) => item.id === renamingFolderId) : undefined;
  const deletingDb = deletingId ? databases.find((item) => item.id === deletingId) : undefined;
  const movingDb = movingId ? databases.find((item) => item.id === movingId) : undefined;
  const mastersId = ids.find((id) => id === MASTERS_SOURCE_ID);
  const tree = buildFolderTree(folders, databases, "");
  const railLabel = t("library.sources.barLabel");

  const dialogs = (
    <>
      {menu && menuDb ? (
        <FileMenuPosition anchor={menu} menuRef={menuRef}>
          <MenuSurface className="min-w-44" onClose={() => setMenu(null)} label={menuDb.name}>
            <MenuItem
              label={t("library.sources.file.rename")}
              onClick={() => {
                setMenu(null);
                setRenamingId(menuDb.id);
              }}
            />
            <MenuItem
              label={t("library.sources.file.move")}
              onClick={() => {
                setMenu(null);
                setMovingId(menuDb.id);
              }}
            />
            <MenuItem
              label={t("library.sources.file.export")}
              onClick={() => {
                setMenu(null);
                downloadTextFile(databaseExportFilename(menuDb), databaseToPgn(menuDb));
              }}
            />
            <MenuItem
              label={t("library.sources.file.delete")}
              danger
              onClick={() => {
                setMenu(null);
                setDeletingId(menuDb.id);
              }}
            />
          </MenuSurface>
        </FileMenuPosition>
      ) : null}
      {folderMenu && menuFolder ? (
        <FolderActionsMenu folder={menuFolder} anchor={folderMenu} onClose={() => setFolderMenu(null)} />
      ) : null}
      {renamingFolder ? (
        <FolderRenameDialog folder={renamingFolder} onClose={() => setRenamingFolderId(null)} />
      ) : null}
      {importMenu ? (
        <PopMenu anchor={importMenu} label={t("library.import.button")} onClose={() => setImportMenu(null)}>
          <MenuItem
            label={t("library.import.fromFile")}
            leading={<FileUp size={14} className="text-studio-faint" />}
            onClick={() => {
              setImportMenu(null);
              fileInputRef.current?.click();
            }}
          />
          <MenuItem
            label={t("library.import.paste")}
            leading={<ClipboardPaste size={14} className="text-studio-faint" />}
            onClick={() => {
              setImportMenu(null);
              setPasteOpen(true);
            }}
          />
        </PopMenu>
      ) : null}
      {pasteOpen ? <PastePgnDialog onImport={(file) => void importFiles([file])} onClose={() => setPasteOpen(false)} /> : null}
      {movingDb ? (
        <FolderMoveDialog
          title={t("library.folders.moveFileTitle", { name: movingDb.name })}
          noneLabel={t("library.folders.none")}
          noneDisabled={movingDb.folderId === null}
          isDisabled={(id) => id === movingDb.folderId}
          onClose={() => setMovingId(null)}
          onPick={(folderId) => {
            moveFileDatabase(movingDb.id, folderId);
            setMovingId(null);
          }}
        />
      ) : null}
      {deletingDb ? (
        <Dialog
          title={t("library.sources.file.deleteTitle", { name: deletingDb.name })}
          onClose={() => setDeletingId(null)}
          width="w-[24rem]"
          footer={
            <>
              <Button variant="ghost" onClick={() => setDeletingId(null)}>
                {t("library.sources.file.cancel")}
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  deleteFileDatabase(deletingDb.id);
                  setDeletingId(null);
                }}
              >
                {t("library.sources.file.deleteConfirm")}
              </Button>
            </>
          }
        >
          {t("library.sources.file.deleteBody")}
        </Dialog>
      ) : null}
    </>
  );

  if (collapsed && !inSheet) {
    return (
      <Panel
        as="aside"
        aria-label={railLabel}
        data-testid="library-source-rail"
        className="flex w-10 shrink-0 flex-col items-center gap-1 overflow-y-auto py-1"
      >
        <IconButton label={t("library.sources.rail.expand")} size="sm" aria-expanded={false} onClick={toggleCollapsed}>
          <PanelLeftOpen size={14} />
        </IconButton>
        {ids.map((id) => {
          const detail = count(id);
          const error = sourceErrors[id];
          const base = detail === null ? name(id) : `${name(id)} · ${detail}`;
          const title = error === undefined ? base : `${base} · ${t("library.sources.failed", { message: error })}`;
          return (
            <button
              key={id}
              type="button"
              data-testid="library-source-marker"
              aria-pressed={selected.includes(id)}
              aria-label={title}
              title={title}
              onClick={click(id)}
              data-failed={error !== undefined ? "" : undefined}
              className={`relative flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-caption font-semibold ${
                selected.includes(id)
                  ? "bg-studio-accent-soft text-studio-accent-text"
                  : "text-studio-muted hover:bg-studio-hover-strong hover:text-studio-fg"
              }`}
            >
              <SourceKindIcon kind={sourceKind(id)} selected={selected.includes(id)} />
              {error !== undefined ? (
                <TriangleAlert
                  size={9}
                  aria-hidden
                  className="absolute -right-0.5 -top-0.5 text-studio-danger"
                  data-testid="library-source-marker-failed"
                />
              ) : null}
            </button>
          );
        })}
        <IconButton
          label={t("library.import.button")}
          size="sm"
          className="mt-auto"
          aria-haspopup="menu"
          aria-expanded={importMenu !== null}
          data-popmenu-trigger=""
          onClick={(event) => setImportMenu(importMenu ? null : anchorBelow(event.currentTarget))}
        >
          <FileUp size={14} />
        </IconButton>
        {fileInput}
        {dialogs}
      </Panel>
    );
  }

  const railBody = (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-1 py-1">
        <div className="px-0.5 pb-1">
          <Chip
            active={allSelected}
            onClick={() => {
              // "All" also leaves the current folder, as "All folders" did in the old dropdown.
              setFolderId(null);
              setSources(selectAll(ids));
            }}
          >
            {t("library.sources.selectAll")}
          </Chip>
        </div>
        <section role="group" aria-label={t("library.sources.group.public")} className="flex flex-col gap-0.5">
          <h3 className="px-2 pb-0.5 pt-1 text-caption font-semibold uppercase tracking-wide text-studio-faint">
            {t("library.sources.group.public")}
          </h3>
          {mastersId ? sourceRow(mastersId) : null}
        </section>
        <section role="group" aria-label={t("library.sources.group.myGames")} className="flex flex-col gap-0.5">
          <h3 className="px-2 pb-0.5 pt-1 text-caption font-semibold uppercase tracking-wide text-studio-faint">
            {t("library.sources.group.myGames")}
          </h3>
          {hasMyGames ? sourceRow("my-games") : null}
        </section>
        <section role="group" aria-label={t("library.sources.group.files")} className="flex flex-col gap-0.5">
          <h3
            data-testid="library-files-heading"
            data-drop-target={headingDropTarget ? "" : undefined}
            onDragOver={headingDragOver}
            onDragLeave={headingDragLeave}
            onDrop={headingDrop}
            className={`rounded px-2 pb-0.5 pt-1 text-caption font-semibold uppercase tracking-wide text-studio-faint ${
              headingDropTarget ? DROP_HIGHLIGHT : ""
            }`}
          >
            {t("library.sources.group.files")}
          </h3>
          {!signedIn ? (
            <Link href="/login" className="rounded px-2 py-1 text-caption text-studio-accent-text hover:underline">
              {t("library.sources.signInHint")}
            </Link>
          ) : null}
          {tree.rootFolders.map((node) => folderRow(node, 0))}
          {tree.rootDatabases.map((database) => sourceRow(`file:${database.id}`, 0))}
        </section>
      </div>
      <div className="flex shrink-0 items-center gap-1 border-t border-studio-border p-1.5">
        <FoldersMenu />
        {importControl}
      </div>
      {dialogs}
      {/* Inside the mobile Sources sheet, an open rail menu takes Escape first
          (MenuSurface closes it); the sheet closes only on a second press. */}
      {inSheet && (menu || importMenu || folderMenu) ? <span hidden data-escape-defer="" /> : null}
    </>
  );

  if (inSheet) {
    return (
      <div
        role="region"
        aria-label={railLabel}
        data-testid="library-source-rail"
        className="flex min-h-0 w-full flex-col overflow-hidden"
      >
        {railBody}
      </div>
    );
  }

  return (
    <Panel
      as="aside"
      aria-label={railLabel}
      data-testid="library-source-rail"
      className="flex w-56 shrink-0 flex-col overflow-hidden"
    >
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-studio-border px-2">
        <span className="min-w-0 flex-1 truncate text-caption font-semibold uppercase tracking-wide text-studio-faint">
          {t("library.sources.rail.title")}
        </span>
        <IconButton
          label={t("library.sources.rail.collapse")}
          size="sm"
          aria-expanded
          onClick={toggleCollapsed}
        >
          <PanelLeftClose size={14} />
        </IconButton>
      </div>
      {railBody}
    </Panel>
  );
}

/** The per-file menu's fixed wrapper; flips above the row when there is no room below. */
function FileMenuPosition({
  anchor,
  menuRef,
  children,
}: {
  anchor: MenuAnchor;
  menuRef: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  const style = useMenuPosition(anchor, menuRef);
  return (
    <div ref={menuRef} className="fixed z-[1000]" style={style}>
      {children}
    </div>
  );
}
