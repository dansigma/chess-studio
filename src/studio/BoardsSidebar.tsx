"use client";

import { Columns2, Plus, X } from "lucide-react";
import {
  boardPreview,
  selectActiveBoard,
  useStudioStore,
} from "@/src/store/studio-store";
import { closeBoardPanel, openBoardPanel } from "./dock-api";
import { IconButton } from "./ui/Button";
import { SidebarItem, SidebarPanel } from "./ui/Sidebar";

export function BoardsSidebar() {
  const boards = useStudioStore((state) => state.boards);
  const activeBoardId = useStudioStore((state) => state.activeBoardId);
  const setActiveBoard = useStudioStore((state) => state.setActiveBoard);
  const pinPreviewBoard = useStudioStore((state) => state.pinPreviewBoard);
  const signedIn = useStudioStore((state) => Boolean(state.user));

  // SIG-907: open (or focus) this session's `board:*` panel side by side.
  // Activation focuses the panel, and the dock focus handler moves active
  // there; set active first so notation follows even if the dock is busy.
  function openSplitView(boardId: string): void {
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
  function handleCloseBoard(boardId: string): void {
    const before = useStudioStore.getState();
    const wasLast = before.boards.length === 1 && before.boards[0].id === boardId;
    before.closeBoard(boardId);
    closeBoardPanel(boardId);
    if (wasLast) {
      const after = useStudioStore.getState();
      const active = selectActiveBoard(after);
      openBoardPanel(active.id, active.title);
    }
  }

  return (
    <SidebarPanel
      title="Open boards"
      actions={
        <IconButton label="New board" shortcut="Ctrl+N" size="sm" onClick={handleNewBoard}>
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
              {board.preview ? <span className="text-studio-faint"> · preview</span> : null}
            </>
          }
          description={boardPreview(board)}
          trailing={
            <span className="flex h-6 items-center">
              <button
                type="button"
                title="Open in split view"
                aria-label={`Open ${board.title} in split view`}
                className="hidden h-6 w-6 items-center justify-center rounded-md text-studio-faint hover:bg-studio-hover-strong hover:text-studio-fg group-focus-within:flex group-hover:flex focus-visible:flex"
                onClick={(event) => {
                  event.stopPropagation();
                  openSplitView(board.id);
                }}
              >
                <Columns2 size={13} />
              </button>
              <span className="relative flex h-6 w-6 items-center justify-center">
                {signedIn && board.dirty ? (
                  <span className="text-studio-warning-fg group-hover:hidden" title="Unsaved changes">
                    ●
                  </span>
                ) : null}
                <button
                  type="button"
                  title="Close board"
                  aria-label="Close board"
                  className="absolute inset-0 hidden items-center justify-center rounded-md text-studio-faint hover:bg-studio-hover-strong hover:text-studio-fg group-focus-within:flex group-hover:flex focus-visible:flex"
                  onClick={() => handleCloseBoard(board.id)}
                >
                  <X size={13} />
                </button>
              </span>
            </span>
          }
          onClick={() => setActiveBoard(board.id)}
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
