// SIG-1089: "My Games" activity sidebar (My Games 3/5). Lists the user's
// imported games (newest first, paged) with a Sync header, using the same
// `SidebarPanel` grain as `BookmarksSidebar`. Local component state only —
// the list is per-user remote data with its own pagination cursor and sync
// lifecycle, so no zustand slice (same rationale as `SearchSidebar`'s hits).
"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { formatYearMonth } from "@/src/lib/game-date";
import { loadMyGames, MY_GAMES_PAGE_SIZE } from "@/src/lib/my-games/load-games";
import { loadLinkedAccounts, type LinkedAccountSource } from "@/src/lib/my-games/linked-accounts";
import type { PlayerGame } from "@/src/lib/player-types";
import { tMyGames } from "@/src/i18n/my-games-strings";
import { tPanels } from "@/src/i18n/studio-panel-strings";
import { tStudioChrome } from "@/src/i18n/studio-chrome-strings";
import { createBrowserSupabase } from "@/src/lib/supabase/client";
import { selectActiveBoard, useStudioStore } from "@/src/store/studio-store";
import { openBoardPanel } from "./dock-api";
import { GameOpenRow } from "./GameOpenRow";
import { ResultMark } from "./ResultMark";
import { Button, IconButton } from "./ui/Button";
import { SidebarHint, SidebarPanel } from "./ui/Sidebar";
import { myGamesViewState } from "@/src/lib/my-games/view-state";

type SyncNotice =
  | { kind: "synced"; count: number }
  | { kind: "error"; key: "unavailable" | "upstream" }
  | null;

export function MyGamesSidebar() {
  const locale = useStudioStore((state) => state.settings.locale);
  const user = useStudioStore((state) => state.user);
  const importPlayerGame = useStudioStore((state) => state.importPlayerGame);
  const setStatus = useStudioStore((state) => state.setStatus);
  const [games, setGames] = useState<PlayerGame[]>([]);
  const [linkedCount, setLinkedCount] = useState(0);
  const [linkedLoading, setLinkedLoading] = useState(Boolean(user));
  const [gamesLoading, setGamesLoading] = useState(Boolean(user));
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState<SyncNotice>(null);

  // SIG-1089: same open-game behavior as PlayerGamesPanel (preview on single
  // click, independent board on double-click/Shift+Enter).
  function openGame(game: PlayerGame, openInNewBoard = false) {
    if (!game.pgn && !game.moves) {
      setStatus(tPanels(locale, "players.noPgn"));
      return;
    }
    importPlayerGame(game, { openInNewBoard });
    setStatus(null);
    const active = selectActiveBoard(useStudioStore.getState());
    openBoardPanel(active.id, active.title);
  }

  /* eslint-disable react-hooks/set-state-in-effect -- SIG-1089: the
     loading start is intentionally synchronous so a new sign-in never
     flashes a stale list (or the empty state) before the reload lands
     (same grain as LinkedAccountsSection). */
  useEffect(() => {
    if (!user) {
      return;
    }
    let cancelled = false;
    const supabase = createBrowserSupabase();
    if (!supabase) {
      setLinkedLoading(false);
      setGamesLoading(false);
      return;
    }
    setLinkedLoading(true);
    setGamesLoading(true);
    setNotice(null);
    void loadLinkedAccounts(supabase).then((result) => {
      if (cancelled) {
        return;
      }
      setLinkedCount(result.ok ? result.accounts.length : 0);
      setLinkedLoading(false);
    });
    void loadMyGames(supabase, { limit: MY_GAMES_PAGE_SIZE }).then((result) => {
      if (cancelled) {
        return;
      }
      if (result.ok) {
        setGames(result.page.games);
        setHasMore(result.page.hasMore);
        setCursor(result.page.cursor);
      } else {
        setGames([]);
        setHasMore(false);
        setCursor(null);
      }
      setGamesLoading(false);
    });
    return () => {
      cancelled = true;
    };
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [user]);

  function handleLoadMore() {
    if (loadingMore || !hasMore || !cursor) {
      return;
    }
    const supabase = createBrowserSupabase();
    if (!supabase) {
      return;
    }
    setLoadingMore(true);
    void loadMyGames(supabase, { limit: MY_GAMES_PAGE_SIZE, before: cursor }).then((result) => {
      setLoadingMore(false);
      if (!result.ok) {
        return;
      }
      setGames((prev) => [...prev, ...result.page.games]);
      setHasMore(result.page.hasMore);
      setCursor(result.page.cursor);
    });
  }

  function handleSync() {
    if (syncing) {
      return;
    }
    const supabase = createBrowserSupabase();
    if (!supabase) {
      setNotice({ kind: "error", key: "unavailable" });
      return;
    }
    setSyncing(true);
    setNotice(null);
    void fetch("/api/my-games/sync", { method: "POST" })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as {
          imported?: number;
          accounts?: Array<{ source: LinkedAccountSource; error?: string }>;
        } | null;
        if (!response.ok || !payload) {
          setNotice({ kind: "error", key: "unavailable" });
          return;
        }
        const failed = (payload.accounts ?? []).some((account) => account.error);
        if (failed) {
          setNotice({ kind: "error", key: "upstream" });
        } else {
          setNotice({ kind: "synced", count: payload.imported ?? 0 });
        }
      })
      .catch(() => {
        setNotice({ kind: "error", key: "unavailable" });
      })
      .finally(() => {
        void loadMyGames(supabase, { limit: MY_GAMES_PAGE_SIZE }).then((result) => {
          if (result.ok) {
            setGames(result.page.games);
            setHasMore(result.page.hasMore);
            setCursor(result.page.cursor);
          }
          setSyncing(false);
        });
      });
  }

  const view = myGamesViewState({ user, linkedLoading, gamesLoading, linkedCount, games });
  const syncLabel = syncing ? tMyGames(locale, "myGames.syncing") : tMyGames(locale, "myGames.sync");

  return (
    <SidebarPanel
      title={tStudioChrome(locale, "chrome.activity.mygames")}
      meta={games.length > 0 ? games.length : undefined}
      actions={
        user ? (
          <IconButton label={syncLabel} size="sm" disabled={syncing || gamesLoading} onClick={handleSync}>
            <RefreshCw size={14} className={syncing ? "animate-spin" : undefined} />
          </IconButton>
        ) : undefined
      }
      header={
        notice ? (
          <p className="text-caption text-studio-muted">
            {notice.kind === "synced"
              ? notice.count === 1
                ? tMyGames(locale, "myGames.synced.one", { count: notice.count })
                : tMyGames(locale, "myGames.synced.other", { count: notice.count })
              : tMyGames(locale, notice.key === "upstream" ? "myGames.error.upstream" : "myGames.error.unavailable")}
          </p>
        ) : undefined
      }
    >
      {view === "signedOut" ? <SidebarHint>{tMyGames(locale, "myGames.signInHint")}</SidebarHint> : null}
      {view === "loading" ? (
        <p role="status" className="px-2 py-3 text-dense leading-5 text-studio-faint">
          {tMyGames(locale, "myGames.loading")}
        </p>
      ) : null}
      {view === "linkAccount" ? <SidebarHint>{tMyGames(locale, "myGames.linkAccountHint")}</SidebarHint> : null}
      {view === "empty" ? <SidebarHint>{tMyGames(locale, "myGames.empty")}</SidebarHint> : null}
      {view === "list" || (games.length > 0 && (gamesLoading || loadingMore)) ? (
        <>
          {games.map((game) => (
            <GameOpenRow
              key={game.id}
              className="grid w-full grid-cols-[44px_1fr_44px_1fr_44px_64px] items-center gap-2 px-2 py-1.5 text-left text-dense hover:bg-studio-hover-subtle"
              onOpen={() => openGame(game)}
              onOpenNew={() => openGame(game, true)}
            >
              <ResultMark winner={game.winner} />
              <span className="truncate">{game.whiteName}</span>
              <span className="text-right text-studio-faint">{game.whiteRating ?? ""}</span>
              <span className="truncate">{game.blackName}</span>
              <span className="text-right text-studio-faint">{game.blackRating ?? ""}</span>
              <span className="truncate text-studio-faint">{formatYearMonth(game.year, game.month)}</span>
            </GameOpenRow>
          ))}
          {hasMore ? (
            <div className="px-2 py-2">
              <Button variant="secondary" size="sm" disabled={loadingMore || syncing} onClick={handleLoadMore}>
                {loadingMore ? tMyGames(locale, "myGames.syncing") : tMyGames(locale, "myGames.loadMore")}
              </Button>
            </div>
          ) : null}
        </>
      ) : null}
    </SidebarPanel>
  );
}
