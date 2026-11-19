"use client";

import { useState } from "react";
import { Check, Pencil, Pin, Plus, X } from "lucide-react";
import {
  boardPreview,
  selectActiveBoard,
  useStudioStore,
} from "@/src/store/studio-store";
import { boardTitle, closeBoardPanel, openBoardPanel } from "./dock-api";
import { tSidebar } from "@/src/i18n/studio-sidebar-strings";
import { IconButton } from "./ui/Button";
import { isSyncPending } from "@/src/store/slices/selectors";
import { SidebarItem, SidebarPanel } from "./ui/Sidebar";

export function BoardsSidebar({
  onSelect,
  mobile = false,
}: {
  onSelect?: () => void;
  mobile?: boolean;
} = {}) {
  const locale = useStudioStore((state) => state.settings.locale);
  const boards = useStudioStore((state) => state.boards);
  const activeBoardId = useStudioStore((state) => state.activeBoardId);
  const pinPreviewBoard = useStudioStore((state) => state.pinPreviewBoard);
  const renameBoard = useStudioStore((state) => state.renameBoard);
  const signedIn = useStudioStore((state) => Boolean(state.user));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  // SIG-915: browser-tab semantics — clicking a sidebar row activates the
  // session AND opens (or focuses) its tab in the single board group.
  // Activation focuses the panel, and the dock focus handler moves active
  // there; set active first so notation follows even if the dock is busy.
  function activateOrOpenBoard(boardId: string): void {
    const state = useStudioStore.getState();
    const board = state.boards.find((item) => item.id === boardId);
    if (!board) {
      return;
    }
    state.setActiveBoard(boardId);
    openBoardPanel(boardId, board.title);
    onSelect?.();
  }

  function handleNewBoard(): void {
    useStudioStore.getState().newBoard();
    const state = useStudioStore.getState();
    const active = selectActiveBoard(state);
    openBoardPanel(active.id, active.title);
    onSelect?.();
  }

  function startRename(boardId: string, currentTitle: string): void {
    setEditingId(boardId);
    setDraft(boardTitle(locale, currentTitle));
  }

  function commitRename(boardId: string, currentTitle: string): void {
    const trimmed = draft.trim();
    // An unchanged name keeps the stored default (shown translated) and the
    // board's saved state.
    if (trimmed && trimmed !== boardTitle(locale, currentTitle)) {
      renameBoard(boardId, trimmed);
    }
    setEditingId(null);
  }

  // SIG-907: store→dock close sync. closeBoardPanel is tracked so the dock
  // remove handler skips the echo; closing the last board seeds a fresh
  // session whose panel we open explicitly.
  // SIG-915: activate the store-chosen neighbor (previous else next) so its
  // tab gets focus after the closed panel is removed.
  function handleCloseBoard(boardId: string): void {
    const before = useStudioStore.getState();
    const wasLast = before.boards.length === 1 && before.boards[0].id === boardId;
    const wasActive = before.activeBoardId === boardId;
    before.closeBoard(boardId);
    closeBoardPanel(boardId);
    if (wasLast) {
      const after = useStudioStore.getState();
      const active = selectActiveBoard(after);
      openBoardPanel(active.id, active.title);
      return;
    }
    if (wasActive) {
      const after = useStudioStore.getState();
      const active = selectActiveBoard(after);
      openBoardPanel(active.id, active.title);
    }
  }

  const actionButtonSize = mobile ? "min-h-[44px] min-w-[44px]" : "h-6 w-6";

  return (
    <SidebarPanel
      title={tSidebar(locale, "sidebar.boards.title")}
      actions={
        <IconButton
          label={tSidebar(locale, "sidebar.boards.newBoard")}
          shortcut={mobile ? undefined : "Ctrl+N"}
          size="sm"
          className={mobile ? "min-h-[44px] min-w-[44px]" : undefined}
          onClick={handleNewBoard}
        >
          <Plus size={15} />
        </IconButton>
      }
    >
      {boards.map((board) =>
        editingId === board.id ? (
          <form
            key={board.id}
            data-board-rename-form={board.id}
            // Escape cancels the rename first; a surrounding sheet or dialog closes only on a second press.
            data-escape-defer=""
            className="mb-px flex items-center gap-1 rounded-md bg-studio-hover px-2 py-1.5"
            onSubmit={(event) => {
              event.preventDefault();
              commitRename(board.id, board.title);
            }}
          >
            <input
              autoFocus
              aria-label={tSidebar(locale, "sidebar.boards.rename")}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.stopPropagation();
                  setEditingId(null);
                }
              }}
              className="min-h-[36px] min-w-0 flex-1 rounded border border-studio-border-strong bg-studio-panel px-2 text-body text-studio-fg outline-none focus:border-studio-accent"
            />
            <button
              type="submit"
              title={tSidebar(locale, "sidebar.boards.renameSave")}
              aria-label={tSidebar(locale, "sidebar.boards.renameSave")}
              className={`flex items-center justify-center rounded-md text-studio-accent-text hover:bg-studio-hover-strong ${actionButtonSize}`}
            >
              <Check size={14} />
            </button>
            <button
              type="button"
              title={tSidebar(locale, "sidebar.boards.renameCancel")}
              aria-label={tSidebar(locale, "sidebar.boards.renameCancel")}
              onClick={() => setEditingId(null)}
              className={`flex items-center justify-center rounded-md text-studio-faint hover:bg-studio-hover-strong hover:text-studio-fg ${actionButtonSize}`}
            >
              <X size={14} />
            </button>
          </form>
        ) : (
        <SidebarItem
          key={board.id}
          selected={board.id === activeBoardId}
          title={
            <>
              {boardTitle(locale, board.title)}
              {board.preview ? (
                <span className="text-studio-faint"> {tSidebar(locale, "sidebar.boards.previewSuffix")}</span>
              ) : null}
            </>
          }
          description={boardPreview(board, locale)}
          trailing={
            <span className="flex items-center">
              {/* SIG-910: visible keep control so the preview no longer needs a
                  hidden double-click to pin. Always rendered on preview rows
                  (the hover-only pattern stays for close). */}
              {board.preview ? (
                <button
                  type="button"
                  title={tSidebar(locale, "sidebar.boards.keep")}
                  aria-label={tSidebar(locale, "sidebar.boards.keepName", { title: boardTitle(locale, board.title) })}
                  className={`flex items-center justify-center rounded-md text-studio-faint hover:bg-studio-hover-strong hover:text-studio-fg ${actionButtonSize}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    pinPreviewBoard(board.id);
                  }}
                >
                  <Pin size={13} />
                </button>
              ) : null}
              <button
                type="button"
                title={tSidebar(locale, "sidebar.boards.rename")}
                aria-label={tSidebar(locale, "sidebar.boards.rename")}
                className={`${mobile ? "flex" : "hidden group-focus-within:flex group-hover:flex focus-visible:flex [@media(hover:none)]:flex"} items-center justify-center rounded-md text-studio-faint hover:bg-studio-hover-strong hover:text-studio-fg ${actionButtonSize}`}
                onClick={(event) => {
                  event.stopPropagation();
                  startRename(board.id, board.title);
                }}
              >
                <Pencil size={13} />
              </button>
              {/* SIG-1380: on touch there is no hover, so the X is always shown
                  and the unsaved dot moves out of the box to its own slot
                  instead of hiding under the X. Hover devices keep the dot
                  inside the box, hidden while the X is up. */}
              {signedIn && isSyncPending(board) ? (
                <span
                  className={`mr-1 text-studio-warning-fg ${mobile ? "flex" : "hidden [@media(hover:none)]:flex"}`}
                  title={tSidebar(locale, "sidebar.boards.unsaved")}
                >
                  ●
                </span>
              ) : null}
              <span className={`relative flex items-center justify-center ${actionButtonSize}`}>
                {!mobile && signedIn && isSyncPending(board) ? (
                  <span
                    className="text-studio-warning-fg group-hover:hidden [@media(hover:none)]:hidden"
                    title={tSidebar(locale, "sidebar.boards.unsaved")}
                  >
                    ●
                  </span>
                ) : null}
                <button
                  type="button"
                  title={tSidebar(locale, "sidebar.boards.close")}
                  aria-label={tSidebar(locale, "sidebar.boards.close")}
                  className={`absolute inset-0 ${mobile ? "flex" : "hidden group-focus-within:flex group-hover:flex focus-visible:flex [@media(hover:none)]:flex"} items-center justify-center rounded-md text-studio-faint hover:bg-studio-hover-strong hover:text-studio-fg`}
                  onClick={() => handleCloseBoard(board.id)}
                >
                  <X size={13} />
                </button>
              </span>
            </span>
          }
          onClick={() => activateOrOpenBoard(board.id)}
          onDoubleClick={() => pinPreviewBoard(board.id)}
          onAuxClick={(event) => {
            if (event.button === 1) {
              event.preventDefault();
              handleCloseBoard(board.id);
            }
          }}
        />
        ),
      )}
    </SidebarPanel>
  );
}
