"use client";

import { useEffect, useState } from "react";
import { bookmarkKey } from "@/src/lib/player-bookmarks";
import type { PlayerColorFilter, PlayerHit } from "@/src/lib/player-types";
import { tSidebar } from "@/src/i18n/studio-sidebar-strings";
import { useStudioStore } from "@/src/store/studio-store";
import { PlayerHitRow } from "./PlayerHitRow";
import { SearchInput } from "./ui/Controls";
import { SidebarHint, SidebarPanel } from "./ui/Sidebar";

export function SearchSidebar() {
  const locale = useStudioStore((state) => state.settings.locale);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PlayerHit[]>([]);
  const [loading, setLoading] = useState(false);
  const openPlayerView = useStudioStore((state) => state.openPlayerView);
  const togglePlayerBookmark = useStudioStore((state) => state.togglePlayerBookmark);
  const bookmarks = useStudioStore((state) => state.bookmarks);
  const activeId = useStudioStore((state) => state.playerProfile?.id ?? null);

  const searching = query.trim().length >= 2;
  const visibleHits = searching ? hits : [];
  const visibleLoading = searching && loading;

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      void fetch(`/api/players/search?q=${encodeURIComponent(q)}`, {
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error("search failed");
          }
          return (await response.json()) as { players: PlayerHit[] };
        })
        .then((payload) => {
          setHits(payload.players);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }
          setHits([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setLoading(false);
          }
        });
    }, 280);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  function open(player: PlayerHit, color: PlayerColorFilter = "all") {
    openPlayerView(player, color);
  }

  const bookmarkedKeys = new Set(bookmarks.map((item) => bookmarkKey(item)));

  return (
    <SidebarPanel
      title={tSidebar(locale, "sidebar.search.title")}
      header={
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder={tSidebar(locale, "sidebar.search.placeholder")}
          autoFocus
        />
      }
    >
      {visibleLoading ? (
        <p role="status" className="px-2 py-3 text-dense leading-5 text-studio-faint">
          {tSidebar(locale, "sidebar.search.searching")}
        </p>
      ) : null}
      {!visibleLoading && searching && visibleHits.length === 0 ? (
        <SidebarHint>{tSidebar(locale, "sidebar.search.noPlayers")}</SidebarHint>
      ) : null}
      {visibleHits.map((player) => (
        <PlayerHitRow
          key={player.id}
          player={player}
          active={activeId === player.id || activeId === bookmarkKey(player)}
          bookmarked={bookmarkedKeys.has(bookmarkKey(player))}
          onOpen={(color) => open(player, color)}
          onToggleBookmark={() => togglePlayerBookmark(player)}
        />
      ))}
      {!searching ? (
        <SidebarHint>{tSidebar(locale, "sidebar.search.hint")}</SidebarHint>
      ) : null}
    </SidebarPanel>
  );
}
