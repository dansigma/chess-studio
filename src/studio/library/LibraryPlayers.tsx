"use client";

import { useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { bookmarkKey } from "@/src/lib/player-bookmarks";
import type { PlayerColorFilter, PlayerHit } from "@/src/lib/player-types";
import { tLibrary } from "@/src/i18n/library-strings";
import { useStudioStore } from "@/src/store/studio-store";
import { PlayerHitRow } from "../PlayerHitRow";
import { SearchInput } from "../ui/Controls";
import { IconButton } from "../ui/Button";
import { Panel } from "../ui/Panel";
import { LibraryPlayerDossier } from "./dossier/LibraryPlayerDossier";
import { useDossierStore } from "./dossier/dossier-store";
import { usePlayerSearch } from "./use-player-search";

const NOTE = "px-3 py-2 text-dense leading-5 text-studio-faint";

// SIG-1318: the Library's Players mode (was the Search side panel).
// SIG-1338: it is now a master-detail view. Selecting any player (local,
// Lichess or Chess.com) opens the preparation dossier on the right without
// leaving the tab; "Open in Studio" keeps the old online-player flow.
export function LibraryPlayers() {
  const locale = useStudioStore((state) => state.settings.locale);
  const togglePlayerBookmark = useStudioStore((state) => state.togglePlayerBookmark);
  const bookmarks = useStudioStore((state) => state.bookmarks);
  const activeId = useStudioStore((state) => state.playerProfile?.id ?? null);
  const dossierPlayer = useDossierStore((state) => state.player);
  const openDossierPlayer = useDossierStore((state) => state.openPlayer);
  const { query, setQuery, searching, hits, loading } = usePlayerSearch();
  const [collapsed, setCollapsed] = useState(false);

  const bookmarkedKeys = new Set(bookmarks.map((item) => bookmarkKey(item)));
  // Collapsing only makes sense while a dossier is open: with no player the
  // whole tab is the search.
  const searchCollapsed = collapsed && dossierPlayer !== null;

  function open(player: PlayerHit, color: PlayerColorFilter = "all") {
    openDossierPlayer(player, color);
  }

  return (
    <div className="flex min-h-0 flex-1 gap-1.5" data-testid="library-players">
      {searchCollapsed ? (
        <Panel
          as="section"
          aria-label={tLibrary(locale, "library.players.label")}
          className="flex w-10 shrink-0 flex-col items-center py-2"
          data-testid="library-players-strip"
        >
          <IconButton
            size="sm"
            label={tLibrary(locale, "library.dossier.expandSearch")}
            onClick={() => setCollapsed(false)}
          >
            <PanelLeftOpen size={14} />
          </IconButton>
        </Panel>
      ) : (
        <Panel
          as="section"
          aria-label={tLibrary(locale, "library.players.label")}
          className="flex min-h-0 w-[300px] shrink-0 flex-col overflow-hidden"
          data-testid="library-players-list"
        >
          <div className="flex items-center gap-1 px-3 pb-2 pt-3">
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder={tLibrary(locale, "library.players.placeholder")}
              label={tLibrary(locale, "library.players.label")}
              autoFocus
              className="min-w-0 flex-1"
            />
            {dossierPlayer ? (
              <IconButton
                size="sm"
                label={tLibrary(locale, "library.dossier.collapseSearch")}
                onClick={() => setCollapsed(true)}
              >
                <PanelLeftClose size={14} />
              </IconButton>
            ) : null}
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
                active={activeId === player.id || activeId === bookmarkKey(player) || dossierPlayer?.id === player.id}
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
      )}
      <LibraryPlayerDossier />
    </div>
  );
}
