"use client";

import { boardPreview, useStudioStore } from "@/src/store/studio-store";

export function BoardsSidebar() {
  const boards = useStudioStore((state) => state.boards);
  const activeBoardId = useStudioStore((state) => state.activeBoardId);
  const setActiveBoard = useStudioStore((state) => state.setActiveBoard);
  const pinPreviewBoard = useStudioStore((state) => state.pinPreviewBoard);
  const newBoard = useStudioStore((state) => state.newBoard);

  return (
    <div className="flex h-full w-64 flex-col overflow-hidden rounded-lg bg-studio-panel">
      <div className="flex items-center justify-between px-3 py-3">
        <h2 className="text-sm font-medium text-studio-fg">Open Boards</h2>
        <button
          className="rounded px-2 py-0.5 text-lg text-studio-muted hover:bg-studio-hover hover:text-studio-fg"
          onClick={newBoard}
          title="New board"
        >
          +
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-2 pb-3">
        {boards.map((board) => (
          <button
            key={board.id}
            onClick={() => setActiveBoard(board.id)}
            onDoubleClick={() => pinPreviewBoard(board.id)}
            className={`mb-1 w-full rounded-md px-3 py-2 text-left ${
              board.id === activeBoardId ? "bg-studio-selected" : "hover:bg-studio-hover-subtle"
            }`}
          >
            <div className="truncate text-sm text-studio-fg">
              {board.title}
              {board.preview ? <span className="text-studio-faint"> · preview</span> : null}
            </div>
            <div className="truncate text-[11px] text-studio-faint">{boardPreview(board)}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
