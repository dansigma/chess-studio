"use client";

// SIG-1337: the Library's sources rail — public databases, My Games and the PGN
// file tree live left of the games table; the old source bar above it is gone.
import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronRight,
  ClipboardPaste,
  Ellipsis,
  FileUp,
  Folder,
  PanelLeftClose,
  PanelLeftOpen,
  Star,
  TriangleAlert,
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
import { Chip } from "../ui/Controls";
import { Dialog } from "../ui/Dialog";
import { MenuItem, MenuSurface } from "../ui/Menu";
import { Panel } from "../ui/Panel";
import { buildFolderTree, type FolderNode } from "../files-tree";
import { formatGameCount } from "./filter-chips";
import { selectAll, selectOnly, toggleSource } from "./library-sources";
import { readLibraryRailCollapsed, writeLibraryRailCollapsed } from "./library-layout";
import {
  FolderMoveDialog,
  FoldersMenu,
  PastePgnDialog,
  PopMenu,
  anchorBelow,
  folderScope,
  useSelectedFolderId,
} from "./LibraryFolders";
import { useLibraryStore } from "./library-store";
import { libraryToExplorerSource } from "./reference-source";
import { useLibraryImport } from "./use-library-import";

const MENU_MIN_WIDTH = 176;
const NESTED_INDENT = 14;

export type LibrarySourceRailProps = {
  sourceErrors: Partial<Record<LibrarySourceId, string>>;
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

/** Inline name editor for a PGN file row: Enter saves, Esc/blur cancels, empty is refused. */
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
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (value.trim()) {
        onCommit(value.trim());
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
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
      onBlur={onCancel}
      className="h-7 min-w-0 flex-1 rounded-md bg-transparent px-2 text-dense font-medium text-studio-fg outline-none"
    />
  );
}

/** SIG-1337: collapsible rail listing every source plus the PGN folder tree. */
export function LibrarySourceRail({ sourceErrors }: LibrarySourceRailProps) {
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
  const [menu, setMenu] = useState<{ databaseId: string; x: number; y: number } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [importMenu, setImportMenu] = useState<{ x: number; y: number } | null>(null);
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
    return total === null ? null : t("library.sources.games", { count: formatGameCount(total, locale) });
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
    const files = fileIdsInFolder(folderId);
    if (files.length > 0) {
      setSources(files);
    }
  };

  const sourceRow = (id: LibrarySourceId, depth = 0): ReactNode => {
    const adapter = adapters.find((item) => item.id === id);
    if (!adapter) {
      return null;
    }
    const isSelected = selected.includes(id);
    const isLast = isSelected && selectedAvailable.length <= 1;
    const error = sourceErrors[id];
    const detail = count(id);
    const databaseId = id.startsWith("file:") ? id.slice("file:".length) : null;
    const database = databaseId ? databases.find((item) => item.id === databaseId) : undefined;
    const label = adapter.label(locale);
    const explorerSource = libraryToExplorerSource(id);
    const isReference = explorerSource !== null && explorerSource === referenceSource;
    // Curated/Lichess have no row: Masters' tooltip says which database is really in use.
    const outsideLibrary =
      id === MASTERS_SOURCE_ID && referenceSource !== "masters" && !referenceSource.startsWith("file:");
    const starLabel = isReference
      ? t("library.sources.reference.active")
      : outsideLibrary
        ? `${t("library.sources.reference.other", { name: explorerSourceTitle(referenceSource, databases, locale) })}. ${t("library.sources.reference.use")}`
        : t("library.sources.reference.use");
    const star =
      explorerSource !== null && (!database || renamingId !== database.id) ? (
        <IconButton
          label={starLabel}
          size="sm"
          active={isReference}
          data-testid="library-source-reference"
          className={`my-auto mr-1 shrink-0 ${isReference ? "text-studio-accent-text" : "text-studio-muted"}`}
          onClick={(event) => {
            event.stopPropagation();
            if (!isReference) {
              setDatabaseSource(explorerSource);
            }
          }}
        >
          <Star size={14} fill={isReference ? "currentColor" : "none"} />
        </IconButton>
      ) : null;
    return (
      <div key={id} data-depth={depth} style={{ paddingLeft: `${depth * NESTED_INDENT}px` }} className="flex min-w-0">
        <div
          className={`flex min-w-0 flex-1 items-stretch rounded-md border ${
            isSelected
              ? "border-studio-accent bg-studio-accent-soft text-studio-accent-text"
              : "border-transparent text-studio-muted hover:bg-studio-hover hover:text-studio-fg"
          }`}
        >
          {database && renamingId === database.id ? (
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
              className="flex h-7 min-w-0 flex-1 items-center gap-1.5 px-2 text-left"
            >
              <span className="min-w-0 flex-1 truncate text-dense font-medium leading-tight">{label}</span>
              {error !== undefined ? (
                <span
                  role="img"
                  title={t("library.sources.failed", { message: error })}
                  aria-label={t("library.sources.failed", { message: error })}
                  className="shrink-0 text-studio-danger"
                >
                  <TriangleAlert size={12} />
                </span>
              ) : null}
              {detail !== null ? (
                <span className="shrink-0 text-caption leading-tight tabular-nums opacity-80">{detail}</span>
              ) : null}
            </button>
          )}
          {star}
          {database && renamingId !== database.id ? (
            <IconButton
              label={t("library.sources.file.menu", { name: label })}
              size="sm"
              aria-haspopup="menu"
              aria-expanded={menu?.databaseId === database.id}
              data-testid="library-source-menu"
              className="my-auto mr-1 shrink-0 text-studio-muted"
              onClick={(event) => {
                event.stopPropagation();
                const rect = event.currentTarget.getBoundingClientRect();
                // Keep the menu (min-w-44 = 176px) inside the viewport near the right edge.
                const x = Math.max(8, Math.min(rect.left, window.innerWidth - MENU_MIN_WIDTH - 8));
                setMenu(menu?.databaseId === database.id ? null : { databaseId: database.id, x, y: rect.bottom + 4 });
              }}
            >
              <Ellipsis size={14} />
            </IconButton>
          ) : null}
        </div>
      </div>
    );
  };

  const folderRow = (node: FolderNode, depth: number): ReactNode => {
    const expanded = !collapsedFolders.has(node.folder.id);
    const isCurrent = selectedFolderId === node.folder.id;
    return (
      <div key={`folder:${node.folder.id}`}>
        <div
          data-depth={depth}
          style={{ paddingLeft: `${depth * NESTED_INDENT}px` }}
          className={`flex min-w-0 items-center rounded-md ${
            isCurrent ? "bg-studio-hover-strong text-studio-fg" : "text-studio-muted hover:bg-studio-hover hover:text-studio-fg"
          }`}
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
            className="flex h-7 min-w-0 flex-1 items-center gap-1.5 pr-2 text-left text-dense font-medium"
          >
            <Folder size={14} className="shrink-0 text-studio-faint" />
            <span className="truncate">{node.folder.name}</span>
          </button>
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
    </>
  );

  const menuDb = menu ? databases.find((item) => item.id === menu.databaseId) : undefined;
  const deletingDb = deletingId ? databases.find((item) => item.id === deletingId) : undefined;
  const movingDb = movingId ? databases.find((item) => item.id === movingId) : undefined;
  const mastersId = ids.find((id) => id === MASTERS_SOURCE_ID);
  const tree = buildFolderTree(folders, databases, "");
  const railLabel = t("library.sources.barLabel");

  const dialogs = (
    <>
      {menu && menuDb ? (
        <div ref={menuRef} className="fixed z-[1000]" style={{ left: menu.x, top: menu.y }}>
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
        </div>
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
                variant="primary"
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

  if (collapsed) {
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
          const title = detail === null ? name(id) : `${name(id)} · ${detail}`;
          return (
            <button
              key={id}
              type="button"
              data-testid="library-source-marker"
              aria-pressed={selected.includes(id)}
              aria-label={title}
              title={title}
              onClick={click(id)}
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-caption font-semibold ${
                selected.includes(id)
                  ? "bg-studio-accent-soft text-studio-accent-text"
                  : "text-studio-muted hover:bg-studio-hover-strong hover:text-studio-fg"
              }`}
            >
              {name(id).trim().charAt(0).toUpperCase()}
            </button>
          );
        })}
        {dialogs}
      </Panel>
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
          <h3 className="px-2 pb-0.5 pt-1 text-caption font-semibold uppercase tracking-wide text-studio-faint">
            {t("library.sources.group.files")}
          </h3>
          {tree.rootFolders.map((node) => folderRow(node, 0))}
          {tree.rootDatabases.map((database) => sourceRow(`file:${database.id}`, 0))}
        </section>
      </div>
      <div className="flex shrink-0 items-center gap-1 border-t border-studio-border p-1.5">
        <FoldersMenu />
        {importControl}
      </div>
      {dialogs}
    </Panel>
  );
}
