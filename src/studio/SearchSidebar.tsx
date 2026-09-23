"use client";

import { useEffect, useState } from "react";
import { bookmarkKey } from "@/src/lib/player-bookmarks";
import type { PlayerColorFilter, PlayerHit } from "@/src/lib/player-types";
import { useStudioStore } from "@/src/store/studio-store";
import { PlayerHitRow } from "./PlayerHitRow";

export function SearchSidebar() {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PlayerHit[]>([]);
  const [loading, setLoading] = useState(false);
  const openPlayerView = useStudioStore((state) => state.openPlayerView);
  const togglePlayerBookmark = useStudioStore((state) => state.togglePlayerBookmark);
  const bookmarks = useStudioStore((state) => state.bookmarks);
  const activeId = useStudioStore((state) => state.playerProfile?.id ?? null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      setLoading(false);
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
          const first = payload.players[0];
          if (first) {
            const params = new URLSearchParams({
              source: first.source,
              username: first.username,
              displayName: first.displayName,
              subtitle: first.subtitle,
            });
            void fetch(`/api/players/games?${params.toString()}`);
          }
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
    <div className="flex h-full w-64 flex-col overflow-hidden rounded-lg bg-studio-panel">
      <div className="px-3 py-3">
        <h2 className="text-sm font-medium text-studio-fg">Search players</h2>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Lichess, Chess.com, or book…"
          className="mt-3 w-full rounded border border-studio-border bg-studio-selected px-2 py-1.5 text-sm text-studio-fg outline-none placeholder:text-studio-disabled focus:border-sky-700"
          autoFocus
        />
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-2 pb-3">
        {loading ? <div className="px-2 py-3 text-[12px] text-studio-faint">Searching…</div> : null}
        {!loading && query.trim().length >= 2 && hits.length === 0 ? (
          <div className="px-2 py-3 text-[12px] text-studio-faint">No players found.</div>
        ) : null}
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
        {query.trim().length < 2 ? (
          <div className="px-2 py-3 text-[12px] leading-5 text-studio-faint">
            Type at least two letters to search Lichess, Chess.com, and the local sample book.
          </div>
        ) : null}
      </div>
    </div>
  );
}
