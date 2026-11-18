"use client";

import { useMemo, useState } from "react";
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
import { useIdleLocalPlayers } from "./use-idle-local-players";
import { usePlayerSearch } from "./use-player-search";

const NOTE = "px-3 py-2 text-dense leading-5 text-studio-faint";
const SECTION = "px-2 pb-0.5 pt-1 text-caption uppercase tracking-wider text-studio-faint";

// SIG-1318: the Library's Players mode (was the Search side panel).
// SIG-1338: it is now a master-detail view. Selecting any player (local,
// Lichess or Chess.com) opens the preparation dossier on the right without
// leaving the tab; "Open in Studio" keeps the old online-player flow.
export function LibraryPlayers() {
  const locale = useStudioStore((state) => state.settings.locale);
  const togglePlayerBookmark = useStudioStore((state) => state.togglePlayerBookmark);
  const bookmarks = useStudioStore((state) => state.bookmarks);
  const dossierPlayer = useDossierStore((state) => state.player);
  const openDossierPlayer = useDossierStore((state) => state.openPlayer);
  const { query, setQuery, searching, hits, loading } = usePlayerSearch();
  const [collapsed, setCollapsed] = useState(false);

  const bookmarkedKeys = useMemo(() => new Set(bookmarks.map((item) => bookmarkKey(item))), [bookmarks]);
  // SIG-1405: with no query the column suggests prep targets that already
  // exist locally: the user's bookmarks and the most frequent players in the
  // loaded PGN databases. The overview is skipped while a search is running.
  const { top: idleLocalPlayers, names: localPlayerNames } = useIdleLocalPlayers(!searching);
  const bookmarkedPlayers = useMemo(
    () =>
      bookmarks.map((bookmark) =>
        // A stored bookmark keeps only the online fields; a studio player that
        // still has games in the loaded PGN files is marked local again so the
        // dossier offers "View in Games tab" instead of the Studio handoff.
        bookmark.source === "studio" &&
        bookmark.inDatabases !== true &&
        localPlayerNames.has(bookmark.username.trim().toLowerCase())
          ? { ...bookmark, inDatabases: true }
          : bookmark,
      ),
    [bookmarks, localPlayerNames],
  );
  const idleSuggestions = useMemo(
    () => idleLocalPlayers.filter((player) => !bookmarkedKeys.has(bookmarkKey(player))),
    [idleLocalPlayers, bookmarkedKeys],
  );
  // Collapsing only makes sense while a dossier is open: with no player the
  // whole tab is the search.
  const searchCollapsed = collapsed && dossierPlayer !== null;

  function open(player: PlayerHit, color: PlayerColorFilter = "all") {
    openDossierPlayer(player, color);
  }

  function isActive(player: PlayerHit): boolean {
    return dossierPlayer !== null && bookmarkKey(dossierPlayer) === bookmarkKey(player);
  }

  function renderHit(player: PlayerHit) {
    return (
      <PlayerHitRow
        key={bookmarkKey(player)}
        player={player}
        active={isActive(player)}
        bookmarked={bookmarkedKeys.has(bookmarkKey(player))}
        onOpen={(color) => open(player, color)}
        onToggleBookmark={() => togglePlayerBookmark(player)}
      />
    );
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
              clearLabel={tLibrary(locale, "library.players.clear")}
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
            {hits.map((player) => renderHit(player))}
            {!loading && searching && !hits.some((player) => player.source === "chesscom") ? (
              // SIG-1210: Chess.com only matches exact usernames.
              <p className="px-3 py-1.5 text-caption leading-4 text-studio-faint">
                {tLibrary(locale, "library.players.chesscomExact")}
              </p>
            ) : null}
            {!searching ? (
              bookmarkedPlayers.length === 0 && idleSuggestions.length === 0 ? (
                <p className={NOTE}>{tLibrary(locale, "library.players.hint")}</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {bookmarkedPlayers.length > 0 ? (
                    <section
                      aria-labelledby="library-players-bookmarked"
                      data-testid="library-players-bookmarked"
                      className="flex flex-col gap-0.5"
                    >
                      <h3 id="library-players-bookmarked" className={SECTION}>
                        {tLibrary(locale, "library.players.bookmarked")}
                      </h3>
                      {bookmarkedPlayers.map((player) => renderHit(player))}
                    </section>
                  ) : null}
                  {idleSuggestions.length > 0 ? (
                    <section
                      aria-labelledby="library-players-local"
                      data-testid="library-players-local"
                      className="flex flex-col gap-0.5"
                    >
                      <h3 id="library-players-local" className={SECTION}>
                        {tLibrary(locale, "library.players.localTop")}
                      </h3>
                      {idleSuggestions.map((player) => renderHit(player))}
                    </section>
                  ) : null}
                </div>
              )
            ) : null}
          </div>
        </Panel>
      )}
      <LibraryPlayerDossier />
    </div>
  );
}
