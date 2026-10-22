"use client";

import { Bookmark } from "lucide-react";
import { tSidebar } from "@/src/i18n/studio-sidebar-strings";
import type { PlayerColorFilter, PlayerHit } from "@/src/lib/player-types";
import { useStudioStore } from "@/src/store/studio-store";

function ColorChip({
  label,
  title,
  onClick,
}: {
  label: "W" | "B";
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className="flex h-6 w-6 items-center justify-center rounded-md border border-studio-border-strong text-[10px] font-semibold text-studio-muted hover:bg-studio-hover-strong hover:text-studio-fg"
    >
      {label}
    </button>
  );
}

export function BookmarkStar({
  active,
  title,
  onClick,
}: {
  active: boolean;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={`flex h-6 w-6 items-center justify-center rounded-md ${
        active
          ? "text-studio-warning-fg hover:bg-studio-hover-strong"
          : "text-studio-faint hover:bg-studio-hover-strong hover:text-studio-fg"
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
  const locale = useStudioStore((state) => state.settings.locale);
  return (
    <div
      className={`relative mb-px flex w-full items-center gap-2 rounded-md px-2 py-1.5 ${
        active ? "bg-studio-accent-soft" : "hover:bg-studio-hover"
      }`}
    >
      {active ? <span className="absolute inset-y-2 left-0 w-0.5 rounded bg-studio-accent" /> : null}
      <BookmarkStar
        active={bookmarked}
        title={tSidebar(locale, bookmarked ? "sidebar.player.removeBookmark" : "sidebar.player.bookmark")}
        onClick={onToggleBookmark}
      />
      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpen()}>
        <div className="truncate text-body text-studio-fg">{player.displayName}</div>
        <div className="truncate text-caption text-studio-faint">{player.subtitle}</div>
      </button>
      <ColorChip label="W" title={tSidebar(locale, "sidebar.player.gamesWhite")} onClick={() => onOpen("white")} />
      <ColorChip label="B" title={tSidebar(locale, "sidebar.player.gamesBlack")} onClick={() => onOpen("black")} />
    </div>
  );
}
