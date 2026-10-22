"use client";

import { Pin, Plus, X } from "lucide-react";
import {
  boardPreview,
  selectActiveBoard,
  useStudioStore,
} from "@/src/store/studio-store";
import { closeBoardPanel, openBoardPanel } from "./dock-api";
import { tSidebar } from "@/src/i18n/studio-sidebar-strings";
import { IconButton } from "./ui/Button";
import { SidebarItem, SidebarPanel } from "./ui/Sidebar";

export function BoardsSidebar() {
  const locale = useStudioStore((state) => state.settings.locale);
  const boards = useStudioStore((state) => state.boards);
  const activeBoardId = useStudioStore((state) => state.activeBoardId);
  const pinPreviewBoard = useStudioStore((state) => state.pinPreviewBoard);
  const signedIn = useStudioStore((state) => Boolean(state.user));

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
  }

  function handleNewBoard(): void {
    useStudioStore.getState().newBoard();
    const state = useStudioStore.getState();
    const active = selectActiveBoard(state);
    openBoardPanel(active.id, active.title);
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

  return (
    <SidebarPanel
      title={tSidebar(locale, "sidebar.boards.title")}
      actions={
        <IconButton label={tSidebar(locale, "sidebar.boards.newBoard")} shortcut="Ctrl+N" size="sm" onClick={handleNewBoard}>
          <Plus size={15} />
        </IconButton>
      }
    >
      {boards.map((board) => (
        <SidebarItem
          key={board.id}
          selected={board.id === activeBoardId}
          title={
            <>
              {board.title}
              {board.preview ? (
                <span className="text-studio-faint"> {tSidebar(locale, "sidebar.boards.previewSuffix")}</span>
              ) : null}
            </>
          }
          description={boardPreview(board)}
          trailing={
            <span className="flex h-6 items-center">
              {/* SIG-910: visible keep control so the preview no longer needs a
                  hidden double-click to pin. Always rendered on preview rows
                  (the hover-only pattern stays for close). */}
              {board.preview ? (
                <button
                  type="button"
                  title={tSidebar(locale, "sidebar.boards.keep")}
                  aria-label={tSidebar(locale, "sidebar.boards.keepName", { title: board.title })}
                  className="flex h-6 w-6 items-center justify-center rounded-md text-studio-faint hover:bg-studio-hover-strong hover:text-studio-fg"
                  onClick={(event) => {
                    event.stopPropagation();
                    pinPreviewBoard(board.id);
                  }}
                >
                  <Pin size={13} />
                </button>
              ) : null}
              <span className="relative flex h-6 w-6 items-center justify-center">
                {signedIn && board.dirty ? (
                  <span className="text-studio-warning-fg group-hover:hidden" title={tSidebar(locale, "sidebar.boards.unsaved")}>
                    ●
                  </span>
                ) : null}
                <button
                  type="button"
                  title={tSidebar(locale, "sidebar.boards.close")}
                  aria-label={tSidebar(locale, "sidebar.boards.close")}
                  className="absolute inset-0 hidden items-center justify-center rounded-md text-studio-faint hover:bg-studio-hover-strong hover:text-studio-fg group-focus-within:flex group-hover:flex focus-visible:flex"
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
      ))}
    </SidebarPanel>
  );
}
