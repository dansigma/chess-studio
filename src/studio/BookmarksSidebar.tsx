"use client";

import { bookmarkKey } from "@/src/lib/player-bookmarks";
import type { PlayerColorFilter, PlayerHit } from "@/src/lib/player-types";
import { tSidebar } from "@/src/i18n/studio-sidebar-strings";
import { useStudioStore } from "@/src/store/studio-store";
import { PlayerHitRow } from "./PlayerHitRow";
import { SidebarHint, SidebarPanel } from "./ui/Sidebar";

export function BookmarksSidebar() {
  const locale = useStudioStore((state) => state.settings.locale);
  const bookmarks = useStudioStore((state) => state.bookmarks);
  const openPlayerView = useStudioStore((state) => state.openPlayerView);
  const togglePlayerBookmark = useStudioStore((state) => state.togglePlayerBookmark);
  const activeId = useStudioStore((state) => state.playerProfile?.id ?? null);

  function open(player: PlayerHit, color: PlayerColorFilter = "all") {
    openPlayerView(player, color);
  }

  return (
    <SidebarPanel title={tSidebar(locale, "sidebar.bookmarks.title")} meta={bookmarks.length > 0 ? bookmarks.length : undefined}>
      {bookmarks.length === 0 ? (
        <SidebarHint>{tSidebar(locale, "sidebar.bookmarks.empty")}</SidebarHint>
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
