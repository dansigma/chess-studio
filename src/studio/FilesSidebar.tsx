"use client";

import { useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  ClipboardPaste,
  Database,
  Folder,
  FolderInput,
  FolderPlus,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { tSidebar } from "@/src/i18n/studio-sidebar-strings";
import {
  isDescendantFolder,
  loadRemoteFiles,
  type FileDatabase,
  type FileFolder,
} from "@/src/lib/user-files";
import { useStudioStore } from "@/src/store/studio-store";
import { openStudioPanel } from "./dock-api";
import { Button, IconButton } from "./ui/Button";
import { SearchInput } from "./ui/Controls";
import { Dialog } from "./ui/Dialog";
import { MenuItem, MenuSurface } from "./ui/Menu";
import { SidebarHint, SidebarPanel } from "./ui/Sidebar";
import {
  buildFolderTree,
  type FolderNode,
} from "./files-tree";

type MoveItem =
  | { type: "folder"; id: string; name: string; currentParentId: string | null }
  | { type: "database"; id: string; name: string; currentFolderId: string | null };

export function FilesSidebar() {
  const locale = useStudioStore((state) => state.settings.locale);
  const files = useStudioStore((state) => state.files);
  const query = useStudioStore((state) => state.filesQuery);
  const user = useStudioStore((state) => state.user);
  const setFilesQuery = useStudioStore((state) => state.setFilesQuery);
  const createFileFolder = useStudioStore((state) => state.createFileFolder);
  const renameFileFolder = useStudioStore((state) => state.renameFileFolder);
  const moveFileFolder = useStudioStore((state) => state.moveFileFolder);
  const moveFileDatabase = useStudioStore((state) => state.moveFileDatabase);
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
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renamingName, setRenamingName] = useState("");
  const [moveItem, setMoveItem] = useState<MoveItem | null>(null);

  const tree = useMemo(() => {
    return buildFolderTree(files.folders, files.databases, query);
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
      setStatus(tSidebar(locale, "sidebar.files.storedLocal"));
      return;
    }
    const remote = await loadRemoteFiles(user.id);
    mergeRemoteFiles(remote);
    setStatus(tSidebar(locale, "sidebar.files.refreshed"));
  }

  function importFile(file: File) {
    void file.text().then((text) => {
      importFileDatabase(
        file.name.replace(/\.pgn$/i, "") || tSidebar(locale, "sidebar.files.defaultDatabase"),
        text,
      );
      openStudioPanel("fileGames");
    });
  }

  function handleCommitRename(id: string, name: string) {
    const trimmed = name.trim();
    if (trimmed) {
      renameFileFolder(id, trimmed);
    }
    setRenamingFolderId(null);
  }

  return (
    <SidebarPanel
      title={tSidebar(locale, "sidebar.files.title")}
      actions={
        <div className="flex items-center gap-0.5">
          <IconButton label={tSidebar(locale, "sidebar.files.refresh")} size="sm" className="text-studio-muted" onClick={() => void refresh()}>
            <RefreshCw size={14} />
          </IconButton>
          <IconButton
            label={tSidebar(locale, "sidebar.files.searchPosition")}
            size="sm"
            className="text-studio-muted"
            onClick={() => openStudioPanel("positionSearch")}
          >
            <Search size={14} />
          </IconButton>
          <IconButton
            label={tSidebar(locale, "sidebar.files.add")}
            size="sm"
            active={menuOpen}
            className="text-studio-muted"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <Plus size={15} />
          </IconButton>
        </div>
      }
      header={<SearchInput id="files-search" value={query} onChange={setFilesQuery} placeholder={tSidebar(locale, "sidebar.files.searchPlaceholder")} />}
      overlay={
        <>
          {menuOpen ? (
            <>
              <button
                className="fixed inset-0 z-10 cursor-default"
                aria-label={tSidebar(locale, "sidebar.files.closeMenu")}
                onClick={() => setMenuOpen(false)}
              />
              <MenuSurface className="absolute right-2 top-11 z-20 min-w-52" onClose={() => setMenuOpen(false)}>
                <MenuItem
                  label={tSidebar(locale, "sidebar.files.newFolder")}
                  leading={<FolderPlus size={14} className="text-studio-faint" />}
                  onClick={() => {
                    createFileFolder(tSidebar(locale, "sidebar.files.newFolder"));
                    setMenuOpen(false);
                  }}
                />
                <MenuItem
                  label={tSidebar(locale, "sidebar.files.importPgn")}
                  leading={<Upload size={14} className="text-studio-faint" />}
                  onClick={() => {
                    fileRef.current?.click();
                    setMenuOpen(false);
                  }}
                />
                <MenuItem
                  label={tSidebar(locale, "sidebar.files.pastePgn")}
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
              <h3 className="text-body font-semibold text-studio-fg">{tSidebar(locale, "sidebar.files.pasteTitle")}</h3>
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
                  {tSidebar(locale, "sidebar.files.cancel")}
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  disabled={!pasteText.trim()}
                  onClick={() => {
                    importFileDatabase(tSidebar(locale, "sidebar.files.pastedPgn"), pasteText);
                    openStudioPanel("fileGames");
                    setPasteOpen(false);
                    setPasteText("");
                  }}
                >
                  {tSidebar(locale, "sidebar.files.import")}
                </Button>
              </div>
            </div>
          ) : null}
          {moveItem ? (
            <Dialog
              title={
                moveItem.type === "folder"
                  ? tSidebar(locale, "sidebar.files.moveFolder", { name: moveItem.name })
                  : tSidebar(locale, "sidebar.files.moveDatabase", { name: moveItem.name })
              }
              onClose={() => setMoveItem(null)}
              width="w-[24rem]"
            >
              <div className="p-3">
                <p className="mb-2 text-caption text-studio-muted">{tSidebar(locale, "sidebar.files.selectDestination")}</p>
                <div className="max-h-72 overflow-y-auto space-y-0.5 rounded-md border border-studio-border bg-studio-base p-1">
                  <button
                    type="button"
                    disabled={
                      moveItem.type === "folder"
                        ? moveItem.currentParentId === null
                        : moveItem.currentFolderId === null
                    }
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-body text-studio-fg hover:bg-studio-hover disabled:cursor-not-allowed disabled:opacity-40"
                    onClick={() => {
                      if (moveItem.type === "folder") {
                        moveFileFolder(moveItem.id, null);
                      } else {
                        moveFileDatabase(moveItem.id, null);
                      }
                      setMoveItem(null);
                    }}
                  >
                    <Folder size={14} className="shrink-0 text-studio-faint" />
                    <span className="font-medium">{tSidebar(locale, "sidebar.files.rootNoFolder")}</span>
                  </button>

                  {tree.folderOptions.map((opt) => {
                    const disabled =
                      moveItem.type === "folder"
                        ? opt.id === moveItem.id ||
                          opt.id === moveItem.currentParentId ||
                          isDescendantFolder(files.folders, opt.id, moveItem.id)
                        : opt.id === moveItem.currentFolderId;

                    return (
                      <button
                        key={opt.id}
                        type="button"
                        disabled={disabled}
                        style={{ paddingLeft: `${(opt.depth + 1) * 16}px` }}
                        className="flex w-full items-center gap-2 rounded py-1.5 pr-2 text-left text-body text-studio-fg hover:bg-studio-hover disabled:cursor-not-allowed disabled:opacity-40"
                        onClick={() => {
                          if (moveItem.type === "folder") {
                            moveFileFolder(moveItem.id, opt.id);
                            setOpenFolders((prev) => new Set([...prev, opt.id]));
                          } else {
                            moveFileDatabase(moveItem.id, opt.id);
                            setOpenFolders((prev) => new Set([...prev, opt.id]));
                          }
                          setMoveItem(null);
                        }}
                      >
                        <Folder size={14} className="shrink-0 text-studio-faint" />
                        <span className="truncate">{opt.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </Dialog>
          ) : null}
        </>
      }
    >
      {empty ? (
        <SidebarHint>{tSidebar(locale, "sidebar.files.empty")}</SidebarHint>
      ) : null}
      {tree.rootFolders.map((folderNode) => (
        <FolderNodeView
          key={folderNode.folder.id}
          node={folderNode}
          level={0}
          query={query}
          openFolders={openFolders}
          openDatabases={openDatabases}
          renamingFolderId={renamingFolderId}
          renamingName={renamingName}
          onToggleFolder={(id) => toggle(openFolders, id, setOpenFolders)}
          onStartRename={(folder) => {
            setRenamingFolderId(folder.id);
            setRenamingName(folder.name);
          }}
          onCancelRename={() => setRenamingFolderId(null)}
          onChangeRename={setRenamingName}
          onCommitRename={handleCommitRename}
          onStartMoveFolder={(folder) =>
            setMoveItem({
              type: "folder",
              id: folder.id,
              name: folder.name,
              currentParentId: folder.parentId,
            })
          }
          onStartMoveDatabase={(database) =>
            setMoveItem({
              type: "database",
              id: database.id,
              name: database.name,
              currentFolderId: database.folderId,
            })
          }
          onCreateSubfolder={(parentId) => {
            createFileFolder(tSidebar(locale, "sidebar.files.newFolder"), parentId);
            setOpenFolders((prev) => new Set([...prev, parentId]));
          }}
          onDeleteFolder={deleteFileFolder}
          onDeleteDatabase={deleteFileDatabase}
          onSelectDatabase={(id) => {
            showFileDatabase(id);
            openStudioPanel("fileGames");
            toggle(openDatabases, id, setOpenDatabases);
          }}
          onOpenGame={(database, game) => {
            showFileDatabase(database.id);
            openStudioPanel("fileGames");
            openFileGame(game);
          }}
        />
      ))}
      {tree.rootDatabases.map((database) => (
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
          onMove={() =>
            setMoveItem({
              type: "database",
              id: database.id,
              name: database.name,
              currentFolderId: null,
            })
          }
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

function FolderNodeView({
  node,
  level,
  query,
  openFolders,
  openDatabases,
  renamingFolderId,
  renamingName,
  onToggleFolder,
  onStartRename,
  onCancelRename,
  onChangeRename,
  onCommitRename,
  onStartMoveFolder,
  onStartMoveDatabase,
  onCreateSubfolder,
  onDeleteFolder,
  onDeleteDatabase,
  onSelectDatabase,
  onOpenGame,
}: {
  node: FolderNode;
  level: number;
  query: string;
  openFolders: Set<string>;
  openDatabases: Set<string>;
  renamingFolderId: string | null;
  renamingName: string;
  onToggleFolder: (id: string) => void;
  onStartRename: (folder: FileFolder) => void;
  onCancelRename: () => void;
  onChangeRename: (name: string) => void;
  onCommitRename: (id: string, name: string) => void;
  onStartMoveFolder: (folder: FileFolder) => void;
  onStartMoveDatabase: (database: FileDatabase) => void;
  onCreateSubfolder: (parentId: string) => void;
  onDeleteFolder: (id: string) => void;
  onDeleteDatabase: (id: string) => void;
  onSelectDatabase: (id: string) => void;
  onOpenGame: (database: FileDatabase, game: FileDatabase["games"][number]) => void;
}) {
  const locale = useStudioStore((state) => state.settings.locale);
  const expanded = openFolders.has(node.folder.id) || Boolean(query.trim());
  const isRenaming = renamingFolderId === node.folder.id;

  return (
    <div className="mb-0.5">
      <div className="group flex items-center rounded-md hover:bg-studio-hover">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1.5 text-left text-body text-studio-fg"
          onClick={() => onToggleFolder(node.folder.id)}
        >
          <ChevronRight
            size={13}
            className={`shrink-0 text-studio-faint transition ${expanded ? "rotate-90" : ""}`}
          />
          <Folder size={14} className="shrink-0 text-studio-faint" />
          {isRenaming ? (
            <input
              autoFocus
              type="text"
              value={renamingName}
              onChange={(e) => onChangeRename(e.target.value)}
              onBlur={() => onCommitRename(node.folder.id, renamingName)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  onCommitRename(node.folder.id, renamingName);
                } else if (e.key === "Escape") {
                  onCancelRename();
                }
              }}
              onClick={(e) => e.stopPropagation()}
              className="h-6 min-w-0 flex-1 rounded border border-studio-accent bg-studio-selected px-1 text-body text-studio-fg outline-none"
            />
          ) : (
            <span className="truncate">{node.folder.name}</span>
          )}
        </button>

        {!isRenaming ? (
          <div className="mr-1 hidden items-center gap-0.5 group-hover:flex">
            <button
              type="button"
              title={tSidebar(locale, "sidebar.files.newSubfolder")}
              aria-label={tSidebar(locale, "sidebar.files.newSubfolder")}
              className="rounded p-1 text-studio-faint hover:text-studio-fg"
              onClick={(e) => {
                e.stopPropagation();
                onCreateSubfolder(node.folder.id);
              }}
            >
              <FolderPlus size={12} />
            </button>
            <button
              type="button"
              title={tSidebar(locale, "sidebar.files.rename")}
              aria-label={tSidebar(locale, "sidebar.files.renameFolder")}
              className="rounded p-1 text-studio-faint hover:text-studio-fg"
              onClick={(e) => {
                e.stopPropagation();
                onStartRename(node.folder);
              }}
            >
              <Pencil size={12} />
            </button>
            <button
              type="button"
              title={tSidebar(locale, "sidebar.files.moveTo")}
              aria-label={tSidebar(locale, "sidebar.files.moveFolderAria")}
              className="rounded p-1 text-studio-faint hover:text-studio-fg"
              onClick={(e) => {
                e.stopPropagation();
                onStartMoveFolder(node.folder);
              }}
            >
              <FolderInput size={12} />
            </button>
            <button
              type="button"
              title={tSidebar(locale, "sidebar.files.deleteFolder")}
              aria-label={tSidebar(locale, "sidebar.files.deleteFolder")}
              className="rounded p-1 text-studio-faint hover:text-studio-danger"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteFolder(node.folder.id);
              }}
            >
              <Trash2 size={12} />
            </button>
          </div>
        ) : null}
      </div>

      {expanded ? (
        <div className="ml-3 border-l border-studio-border/50 pl-1">
          {node.children.map((child) => (
            <FolderNodeView
              key={child.folder.id}
              node={child}
              level={level + 1}
              query={query}
              openFolders={openFolders}
              openDatabases={openDatabases}
              renamingFolderId={renamingFolderId}
              renamingName={renamingName}
              onToggleFolder={onToggleFolder}
              onStartRename={onStartRename}
              onCancelRename={onCancelRename}
              onChangeRename={onChangeRename}
              onCommitRename={onCommitRename}
              onStartMoveFolder={onStartMoveFolder}
              onStartMoveDatabase={onStartMoveDatabase}
              onCreateSubfolder={onCreateSubfolder}
              onDeleteFolder={onDeleteFolder}
              onDeleteDatabase={onDeleteDatabase}
              onSelectDatabase={onSelectDatabase}
              onOpenGame={onOpenGame}
            />
          ))}
          {node.databases.map((database) => (
            <DatabaseRow
              key={database.id}
              database={database}
              indent={false}
              open={openDatabases.has(database.id) || Boolean(query.trim())}
              onToggle={() => onSelectDatabase(database.id)}
              onOpenGame={(game) => onOpenGame(database, game)}
              onDelete={() => onDeleteDatabase(database.id)}
              onMove={() => onStartMoveDatabase(database)}
            />
          ))}
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
  onMove,
}: {
  database: FileDatabase;
  indent: boolean;
  open: boolean;
  onToggle: () => void;
  onOpenGame: (game: FileDatabase["games"][number]) => void;
  onDelete: () => void;
  onMove: () => void;
}) {
  const locale = useStudioStore((state) => state.settings.locale);
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
        <div className="mr-1 hidden items-center gap-0.5 group-hover:flex">
          <button
            type="button"
            title={tSidebar(locale, "sidebar.files.moveTo")}
            aria-label={tSidebar(locale, "sidebar.files.moveDatabaseAria")}
            className="rounded p-1 text-studio-faint hover:text-studio-fg"
            onClick={(e) => {
              e.stopPropagation();
              onMove();
            }}
          >
            <FolderInput size={12} />
          </button>
          <button
            type="button"
            title={tSidebar(locale, "sidebar.files.deleteDatabase")}
            aria-label={tSidebar(locale, "sidebar.files.deleteDatabase")}
            className="rounded p-1 text-studio-faint hover:text-studio-danger"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <Trash2 size={12} />
          </button>
        </div>
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
