"use client";

import { bookmarkKey } from "@/src/lib/player-bookmarks";
import type { PlayerColorFilter, PlayerHit } from "@/src/lib/player-types";
import { tLibrary } from "@/src/i18n/library-strings";
import { useStudioStore } from "@/src/store/studio-store";
import { PlayerHitRow } from "../PlayerHitRow";
import { SearchInput } from "../ui/Controls";
import { Panel } from "../ui/Panel";
import { usePlayerSearch } from "./use-player-search";

const NOTE = "px-3 py-2 text-dense leading-5 text-studio-faint";

// SIG-1318: the Library's Players mode (was the Search side panel). Opening a
// player fills the Studio's explorer/games panels and switches to the Studio.
export function LibraryPlayers() {
  const locale = useStudioStore((state) => state.settings.locale);
  const openPlayerView = useStudioStore((state) => state.openPlayerView);
  const setWorkspaceView = useStudioStore((state) => state.setWorkspaceView);
  const togglePlayerBookmark = useStudioStore((state) => state.togglePlayerBookmark);
  const bookmarks = useStudioStore((state) => state.bookmarks);
  const activeId = useStudioStore((state) => state.playerProfile?.id ?? null);
  const { query, setQuery, searching, hits, loading } = usePlayerSearch();

  const bookmarkedKeys = new Set(bookmarks.map((item) => bookmarkKey(item)));

  function open(player: PlayerHit, color: PlayerColorFilter = "all") {
    openPlayerView(player, color);
    setWorkspaceView("studio");
  }

  return (
    <Panel
      as="section"
      aria-label={tLibrary(locale, "library.players.label")}
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      data-testid="library-players"
    >
      <div className="px-3 pb-2 pt-3">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder={tLibrary(locale, "library.players.placeholder")}
          label={tLibrary(locale, "library.players.label")}
          autoFocus
        />
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-1.5 pb-2.5">
        {loading ? (
          <p role="status" className={NOTE}>
            {tLibrary(locale, "library.players.searching")}
          </p>
        ) : null}
        {!loading && searching && hits.length === 0 ? <p className={NOTE}>{tLibrary(locale, "library.players.none")}</p> : null}
        {hits.map((player) => (
          <PlayerHitRow
            key={player.id}
            player={player}
            active={activeId === player.id || activeId === bookmarkKey(player)}
            bookmarked={bookmarkedKeys.has(bookmarkKey(player))}
            onOpen={(color) => open(player, color)}
            onToggleBookmark={() => togglePlayerBookmark(player)}
          />
        ))}
        {!loading && searching && !hits.some((player) => player.source === "chesscom") ? (
          // SIG-1210: Chess.com only matches exact usernames.
          <p className="px-3 py-1.5 text-caption leading-4 text-studio-faint">
            {tLibrary(locale, "library.players.chesscomExact")}
          </p>
        ) : null}
        {!searching ? <p className={NOTE}>{tLibrary(locale, "library.players.hint")}</p> : null}
      </div>
    </Panel>
  );
}
