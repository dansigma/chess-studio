"use client";

import { Bookmark } from "lucide-react";
import type { PlayerColorFilter, PlayerHit } from "@/src/lib/player-types";

function ColorChip({
  label,
  onClick,
}: {
  label: "W" | "B";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label === "W" ? "Games as White" : "Games as Black"}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className="flex h-6 w-6 items-center justify-center rounded border border-studio-border text-[10px] font-semibold text-studio-fg hover:bg-studio-hover"
    >
      {label}
    </button>
  );
}

export function BookmarkStar({
  active,
  onClick,
}: {
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={active ? "Remove bookmark" : "Bookmark player"}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={`flex h-6 w-6 items-center justify-center rounded ${
        active ? "text-amber-300 hover:text-amber-200" : "text-studio-faint hover:bg-studio-hover hover:text-studio-fg"
      }`}
    >
      <Bookmark size={14} fill={active ? "currentColor" : "none"} />
    </button>
  );
}

export function PlayerHitRow({
  player,
  active,
  bookmarked,
  onOpen,
  onToggleBookmark,
}: {
  player: PlayerHit;
  active: boolean;
  bookmarked: boolean;
  onOpen: (color?: PlayerColorFilter) => void;
  onToggleBookmark: () => void;
}) {
  return (
    <div
      className={`mb-1 flex w-full items-center gap-2 rounded-md px-2 py-2 ${
        active ? "bg-studio-selected" : "hover:bg-studio-hover-subtle"
      }`}
    >
      <BookmarkStar active={bookmarked} onClick={onToggleBookmark} />
      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpen()}>
        <div className="truncate text-sm text-studio-fg">{player.displayName}</div>
        <div className="truncate text-[11px] text-studio-faint">{player.subtitle}</div>
      </button>
      <ColorChip label="W" onClick={() => onOpen("white")} />
      <ColorChip label="B" onClick={() => onOpen("black")} />
    </div>
  );
}
