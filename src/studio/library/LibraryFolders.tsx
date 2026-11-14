"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
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
const SELECT_CLASS = "h-7 max-w-44 shrink-0 rounded-md bg-studio-hover px-1.5 text-dense text-studio-fg";
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

/** A `position: fixed` menu anchored under its trigger; closes on outside pointer-down. */
export function PopMenu({
  anchor,
  label,
  onClose,
  children,
}: {
  anchor: { x: number; y: number };
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
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
    <div ref={ref} className="fixed z-[1000]" style={{ left: anchor.x, top: anchor.y }}>
      <MenuSurface className="min-w-48" onClose={onClose} label={label}>
        {children}
      </MenuSurface>
    </div>
  );
}

/** Anchor under a trigger button, kept inside the viewport near the right edge. */
export function anchorBelow(element: HTMLElement): { x: number; y: number } {
  const rect = element.getBoundingClientRect();
  return { x: Math.max(8, Math.min(rect.left, window.innerWidth - MENU_MIN_WIDTH - 8)), y: rect.bottom + 4 };
}

/** "All folders" or one folder; subfolders are indented under their parent. */
export function FolderSelect() {
  const locale = useStudioStore((s) => s.settings.locale);
  const files = useStudioStore((s) => s.files);
  const setFolderId = useLibraryStore((s) => s.setFolderId);
  const selected = useSelectedFolderId();
  const options = buildFolderTree(files.folders, [], "").folderOptions;
  if (options.length === 0) {
    return null;
  }
  return (
    <select
      aria-label={tLibrary(locale, "library.folders.label")}
      value={selected ?? ""}
      onChange={(event) => setFolderId(event.target.value || null)}
      className={SELECT_CLASS}
    >
      <option value="">{tLibrary(locale, "library.folders.all")}</option>
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {"  ".repeat(option.depth) + option.name}
        </option>
      ))}
    </select>
  );
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

/** The Folders menu: create, rename, move and delete the selected folder; refresh from the account. */
export function FoldersMenu() {
  const locale = useStudioStore((s) => s.settings.locale);
  const files = useStudioStore((s) => s.files);
  const user = useStudioStore((s) => s.user);
  const createFileFolder = useStudioStore((s) => s.createFileFolder);
  const renameFileFolder = useStudioStore((s) => s.renameFileFolder);
  const moveFileFolder = useStudioStore((s) => s.moveFileFolder);
  const deleteFileFolder = useStudioStore((s) => s.deleteFileFolder);
  const setStatus = useStudioStore((s) => s.setStatus);
  const setFolderId = useLibraryStore((s) => s.setFolderId);
  const selectedId = useSelectedFolderId();
  const selected = files.folders.find((folder) => folder.id === selectedId);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const [dialog, setDialog] = useState<FolderDialog | null>(null);
  const [name, setName] = useState("");
  const t = (key: Parameters<typeof tLibrary>[1], vars?: Record<string, string | number>) => tLibrary(locale, key, vars);

  const open = (next: FolderDialog) => {
    setAnchor(null);
    setName(next === "rename" ? (selected?.name ?? "") : next === "delete" || next === "move" ? "" : t("library.folders.defaultName"));
    setDialog(next);
  };
  const close = () => setDialog(null);

  const submitName = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    if (dialog === "rename" && selected) {
      renameFileFolder(selected.id, trimmed);
    } else if (dialog === "new") {
      createFileFolder(trimmed, null);
    } else if (dialog === "newSub" && selected) {
      createFileFolder(trimmed, selected.id);
    }
    close();
  };

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
        <Dialog
          title={
            dialog === "rename"
              ? t("library.folders.renameTitle")
              : dialog === "newSub" && selected
                ? t("library.folders.newSubTitle", { name: selected.name })
                : t("library.folders.newTitle")
          }
          onClose={close}
          width="w-[24rem]"
          footer={
            <>
              <Button variant="ghost" onClick={close}>
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
      ) : null}
      {dialog === "delete" && selected ? (
        <Dialog
          title={t("library.folders.deleteTitle", { name: selected.name })}
          onClose={close}
          width="w-[24rem]"
          footer={
            <>
              <Button variant="ghost" onClick={close}>
                {t("library.sources.file.cancel")}
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  deleteFileFolder(selected.id);
                  setFolderId(null);
                  close();
                }}
              >
                {t("library.sources.file.deleteConfirm")}
              </Button>
            </>
          }
        >
          {t("library.folders.deleteBody")}
        </Dialog>
      ) : null}
      {dialog === "move" && selected ? (
        <FolderMoveDialog
          title={t("library.folders.moveTitle", { name: selected.name })}
          noneLabel={t("library.folders.topLevel")}
          noneDisabled={selected.parentId === null}
          isDisabled={(id) =>
            id === selected.id || id === selected.parentId || isDescendantFolder(files.folders, id, selected.id)
          }
          onClose={close}
          onPick={(target) => {
            if (!moveFileFolder(selected.id, target)) {
              setStatus(FOLDER_CYCLE_MESSAGE);
            }
            close();
          }}
        />
      ) : null}
    </>
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
