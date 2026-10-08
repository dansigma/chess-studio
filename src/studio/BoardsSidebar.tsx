"use client";

import { Plus, X } from "lucide-react";
import { boardPreview, useStudioStore } from "@/src/store/studio-store";
import { IconButton } from "./ui/Button";
import { SidebarItem, SidebarPanel } from "./ui/Sidebar";

export function BoardsSidebar() {
  const boards = useStudioStore((state) => state.boards);
  const activeBoardId = useStudioStore((state) => state.activeBoardId);
  const setActiveBoard = useStudioStore((state) => state.setActiveBoard);
  const pinPreviewBoard = useStudioStore((state) => state.pinPreviewBoard);
  const newBoard = useStudioStore((state) => state.newBoard);
  const closeBoard = useStudioStore((state) => state.closeBoard);
  const signedIn = useStudioStore((state) => Boolean(state.user));

  return (
    <SidebarPanel
      title="Open boards"
      actions={
        <IconButton label="New board" shortcut="Ctrl+N" size="sm" onClick={newBoard}>
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
                onClick={() => closeBoard(board.id)}
              >
                <X size={13} />
              </button>
            </span>
          }
          onClick={() => setActiveBoard(board.id)}
          onDoubleClick={() => pinPreviewBoard(board.id)}
          onAuxClick={(event) => {
            if (event.button === 1) {
              event.preventDefault();
              closeBoard(board.id);
            }
          }}
        />
      ))}
    </SidebarPanel>
  );
}
