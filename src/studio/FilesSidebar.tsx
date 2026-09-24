"use client";

import { useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  ClipboardPaste,
  Database,
  Folder,
  FolderPlus,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import { loadRemoteFiles, type FileDatabase, type FileFolder } from "@/src/lib/user-files";
import { useStudioStore } from "@/src/store/studio-store";
import { openStudioPanel } from "./dock-api";
import { Button, IconButton } from "./ui/Button";
import { SearchInput } from "./ui/Controls";
import { MenuItem, MenuSurface } from "./ui/Menu";
import { SidebarHint, SidebarPanel } from "./ui/Sidebar";

function matchesQuery(
  query: string,
  folder: FileFolder | null,
  database: FileDatabase,
): boolean {
  if (!query) {
    return true;
  }
  const hay = `${folder?.name ?? ""} ${database.name} ${database.games
    .map((game) => `${game.white} ${game.black} ${game.event}`)
    .join(" ")}`.toLowerCase();
  return hay.includes(query);
}

export function FilesSidebar() {
  const files = useStudioStore((state) => state.files);
  const query = useStudioStore((state) => state.filesQuery);
  const user = useStudioStore((state) => state.user);
  const setFilesQuery = useStudioStore((state) => state.setFilesQuery);
  const createFileFolder = useStudioStore((state) => state.createFileFolder);
  const importFileDatabase = useStudioStore((state) => state.importFileDatabase);
  const openFileGame = useStudioStore((state) => state.openFileGame);
  const showFileDatabase = useStudioStore((state) => state.showFileDatabase);
  const deleteFileFolder = useStudioStore((state) => state.deleteFileFolder);
  const deleteFileDatabase = useStudioStore((state) => state.deleteFileDatabase);
  const mergeRemoteFiles = useStudioStore((state) => state.mergeRemoteFiles);
  const setStatus = useStudioStore((state) => state.setStatus);
  const fileRef = useRef<HTMLInputElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());
  const [openDatabases, setOpenDatabases] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const folders = files.folders.filter((folder) =>
      files.databases.some((database) => database.folderId === folder.id && matchesQuery(q, folder, database))
      || (!q ? true : folder.name.toLowerCase().includes(q)),
    );
    const root = files.databases.filter(
      (database) => !database.folderId && matchesQuery(q, null, database),
    );
    const byFolder = new Map<string, FileDatabase[]>();
    for (const database of files.databases) {
      if (!database.folderId || !matchesQuery(q, files.folders.find((item) => item.id === database.folderId) ?? null, database)) {
        continue;
      }
      const list = byFolder.get(database.folderId) ?? [];
      list.push(database);
      byFolder.set(database.folderId, list);
    }
    return { folders, root, byFolder };
  }, [files, query]);

  const empty = files.folders.length === 0 && files.databases.length === 0;

  function toggle(set: Set<string>, id: string, updater: (next: Set<string>) => void) {
    const next = new Set(set);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    updater(next);
  }

  async function refresh() {
    if (!user) {
      setStatus("Files are stored in this browser");
      return;
    }
    const remote = await loadRemoteFiles(user.id);
    mergeRemoteFiles(remote);
    setStatus("Files refreshed");
  }

  function importFile(file: File) {
    void file.text().then((text) => {
      importFileDatabase(file.name.replace(/\.pgn$/i, "") || "Database", text);
      openStudioPanel("fileGames");
    });
  }

  return (
    <SidebarPanel
      title="Files"
      actions={
        <div className="flex items-center gap-0.5">
          <IconButton label="Refresh" size="sm" className="text-studio-muted" onClick={() => void refresh()}>
            <RefreshCw size={14} />
          </IconButton>
          <IconButton
            label="Add"
            size="sm"
            active={menuOpen}
            className="text-studio-muted"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <Plus size={15} />
          </IconButton>
        </div>
      }
      header={<SearchInput id="files-search" value={query} onChange={setFilesQuery} placeholder="Search files" />}
      overlay={
        <>
          {menuOpen ? (
            <>
              <button
                className="fixed inset-0 z-10 cursor-default"
                aria-label="Close menu"
                onClick={() => setMenuOpen(false)}
              />
              <MenuSurface className="absolute right-2 top-11 z-20 min-w-52">
                <MenuItem
                  label="New folder"
                  leading={<FolderPlus size={14} className="text-studio-faint" />}
                  onClick={() => {
                    createFileFolder();
                    setMenuOpen(false);
                  }}
                />
                <MenuItem
                  label="Import PGN database…"
                  leading={<Upload size={14} className="text-studio-faint" />}
                  onClick={() => {
                    fileRef.current?.click();
                    setMenuOpen(false);
                  }}
                />
                <MenuItem
                  label="Paste PGN…"
                  leading={<ClipboardPaste size={14} className="text-studio-faint" />}
                  onClick={() => {
                    setPasteOpen(true);
                    setMenuOpen(false);
                  }}
                />
              </MenuSurface>
            </>
          ) : null}
          {pasteOpen ? (
            <div className="absolute inset-0 z-30 flex flex-col bg-studio-panel p-3">
              <h3 className="text-body font-semibold text-studio-fg">Paste PGN</h3>
              <textarea
                autoFocus
                value={pasteText}
                onChange={(event) => setPasteText(event.target.value)}
                placeholder="[Event &quot;...&quot;]"
                className="mt-2.5 min-h-0 flex-1 resize-none rounded-md border border-studio-border-strong bg-studio-selected p-2 font-mono text-dense text-studio-fg outline-none focus:border-studio-accent"
              />
              <div className="mt-2.5 flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setPasteOpen(false);
                    setPasteText("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  disabled={!pasteText.trim()}
                  onClick={() => {
                    importFileDatabase("Pasted PGN", pasteText);
                    openStudioPanel("fileGames");
                    setPasteOpen(false);
                    setPasteText("");
                  }}
                >
                  Import
                </Button>
              </div>
            </div>
          ) : null}
        </>
      }
    >
        {empty ? (
          <SidebarHint>No databases yet. Use + to create a folder, import a PGN file or paste one.</SidebarHint>
        ) : null}
        {filtered.folders.map((folder) => {
          const expanded = openFolders.has(folder.id) || Boolean(query.trim());
          const nested = filtered.byFolder.get(folder.id) ?? [];
          return (
            <div key={folder.id} className="mb-1">
              <div className="group flex items-center rounded-md hover:bg-studio-hover">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1.5 text-left text-body text-studio-fg"
                  onClick={() => toggle(openFolders, folder.id, setOpenFolders)}
                >
                  <ChevronRight
                    size={13}
                    className={`shrink-0 text-studio-faint transition ${expanded ? "rotate-90" : ""}`}
                  />
                  <Folder size={14} className="shrink-0 text-studio-faint" />
                  <span className="truncate">{folder.name}</span>
                </button>
                <button
                  type="button"
                  title="Delete folder"
                  aria-label="Delete folder"
                  className="mr-1 hidden rounded p-1 text-studio-faint hover:text-studio-danger group-hover:block"
                  onClick={() => deleteFileFolder(folder.id)}
                >
                  <Trash2 size={12} />
                </button>
              </div>
              {expanded
                ? nested.map((database) => (
                    <DatabaseRow
                      key={database.id}
                      database={database}
                      indent
                      open={openDatabases.has(database.id) || Boolean(query.trim())}
                      onToggle={() => {
                        showFileDatabase(database.id);
                        openStudioPanel("fileGames");
                        toggle(openDatabases, database.id, setOpenDatabases);
                      }}
                      onOpenGame={(game) => {
                        showFileDatabase(database.id);
                        openStudioPanel("fileGames");
                        openFileGame(game);
                      }}
                      onDelete={() => deleteFileDatabase(database.id)}
                    />
                  ))
                : null}
            </div>
          );
        })}
        {filtered.root.map((database) => (
          <DatabaseRow
            key={database.id}
            database={database}
            indent={false}
            open={openDatabases.has(database.id) || Boolean(query.trim())}
            onToggle={() => {
              showFileDatabase(database.id);
              openStudioPanel("fileGames");
              toggle(openDatabases, database.id, setOpenDatabases);
            }}
            onOpenGame={(game) => {
              showFileDatabase(database.id);
              openStudioPanel("fileGames");
              openFileGame(game);
            }}
            onDelete={() => deleteFileDatabase(database.id)}
          />
        ))}
      <input
        ref={fileRef}
        type="file"
        accept=".pgn,text/plain"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            importFile(file);
          }
          event.target.value = "";
        }}
      />
    </SidebarPanel>
  );
}

function DatabaseRow({
  database,
  indent,
  open,
  onToggle,
  onOpenGame,
  onDelete,
}: {
  database: FileDatabase;
  indent: boolean;
  open: boolean;
  onToggle: () => void;
  onOpenGame: (game: FileDatabase["games"][number]) => void;
  onDelete: () => void;
}) {
  return (
    <div className={indent ? "ml-4 border-l border-studio-border pl-1" : ""}>
      <div className="group flex items-center rounded-md hover:bg-studio-hover">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1.5 text-left text-body text-studio-fg"
          onClick={onToggle}
        >
          <ChevronRight
            size={13}
            className={`shrink-0 text-studio-faint transition ${open ? "rotate-90" : ""}`}
          />
          <Database size={14} className="shrink-0 text-studio-faint" />
          <span className="min-w-0 flex-1 truncate">{database.name}</span>
          <span className="shrink-0 text-caption tabular-nums text-studio-faint group-hover:hidden">
            {database.games.length}
          </span>
        </button>
        <button
          type="button"
          title="Delete database"
          aria-label="Delete database"
          className="mr-1 hidden rounded p-1 text-studio-faint hover:text-studio-danger group-hover:block"
          onClick={onDelete}
        >
          <Trash2 size={12} />
        </button>
      </div>
      {open
        ? database.games.map((game) => (
            <button
              key={game.id}
              type="button"
              className="flex w-full truncate rounded-md px-2 py-1 pl-9 text-left text-dense text-studio-fg hover:bg-studio-hover"
              onClick={() => onOpenGame(game)}
            >
              {game.title}
            </button>
          ))
        : null}
    </div>
  );
}
