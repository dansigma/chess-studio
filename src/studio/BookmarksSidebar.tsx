"use client";

import { bookmarkKey } from "@/src/lib/player-bookmarks";
import type { PlayerColorFilter, PlayerHit } from "@/src/lib/player-types";
import { useStudioStore } from "@/src/store/studio-store";
import { PlayerHitRow } from "./PlayerHitRow";

export function BookmarksSidebar() {
  const bookmarks = useStudioStore((state) => state.bookmarks);
  const openPlayerView = useStudioStore((state) => state.openPlayerView);
  const togglePlayerBookmark = useStudioStore((state) => state.togglePlayerBookmark);
  const activeId = useStudioStore((state) => state.playerProfile?.id ?? null);

  function open(player: PlayerHit, color: PlayerColorFilter = "all") {
    openPlayerView(player, color);
  }

  return (
    <div className="flex h-full w-64 flex-col overflow-hidden rounded-lg bg-studio-panel">
      <div className="px-3 py-3">
        <h2 className="text-sm font-medium text-studio-fg">Bookmarks</h2>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-2 pb-3">
        {bookmarks.length === 0 ? (
          <div className="px-2 py-3 text-[12px] leading-5 text-studio-faint">No bookmarked players yet</div>
        ) : (
          bookmarks.map((player) => (
            <PlayerHitRow
              key={bookmarkKey(player)}
              player={player}
              active={activeId === player.id || activeId === bookmarkKey(player)}
              bookmarked
              onOpen={(color) => open(player, color)}
              onToggleBookmark={() => togglePlayerBookmark(player)}
            />
          ))
        )}
      </div>
    </div>
  );
}
