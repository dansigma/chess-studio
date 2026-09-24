"use client";

import { Plus } from "lucide-react";
import { boardPreview, useStudioStore } from "@/src/store/studio-store";
import { IconButton } from "./ui/Button";
import { SidebarItem, SidebarPanel } from "./ui/Sidebar";

export function BoardsSidebar() {
  const boards = useStudioStore((state) => state.boards);
  const activeBoardId = useStudioStore((state) => state.activeBoardId);
  const setActiveBoard = useStudioStore((state) => state.setActiveBoard);
  const pinPreviewBoard = useStudioStore((state) => state.pinPreviewBoard);
  const newBoard = useStudioStore((state) => state.newBoard);
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
          trailing={signedIn && board.dirty ? <span className="text-studio-warning-fg" title="Unsaved changes">●</span> : undefined}
          onClick={() => setActiveBoard(board.id)}
          onDoubleClick={() => pinPreviewBoard(board.id)}
        />
      ))}
    </SidebarPanel>
  );
}
