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
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { loadRemoteFiles, type FileDatabase, type FileFolder } from "@/src/lib/user-files";
import { useStudioStore } from "@/src/store/studio-store";
import { openStudioPanel } from "./dock-api";

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
    <div className="relative flex h-full w-64 flex-col overflow-hidden rounded-lg bg-studio-panel">
      <div className="flex items-center justify-between px-3 py-3">
        <h2 className="text-sm font-medium text-studio-fg">Files</h2>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            title="Focus search"
            className="rounded p-1 text-studio-muted hover:bg-studio-hover hover:text-studio-fg"
            onClick={() => document.getElementById("files-search")?.focus()}
          >
            <Search size={14} />
          </button>
          <button
            type="button"
            title="Refresh"
            className="rounded p-1 text-studio-muted hover:bg-studio-hover hover:text-studio-fg"
            onClick={() => void refresh()}
          >
            <RefreshCw size={14} />
          </button>
          <button
            type="button"
            title="Add"
            className="rounded p-1 text-studio-muted hover:bg-studio-hover hover:text-studio-fg"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <Plus size={16} />
          </button>
        </div>
      </div>
      <div className="px-3 pb-2">
        <input
          id="files-search"
          value={query}
          onChange={(event) => setFilesQuery(event.target.value)}
          placeholder="Search files"
          className="w-full rounded border border-studio-border bg-studio-selected px-2 py-1.5 text-sm text-studio-fg outline-none"
        />
      </div>
      {menuOpen ? (
        <div className="absolute right-2 top-12 z-20 w-48 rounded border border-studio-border bg-studio-elevated py-1 shadow-2xl">
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-studio-fg hover:bg-studio-accent hover:text-white"
            onClick={() => {
              createFileFolder();
              setMenuOpen(false);
            }}
          >
            <FolderPlus size={14} />
            New folder
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-studio-fg hover:bg-studio-accent hover:text-white"
            onClick={() => {
              fileRef.current?.click();
              setMenuOpen(false);
            }}
          >
            <Upload size={14} />
            Import PGN database
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-studio-fg hover:bg-studio-accent hover:text-white"
            onClick={() => {
              setPasteOpen(true);
              setMenuOpen(false);
            }}
          >
            <ClipboardPaste size={14} />
            Paste PGN
          </button>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto px-2 pb-3">
        {empty ? (
          <p className="px-2 py-6 text-[13px] text-studio-faint">
            No databases yet. Create one with +.
          </p>
        ) : null}
        {filtered.folders.map((folder) => {
          const expanded = openFolders.has(folder.id) || Boolean(query.trim());
          const nested = filtered.byFolder.get(folder.id) ?? [];
          return (
            <div key={folder.id} className="mb-1">
              <div className="group flex items-center rounded-md hover:bg-studio-hover-subtle">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-1 px-2 py-1.5 text-left text-[13px] text-studio-fg"
                  onClick={() => toggle(openFolders, folder.id, setOpenFolders)}
                >
                  <ChevronRight
                    size={13}
                    className={`shrink-0 text-studio-faint transition ${expanded ? "rotate-90" : ""}`}
                  />
                  <Folder size={14} className="shrink-0 text-studio-muted" />
                  <span className="truncate">{folder.name}</span>
                </button>
                <button
                  type="button"
                  title="Delete folder"
                  className="mr-1 hidden rounded p-1 text-studio-faint hover:text-red-300 group-hover:block"
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
      </div>
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
      {pasteOpen ? (
        <div className="absolute inset-0 z-30 flex flex-col bg-studio-panel p-3">
          <h3 className="text-sm font-medium text-studio-fg">Paste PGN</h3>
          <textarea
            value={pasteText}
            onChange={(event) => setPasteText(event.target.value)}
            placeholder="[Event &quot;...&quot;]"
            className="mt-2 min-h-0 flex-1 resize-none rounded border border-studio-border bg-studio-selected p-2 text-[12px] text-studio-fg outline-none"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              className="rounded px-2 py-1 text-[12px] text-studio-muted hover:text-studio-fg"
              onClick={() => {
                setPasteOpen(false);
                setPasteText("");
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded bg-studio-accent px-2 py-1 text-[12px] text-white disabled:opacity-40"
              disabled={!pasteText.trim()}
              onClick={() => {
                importFileDatabase("Pasted PGN", pasteText);
                openStudioPanel("fileGames");
                setPasteOpen(false);
                setPasteText("");
              }}
            >
              Import
            </button>
          </div>
        </div>
      ) : null}
    </div>
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
    <div className={indent ? "ml-4" : ""}>
      <div className="group flex items-center rounded-md hover:bg-studio-hover-subtle">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1 px-2 py-1.5 text-left text-[13px] text-studio-fg"
          onClick={onToggle}
        >
          <ChevronRight
            size={13}
            className={`shrink-0 text-studio-faint transition ${open ? "rotate-90" : ""}`}
          />
          <Database size={14} className="shrink-0 text-studio-muted" />
          <span className="min-w-0 truncate">
            {database.name}
            <span className="ml-1 text-[11px] text-studio-faint">{database.games.length}</span>
          </span>
        </button>
        <button
          type="button"
          title="Delete database"
          className="mr-1 hidden rounded p-1 text-studio-faint hover:text-red-300 group-hover:block"
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
              className="flex w-full truncate rounded-md px-2 py-1 pl-8 text-left text-[12px] text-studio-fg hover:bg-studio-hover-subtle"
              onClick={() => onOpenGame(game)}
            >
              {game.title}
            </button>
          ))
        : null}
    </div>
  );
}
