"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { Folder } from "lucide-react";
import { tLibrary } from "@/src/i18n/library-strings";
import {
  FOLDER_CYCLE_MESSAGE,
  getDescendantFolderIds,
  isDescendantFolder,
  loadRemoteFiles,
  type FileFolder,
} from "@/src/lib/user-files";
import { useStudioStore } from "@/src/store/studio-store";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { MenuDivider, MenuItem, MenuSurface } from "../ui/Menu";
import { buildFolderTree } from "../files-tree";
import { useLibraryStore } from "./library-store";

const MENU_MIN_WIDTH = 192;
const INPUT_CLASS =
  "mt-1.5 w-full rounded-md border border-studio-border-strong bg-studio-selected px-2 py-1.5 text-body text-studio-fg outline-none focus:border-studio-accent";

/** The selected folder id when it still exists, else null (= all folders). */
export function useSelectedFolderId(): string | null {
  const folders = useStudioStore((s) => s.files.folders);
  const folderId = useLibraryStore((s) => s.folderId);
  return folderId && folders.some((folder) => folder.id === folderId) ? folderId : null;
}

/** Ids of a folder and all its subfolders; null for "all folders". */
export function folderScope(folders: FileFolder[], folderId: string | null): Set<string> | null {
  return folderId ? new Set([folderId, ...getDescendantFolderIds(folders, folderId)]) : null;
}

/** Fetches the account's folders and files and merges them in; a no-op when signed out. */
export async function refreshFromAccount(): Promise<void> {
  const { user, mergeRemoteFiles, setStatus, settings } = useStudioStore.getState();
  if (!user) {
    return;
  }
  const remote = await loadRemoteFiles(user.id);
  mergeRemoteFiles(remote);
  setStatus(tLibrary(settings.locale, "library.folders.refreshed"));
}

/** Where a fixed menu opens: under its trigger (`y`), or above it (`top`) when there is no room below. */
export type MenuAnchor = { x: number; y: number; top?: number };

/**
 * SIG-1337: `position: fixed` style for a menu at `anchor`. After the menu is
 * measured, it flips above its trigger when it would run past the bottom of
 * the window (the rail's import and Folders buttons sit at the bottom).
 */
export function useMenuPosition(anchor: MenuAnchor, ref: RefObject<HTMLElement | null>): CSSProperties {
  const [top, setTop] = useState(anchor.y);
  useLayoutEffect(() => {
    const height = ref.current?.getBoundingClientRect().height ?? 0;
    const roomBelow = window.innerHeight - 8 - anchor.y;
    if (height > 0 && height > roomBelow && anchor.top !== undefined) {
      setTop(Math.max(8, anchor.top - 4 - height));
    } else {
      setTop(anchor.y);
    }
  }, [anchor.y, anchor.top, ref]);
  return { left: anchor.x, top };
}

/** A `position: fixed` menu anchored to its trigger; closes on outside pointer-down. */
export function PopMenu({
  anchor,
  label,
  onClose,
  children,
}: {
  anchor: MenuAnchor;
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const style = useMenuPosition(anchor, ref);
  useEffect(() => {
    const onDown = (event: PointerEvent) => {
      const target = event.target as Element;
      if (!ref.current?.contains(target) && !target.closest?.("[data-popmenu-trigger]")) {
        onClose();
      }
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [onClose]);
  return (
    <div ref={ref} className="fixed z-[1000]" style={style}>
      <MenuSurface className="min-w-48" onClose={onClose} label={label}>
        {children}
      </MenuSurface>
    </div>
  );
}

/** Anchor under a trigger button, kept inside the viewport near the right edge; may flip above it. */
export function anchorBelow(element: HTMLElement): MenuAnchor {
  const rect = element.getBoundingClientRect();
  return {
    x: Math.max(8, Math.min(rect.left, window.innerWidth - MENU_MIN_WIDTH - 8)),
    y: rect.bottom + 4,
    top: rect.top,
  };
}

/** Folder destination picker; `isDisabled` blocks the current spot and cycle targets. */
export function FolderMoveDialog({
  title,
  noneLabel,
  isDisabled,
  noneDisabled,
  onPick,
  onClose,
}: {
  title: string;
  noneLabel: string;
  isDisabled: (folderId: string) => boolean;
  noneDisabled: boolean;
  onPick: (folderId: string | null) => void;
  onClose: () => void;
}) {
  const locale = useStudioStore((s) => s.settings.locale);
  const files = useStudioStore((s) => s.files);
  const options = buildFolderTree(files.folders, [], "").folderOptions;
  const rowClass =
    "flex w-full items-center gap-2 rounded py-1.5 pr-2 text-left text-body text-studio-fg hover:bg-studio-hover disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <Dialog title={title} onClose={onClose} width="w-[24rem]">
      <p className="mb-2 text-caption text-studio-muted">{tLibrary(locale, "library.folders.destination")}</p>
      <div className="max-h-72 space-y-0.5 overflow-y-auto rounded-md border border-studio-border bg-studio-base p-1">
        <button type="button" disabled={noneDisabled} className={`${rowClass} pl-2`} onClick={() => onPick(null)}>
          <Folder size={14} className="shrink-0 text-studio-faint" />
          <span className="font-medium">{noneLabel}</span>
        </button>
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            disabled={isDisabled(option.id)}
            style={{ paddingLeft: `${(option.depth + 1) * 16}px` }}
            className={rowClass}
            onClick={() => onPick(option.id)}
          >
            <Folder size={14} className="shrink-0 text-studio-faint" />
            <span className="truncate">{option.name}</span>
          </button>
        ))}
      </div>
    </Dialog>
  );
}

type FolderDialog = "new" | "newSub" | "rename" | "move" | "delete";

/** SIG-1340: the name dialog behind New folder, New subfolder and Rename, fresh per opening. */
function FolderNameDialog({
  folder,
  dialog,
  onClose,
}: {
  /** Rename target, or the parent for a new subfolder. */
  folder: FileFolder | null;
  dialog: "new" | "newSub" | "rename";
  onClose: () => void;
}) {
  const locale = useStudioStore((s) => s.settings.locale);
  const createFileFolder = useStudioStore((s) => s.createFileFolder);
  const renameFileFolder = useStudioStore((s) => s.renameFileFolder);
  const [name, setName] = useState(
    dialog === "rename" ? (folder?.name ?? "") : tLibrary(locale, "library.folders.defaultName"),
  );
  const t = (key: Parameters<typeof tLibrary>[1], vars?: Record<string, string | number>) => tLibrary(locale, key, vars);

  const submitName = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    if (dialog === "rename" && folder) {
      renameFileFolder(folder.id, trimmed);
    } else if (dialog === "new") {
      createFileFolder(trimmed, null);
    } else if (dialog === "newSub" && folder) {
      createFileFolder(trimmed, folder.id);
    }
    onClose();
  };

  return (
    <Dialog
      title={
        dialog === "rename"
          ? t("library.folders.renameTitle")
          : dialog === "newSub" && folder
            ? t("library.folders.newSubTitle", { name: folder.name })
            : t("library.folders.newTitle")
      }
      onClose={onClose}
      width="w-[24rem]"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("library.sources.file.cancel")}
          </Button>
          <Button variant="primary" disabled={!name.trim()} onClick={submitName}>
            {dialog === "rename" ? t("library.folders.save") : t("library.folders.create")}
          </Button>
        </>
      }
    >
      <label className="block text-caption text-studio-muted">
        {t("library.folders.nameLabel")}
        <input
          autoFocus
          value={name}
          maxLength={120}
          className={INPUT_CLASS}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submitName();
            }
          }}
        />
      </label>
    </Dialog>
  );
}

/** SIG-1340: the rename dialog for one folder, opened from the rail's quick action. */
export function FolderRenameDialog({ folder, onClose }: { folder: FileFolder; onClose: () => void }) {
  return <FolderNameDialog folder={folder} dialog="rename" onClose={onClose} />;
}

function FolderDeleteDialog({ folder, onClose }: { folder: FileFolder; onClose: () => void }) {
  const locale = useStudioStore((s) => s.settings.locale);
  const deleteFileFolder = useStudioStore((s) => s.deleteFileFolder);
  const setFolderId = useLibraryStore((s) => s.setFolderId);
  const t = (key: Parameters<typeof tLibrary>[1], vars?: Record<string, string | number>) => tLibrary(locale, key, vars);
  return (
    <Dialog
      title={t("library.folders.deleteTitle", { name: folder.name })}
      onClose={onClose}
      width="w-[24rem]"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("library.sources.file.cancel")}
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              deleteFileFolder(folder.id);
              setFolderId(null);
              onClose();
            }}
          >
            {t("library.sources.file.deleteConfirm")}
          </Button>
        </>
      }
    >
      {t("library.folders.deleteBody")}
    </Dialog>
  );
}

function FolderMoveFolderDialog({ folder, onClose }: { folder: FileFolder; onClose: () => void }) {
  const locale = useStudioStore((s) => s.settings.locale);
  const files = useStudioStore((s) => s.files);
  const moveFileFolder = useStudioStore((s) => s.moveFileFolder);
  const setStatus = useStudioStore((s) => s.setStatus);
  const t = (key: Parameters<typeof tLibrary>[1], vars?: Record<string, string | number>) => tLibrary(locale, key, vars);
  return (
    <FolderMoveDialog
      title={t("library.folders.moveTitle", { name: folder.name })}
      noneLabel={t("library.folders.topLevel")}
      noneDisabled={folder.parentId === null}
      isDisabled={(id) =>
        id === folder.id || id === folder.parentId || isDescendantFolder(files.folders, id, folder.id)
      }
      onClose={onClose}
      onPick={(target) => {
        if (!moveFileFolder(folder.id, target)) {
          setStatus(FOLDER_CYCLE_MESSAGE);
        }
        onClose();
      }}
    />
  );
}

/** The Folders menu: create, rename, move and delete the selected folder; refresh from the account. */
export function FoldersMenu() {
  const locale = useStudioStore((s) => s.settings.locale);
  const files = useStudioStore((s) => s.files);
  const user = useStudioStore((s) => s.user);
  const selectedId = useSelectedFolderId();
  const selected = files.folders.find((folder) => folder.id === selectedId);
  const [anchor, setAnchor] = useState<MenuAnchor | null>(null);
  const [dialog, setDialog] = useState<FolderDialog | null>(null);
  const t = (key: Parameters<typeof tLibrary>[1], vars?: Record<string, string | number>) => tLibrary(locale, key, vars);

  const open = (next: FolderDialog) => {
    setAnchor(null);
    setDialog(next);
  };
  const close = () => setDialog(null);

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="shrink-0"
        aria-haspopup="menu"
        aria-expanded={anchor !== null}
        data-popmenu-trigger=""
        onClick={(event) => setAnchor(anchor ? null : anchorBelow(event.currentTarget))}
      >
        {t("library.folders.menu")}
      </Button>
      {anchor ? (
        <PopMenu anchor={anchor} label={t("library.folders.menu")} onClose={() => setAnchor(null)}>
          <MenuItem label={t("library.folders.new")} onClick={() => open("new")} />
          <MenuItem label={t("library.folders.newSub")} disabled={!selected} onClick={() => open("newSub")} />
          <MenuItem label={t("library.folders.rename")} disabled={!selected} onClick={() => open("rename")} />
          <MenuItem label={t("library.folders.move")} disabled={!selected} onClick={() => open("move")} />
          <MenuItem label={t("library.folders.delete")} danger disabled={!selected} onClick={() => open("delete")} />
          {user ? (
            <>
              <MenuDivider />
              <MenuItem
                label={t("library.folders.refresh")}
                onClick={() => {
                  setAnchor(null);
                  void refreshFromAccount();
                }}
              />
            </>
          ) : null}
        </PopMenu>
      ) : null}
      {dialog === "new" || dialog === "newSub" || dialog === "rename" ? (
        <FolderNameDialog folder={selected ?? null} dialog={dialog} onClose={close} />
      ) : null}
      {dialog === "delete" && selected ? <FolderDeleteDialog folder={selected} onClose={close} /> : null}
      {dialog === "move" && selected ? <FolderMoveFolderDialog folder={selected} onClose={close} /> : null}
    </>
  );
}

/**
 * SIG-1340: a folder's actions at a pointer (right-click). Same items as the
 * Folders menu, but applied to that folder instead of the selected one.
 */
export function FolderActionsMenu({
  folder,
  anchor,
  onClose,
}: {
  folder: FileFolder;
  anchor: MenuAnchor;
  onClose: () => void;
}) {
  const locale = useStudioStore((s) => s.settings.locale);
  const [dialog, setDialog] = useState<FolderDialog | null>(null);
  const t = (key: Parameters<typeof tLibrary>[1]) => tLibrary(locale, key);

  // A dialog replaces the menu; closing it closes the whole context menu.
  const closeDialog = () => {
    setDialog(null);
    onClose();
  };
  if (dialog === "newSub" || dialog === "rename") {
    return <FolderNameDialog folder={folder} dialog={dialog} onClose={closeDialog} />;
  }
  if (dialog === "move") {
    return <FolderMoveFolderDialog folder={folder} onClose={closeDialog} />;
  }
  if (dialog === "delete") {
    return <FolderDeleteDialog folder={folder} onClose={closeDialog} />;
  }
  return (
    <PopMenu anchor={anchor} label={t("library.folders.menu")} onClose={onClose}>
      <MenuItem label={t("library.folders.newSub")} onClick={() => setDialog("newSub")} />
      <MenuItem label={t("library.folders.rename")} onClick={() => setDialog("rename")} />
      <MenuItem label={t("library.folders.move")} onClick={() => setDialog("move")} />
      <MenuItem label={t("library.folders.delete")} danger onClick={() => setDialog("delete")} />
    </PopMenu>
  );
}

/** Paste-PGN dialog: the text becomes a File and goes through the import queue like any other. */
export function PastePgnDialog({ onImport, onClose }: { onImport: (file: File) => void; onClose: () => void }) {
  const locale = useStudioStore((s) => s.settings.locale);
  const [text, setText] = useState("");
  const [name, setName] = useState(tLibrary(locale, "library.import.pasteDefaultName"));
  const submit = () => {
    const base = name.trim().replace(/\.pgn$/i, "") || tLibrary(locale, "library.import.pasteDefaultName");
    onImport(new File([text], `${base}.pgn`, { type: "application/x-chess-pgn" }));
    onClose();
  };
  return (
    <Dialog
      title={tLibrary(locale, "library.import.pasteTitle")}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {tLibrary(locale, "library.sources.file.cancel")}
          </Button>
          <Button variant="primary" disabled={!text.trim()} onClick={submit}>
            {tLibrary(locale, "library.import.pasteConfirm")}
          </Button>
        </>
      }
    >
      <label className="block text-caption text-studio-muted">
        {tLibrary(locale, "library.import.pasteName")}
        <input value={name} maxLength={120} className={INPUT_CLASS} onChange={(event) => setName(event.target.value)} />
      </label>
      <label className="mt-3 block text-caption text-studio-muted">
        {tLibrary(locale, "library.import.pasteText")}
        <textarea
          autoFocus
          value={text}
          placeholder={'[Event "..."]'}
          className={`${INPUT_CLASS} h-56 resize-none font-mono text-dense`}
          onChange={(event) => setText(event.target.value)}
        />
      </label>
    </Dialog>
  );
}
