"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { ClipboardPaste, Ellipsis, FileUp, Star, TriangleAlert } from "lucide-react";
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
import { formatGameCount } from "./filter-chips";
import { selectAll, selectOnly, toggleSource } from "./library-sources";
import {
  FolderMoveDialog,
  FolderSelect,
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

export type LibrarySourceBarProps = {
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
        // Signed out or offline: show the card without a count.
      }
    })();
    return () => controller.abort();
  }, [enabled]);
  return count;
}

/** Inline name editor for a PGN file card: Enter saves, Esc/blur cancels, empty is refused. */
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
      className="h-full w-40 rounded-md bg-transparent px-2.5 text-dense font-medium text-studio-fg outline-none"
    />
  );
}

/** SIG-1319: one card per source, grouped; click selects one, Ctrl/⌘-click toggles. */
export function LibrarySourceBar({ sourceErrors }: LibrarySourceBarProps) {
  const locale = useStudioStore((s) => s.settings.locale);
  const databases = useStudioStore((s) => s.files.databases);
  const selected = useLibraryStore((s) => s.filters.sources);
  const setSources = useLibraryStore((s) => s.setSources);
  // The adapter registry is not reactive; `databases` changes re-render this.
  const adapters = listLibrarySources();
  const ids = adapters.map((adapter) => adapter.id);
  const hasMyGames = ids.includes("my-games");
  const myGamesCount = useMyGamesCount(hasMyGames);
  const renameFileDatabase = useStudioStore((s) => s.renameFileDatabase);
  const deleteFileDatabase = useStudioStore((s) => s.deleteFileDatabase);
  const referenceSource = useStudioStore((s) => s.databaseSource);
  const setDatabaseSource = useStudioStore((s) => s.setDatabaseSource);
  const importFiles = useLibraryImport();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ databaseId: string; x: number; y: number } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [importMenu, setImportMenu] = useState<{ x: number; y: number } | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const folders = useStudioStore((s) => s.files.folders);
  const moveFileDatabase = useStudioStore((s) => s.moveFileDatabase);
  const selectedFolderId = useSelectedFolderId();
  const menuRef = useRef<HTMLDivElement>(null);
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

  const count = (id: LibrarySourceId): string | null => {
    if (id === MASTERS_SOURCE_ID) {
      return tLibrary(locale, "library.sources.mastersLimit");
    }
    let total: number | null = null;
    if (id === "my-games") {
      total = myGamesCount;
    } else if (id.startsWith("file:")) {
      const db = databases.find((database) => `file:${database.id}` === id);
      total = db ? db.games.length : null;
    }
    return total === null ? null : tLibrary(locale, "library.sources.games", { count: formatGameCount(total, locale) });
  };

  const click = (id: LibrarySourceId) => (event: MouseEvent) => {
    setSources(event.ctrlKey || event.metaKey ? toggleSource(selected, id, ids) : selectOnly(id));
  };

  const card = (id: LibrarySourceId) => {
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
    const name = adapter.label(locale);
    const explorerSource = libraryToExplorerSource(id);
    const isReference = explorerSource !== null && explorerSource === referenceSource;
    // Curated/Lichess have no card: Masters' tooltip says which database is really in use.
    const outsideLibrary = id === MASTERS_SOURCE_ID && referenceSource !== "masters" && !referenceSource.startsWith("file:");
    const starLabel = isReference
      ? tLibrary(locale, "library.sources.reference.active")
      : outsideLibrary
        ? `${tLibrary(locale, "library.sources.reference.other", { name: explorerSourceTitle(referenceSource, databases, locale) })}. ${tLibrary(locale, "library.sources.reference.use")}`
        : tLibrary(locale, "library.sources.reference.use");
    const star =
      explorerSource !== null && (!database || renamingId !== database.id) ? (
        <IconButton
          label={starLabel}
          size="sm"
          active={isReference}
          data-testid="library-source-reference"
          className={`my-auto shrink-0 ${database ? "" : "mr-1"} ${isReference ? "text-studio-accent-text" : "text-studio-muted"}`}
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
      <div
        key={id}
        className={`flex h-9 max-w-60 shrink-0 items-stretch rounded-md border ${
          isSelected
            ? "border-studio-accent bg-studio-accent-soft text-studio-accent-text"
            : "border-studio-border bg-studio-hover-subtle text-studio-muted hover:bg-studio-hover-strong hover:text-studio-fg"
        }`}
      >
        {database && renamingId === database.id ? (
          <FileNameInput
            initial={database.name}
            label={tLibrary(locale, "library.sources.file.renameLabel")}
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
            title={isLast ? tLibrary(locale, "library.sources.lastGuard") : undefined}
            onClick={click(id)}
            className="flex min-w-0 flex-col items-start justify-center rounded-md px-2.5 text-left"
          >
            <span className="flex min-w-0 max-w-48 items-center gap-1 text-dense font-medium leading-tight">
              <span className="truncate">{name}</span>
              {error !== undefined ? (
                <span
                  role="img"
                  title={tLibrary(locale, "library.sources.failed", { message: error })}
                  aria-label={tLibrary(locale, "library.sources.failed", { message: error })}
                  className="text-studio-danger"
                >
                  <TriangleAlert size={12} />
                </span>
              ) : null}
            </span>
            {detail !== null ? <span className="text-caption leading-tight tabular-nums opacity-80">{detail}</span> : null}
          </button>
        )}
        {star}
        {database && renamingId !== database.id ? (
          <IconButton
            label={tLibrary(locale, "library.sources.file.menu", { name })}
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
    );
  };

  const publicIds = ids.filter((id) => id === MASTERS_SOURCE_ID);
  // SIG-1325: the folder selector limits the PGN file cards (My Games always stays).
  const scope = folderScope(folders, selectedFolderId);
  const mineIds = ids.filter((id) => {
    if (id === MASTERS_SOURCE_ID) {
      return false;
    }
    if (!scope || !id.startsWith("file:")) {
      return true;
    }
    const database = databases.find((item) => `file:${item.id}` === id);
    return database?.folderId ? scope.has(database.folderId) : false;
  });
  // My Games first, then the PGN files in registration order.
  mineIds.sort((a, b) => Number(b === "my-games") - Number(a === "my-games"));

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
        {tLibrary(locale, "library.import.button")}
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

  const group = (key: "library.sources.group.public" | "library.sources.group.mine", groupIds: LibrarySourceId[]): ReactNode =>
    groupIds.length === 0 && key !== "library.sources.group.mine" ? null : (
      <div role="group" aria-label={tLibrary(locale, key)} className="flex shrink-0 items-center gap-1.5">
        <span className="text-caption font-semibold uppercase tracking-wide text-studio-faint">
          {tLibrary(locale, key)}
        </span>
        {key === "library.sources.group.mine" ? (
          <>
            <FolderSelect />
            <FoldersMenu />
          </>
        ) : null}
        {groupIds.map(card)}
        {key === "library.sources.group.mine" ? importControl : null}
      </div>
    );

  const menuDb = menu ? databases.find((item) => item.id === menu.databaseId) : undefined;
  const deletingDb = deletingId ? databases.find((item) => item.id === deletingId) : undefined;
  const movingDb = movingId ? databases.find((item) => item.id === movingId) : undefined;

  return (
    <div
      role="group"
      aria-label={tLibrary(locale, "library.sources.barLabel")}
      data-testid="library-source-bar"
      className="flex min-w-0 shrink-0 items-center gap-3 overflow-x-auto px-0.5 pb-1"
    >
      <Chip active={allSelected} onClick={() => setSources(selectAll(ids))}>
        {tLibrary(locale, "library.sources.selectAll")}
      </Chip>
      {group("library.sources.group.public", publicIds)}
      {group("library.sources.group.mine", mineIds)}
      {menu && menuDb ? (
        <div ref={menuRef} className="fixed z-[1000]" style={{ left: menu.x, top: menu.y }}>
          <MenuSurface className="min-w-44" onClose={() => setMenu(null)} label={menuDb.name}>
            <MenuItem
              label={tLibrary(locale, "library.sources.file.rename")}
              onClick={() => {
                setMenu(null);
                setRenamingId(menuDb.id);
              }}
            />
            <MenuItem
              label={tLibrary(locale, "library.sources.file.move")}
              onClick={() => {
                setMenu(null);
                setMovingId(menuDb.id);
              }}
            />
            <MenuItem
              label={tLibrary(locale, "library.sources.file.export")}
              onClick={() => {
                setMenu(null);
                downloadTextFile(databaseExportFilename(menuDb), databaseToPgn(menuDb));
              }}
            />
            <MenuItem
              label={tLibrary(locale, "library.sources.file.delete")}
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
        <PopMenu anchor={importMenu} label={tLibrary(locale, "library.import.button")} onClose={() => setImportMenu(null)}>
          <MenuItem
            label={tLibrary(locale, "library.import.fromFile")}
            leading={<FileUp size={14} className="text-studio-faint" />}
            onClick={() => {
              setImportMenu(null);
              fileInputRef.current?.click();
            }}
          />
          <MenuItem
            label={tLibrary(locale, "library.import.paste")}
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
          title={tLibrary(locale, "library.folders.moveFileTitle", { name: movingDb.name })}
          noneLabel={tLibrary(locale, "library.folders.none")}
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
          title={tLibrary(locale, "library.sources.file.deleteTitle", { name: deletingDb.name })}
          onClose={() => setDeletingId(null)}
          width="w-[24rem]"
          footer={
            <>
              <Button variant="ghost" onClick={() => setDeletingId(null)}>
                {tLibrary(locale, "library.sources.file.cancel")}
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  deleteFileDatabase(deletingDb.id);
                  setDeletingId(null);
                }}
              >
                {tLibrary(locale, "library.sources.file.deleteConfirm")}
              </Button>
            </>
          }
        >
          {tLibrary(locale, "library.sources.file.deleteBody")}
        </Dialog>
      ) : null}
    </div>
  );
}
