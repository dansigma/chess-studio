"use client";

import { bookmarkKey } from "@/src/lib/player-bookmarks";
import type { PlayerColorFilter, PlayerHit } from "@/src/lib/player-types";
import { useStudioStore } from "@/src/store/studio-store";
import { PlayerHitRow } from "./PlayerHitRow";
import { SidebarHint, SidebarPanel } from "./ui/Sidebar";

export function BookmarksSidebar() {
  const bookmarks = useStudioStore((state) => state.bookmarks);
  const openPlayerView = useStudioStore((state) => state.openPlayerView);
  const togglePlayerBookmark = useStudioStore((state) => state.togglePlayerBookmark);
  const activeId = useStudioStore((state) => state.playerProfile?.id ?? null);

  function open(player: PlayerHit, color: PlayerColorFilter = "all") {
    openPlayerView(player, color);
  }

  return (
    <SidebarPanel title="Bookmarks" meta={bookmarks.length > 0 ? bookmarks.length : undefined}>
      {bookmarks.length === 0 ? (
        <SidebarHint>No bookmarked players yet. Use the bookmark icon next to a search result.</SidebarHint>
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
    </SidebarPanel>
  );
}
