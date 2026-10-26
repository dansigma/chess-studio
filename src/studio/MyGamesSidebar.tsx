// SIG-1089: "My Games" activity sidebar (My Games 3/5). Lists the user's
// imported games (newest first, paged) with a Sync header, using the same
// `SidebarPanel` grain as `BookmarksSidebar`. Local component state only —
// the list is per-user remote data with its own pagination cursor and sync
// lifecycle, so no zustand slice (same rationale as `SearchSidebar`'s hits).
//
// SIG-1090: batch review controls (My Games 4/5). Checkboxes select loaded
// rows; "Review selected" / "Review all unreviewed" run the sequential
// `createReviewQueue` at the lowest engine priority (`batch` slot) with the
// e2e fake seam when enabled. Each finished summary is written back to the 4
// granted columns and patched into local state, so accuracy badges survive
// reload; opening a reviewed row hits the cached result with no second
// analysis (same cache key as the interactive hook).
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChartSpline, RefreshCw } from "lucide-react";
import { formatTimeClass, formatYearMonth } from "@/src/lib/game-date";
import { deviationBadgeText, deviationForGame } from "@/src/lib/my-games/deviation-for-game";
import { loadMyGames, MY_GAMES_PAGE_SIZE } from "@/src/lib/my-games/load-games";
import { loadLinkedAccounts, type LinkedAccountSource } from "@/src/lib/my-games/linked-accounts";
import {
  isReviewableGame,
  reviewableSelection,
  unreviewedReviewableGames,
} from "@/src/lib/my-games/review-select";
import {
  createReviewQueue,
  type ReviewQueueGame,
} from "@/src/lib/my-games/review-queue";
import type { PlayerGame } from "@/src/lib/player-types";
import { tMyGames } from "@/src/i18n/my-games-strings";
import { tRepertoire } from "@/src/i18n/repertoire-strings";
import { tPanels } from "@/src/i18n/studio-panel-strings";
import { tStudioChrome } from "@/src/i18n/studio-chrome-strings";
import { createBrowserSupabase } from "@/src/lib/supabase/client";
import { toJson } from "@/src/lib/supabase/database.types";
import { DEFAULT_REVIEW_PRESET } from "@/src/chess/review-engine";
import { acquire } from "@/src/engine/shared-engine";
import { defaultEngineThreads } from "@/src/engine/stockfish-client";
import { createE2eFakeReviewEngine, isE2eFakeReviewEnabled } from "./review/e2e-fake-review-engine";
import { createLeaseEngine } from "./review/lease-engine";
import { selectActiveBoard, useStudioStore } from "@/src/store/studio-store";
import { openBoardPanel, openStudioPanel } from "./dock-api";
import { GameOpenRow } from "./GameOpenRow";
import { ResultMark } from "./ResultMark";
import { Button, IconButton } from "./ui/Button";
import { SidebarHint, SidebarPanel } from "./ui/Sidebar";
import { myGamesViewState } from "@/src/lib/my-games/view-state";

type SyncNotice =
  | { kind: "synced"; count: number }
  | { kind: "error"; key: "unavailable" | "upstream" }
  | { kind: "review"; count: number }
  | null;

type BatchState = { done: number; total: number };

export function MyGamesSidebar() {
  const locale = useStudioStore((state) => state.settings.locale);
  const engineBuild = useStudioStore((state) => state.settings.engineBuild);
  const engineThreads = useStudioStore((state) => state.settings.engineThreads);
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
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [batch, setBatch] = useState<BatchState | null>(null);
  const batchRef = useRef<{ cancel: () => void; release: () => void } | null>(null);

  // SIG-1090: unmount cancels the in-flight batch (the queue stops after the
  // current game; the lease release lets a waiting interactive slot promote).
  // Read the ref at cleanup time: capturing it at effect time would freeze the
  // pre-batch value (null), so an unmount mid-batch would cancel nothing.
  useEffect(() => {
    return () => {
      batchRef.current?.cancel();
      batchRef.current?.release();
    };
  }, []);

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

  function toggleSelect(rowId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return next;
    });
  }

  function startBatch(targets: PlayerGame[]) {
    if (batchRef.current || targets.length === 0) {
      return;
    }
    const supabase = createBrowserSupabase();
    if (!supabase) {
      setNotice({ kind: "error", key: "unavailable" });
      return;
    }
    const queueGames: ReviewQueueGame[] = targets.map((game) => ({
      id: game.rowId ?? game.id,
      externalId: game.id,
      pgn: game.pgn ?? "",
      color: game.color,
      whiteName: game.whiteName,
      blackName: game.blackName,
      whiteRating: game.whiteRating,
      blackRating: game.blackRating,
      eco: game.eco,
      opening: game.opening,
    }));
    let stopped = false;
    const isCancelled = () => stopped;
    // Same seam shape as `useGameReview`: the e2e fake never takes a lease.
    const useFake = isE2eFakeReviewEnabled();
    const lease = useFake ? null : acquire("batch", engineBuild);
    const threads = Math.max(engineThreads, defaultEngineThreads());
    const engine = lease
      ? createLeaseEngine(lease, threads, isCancelled)
      : createE2eFakeReviewEngine({ delayMs: 40, isCancelled });
    // Batch preset is fixed (no picker in batch UI); the same preset feeds
    // the cache key, so the interactive opener reuses these rows.
    const queue = createReviewQueue({
      games: queueGames,
      preset: DEFAULT_REVIEW_PRESET,
      engineBuild,
      threads,
      engine,
      isCancelled,
      onProgress: (done, total) => {
        if (!stopped) {
          setBatch({ done, total });
        }
      },
      onGameDone: async (summary, game) => {
        if (!summary) {
          failedCount += 1;
          return;
        }
        const { error } = await supabase
          .from("my_games")
          .update({
            user_accuracy: summary.userAccuracy,
            opponent_accuracy: summary.opponentAccuracy,
            reviewed_at: summary.reviewedAt,
            mistake_counts: toJson(summary.mistakeCounts),
          })
          .eq("id", game.id);
        if (error) {
          failedCount += 1;
          return;
        }
        setGames((prev) =>
          prev.map((row) =>
            row.rowId === game.id
              ? {
                  ...row,
                  userAccuracy: summary.userAccuracy,
                  opponentAccuracy: summary.opponentAccuracy,
                  reviewedAt: summary.reviewedAt,
                }
              : row,
          ),
        );
      },
    });
    let failedCount = 0;
    batchRef.current = {
      cancel: () => {
        stopped = true;
        queue.cancel();
      },
      release: () => lease?.release(),
    };
    setNotice(null);
    setBatch({ done: 0, total: queueGames.length });
    void queue
      .start()
      .catch(() => undefined)
      .finally(() => {
        batchRef.current = null;
        lease?.release();
        setBatch(null);
        if (failedCount > 0) {
          setNotice({ kind: "review", count: failedCount });
        }
      });
  }

  function handleCancelBatch() {
    batchRef.current?.cancel();
    batchRef.current?.release();
    batchRef.current = null;
    setBatch(null);
  }

  const reviewable = games.filter(isReviewableGame);
  const selectedGames = reviewableSelection(games, selected);
  const unreviewed = unreviewedReviewableGames(games);
  const allSelected = reviewable.length > 0 && selectedGames.length === reviewable.length;

  const view = myGamesViewState({ user, linkedLoading, gamesLoading, linkedCount, games });
  const syncLabel = syncing ? tMyGames(locale, "myGames.syncing") : tMyGames(locale, "myGames.sync");

  // SIG-1093: repertoire trees for the badge lookup. Primitive-stable
  // subscriptions (tree identity + mark ids) so badges recompute only when
  // the games page or a repertoire board changes — never on unrelated
  // board edits or keystrokes.
  const whiteRepTree = useStudioStore((state) => state.boards.find((b) => b.repertoireColor === "white")?.tree ?? null);
  const blackRepTree = useStudioStore((state) => state.boards.find((b) => b.repertoireColor === "black")?.tree ?? null);
  const badges = useMemo(() => {
    const map = new Map<string, string>();
    for (const game of games) {
      const tree = game.color === "white" ? whiteRepTree : blackRepTree;
      const text = deviationBadgeText(
        locale,
        deviationForGame({ pgn: game.pgn, color: game.color, repertoireTree: tree }),
      );
      if (text) {
        map.set(game.rowId ?? game.id, text);
      }
    }
    return map;
  }, [games, whiteRepTree, blackRepTree, locale]);
  const needsRepHint = games.some((game) =>
    game.color === "white" ? whiteRepTree === null : blackRepTree === null,
  );

  return (
    <SidebarPanel
      title={tStudioChrome(locale, "chrome.activity.mygames")}
      meta={games.length > 0 ? games.length : undefined}
      actions={
        user ? (
          <>
            <IconButton
              label={tMyGames(locale, "myGames.stats")}
              size="sm"
              onClick={() => openStudioPanel("myStats")}
            >
              <ChartSpline size={14} />
            </IconButton>
            <IconButton label={syncLabel} size="sm" disabled={syncing || gamesLoading} onClick={handleSync}>
              <RefreshCw size={14} className={syncing ? "animate-spin" : undefined} />
            </IconButton>
          </>
        ) : undefined
      }
      header={
        notice ? (
          <p className="text-caption text-studio-muted">
            {notice.kind === "synced"
              ? notice.count === 1
                ? tMyGames(locale, "myGames.synced.one", { count: notice.count })
                : tMyGames(locale, "myGames.synced.other", { count: notice.count })
              : notice.kind === "review"
                ? tMyGames(locale, "myGames.reviewFailed", { count: notice.count })
                : tMyGames(locale, notice.key === "upstream" ? "myGames.error.upstream" : "myGames.error.unavailable")}
          </p>
        ) : needsRepHint ? (
          <p className="text-caption text-studio-muted">{tRepertoire(locale, "repertoire.deviation.noRepertoireHint")}</p>
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
          <div className="flex flex-wrap items-center gap-1.5 px-2 py-1.5">
            <label className="mr-1 flex cursor-pointer items-center gap-1.5 text-caption text-studio-muted">
              <input
                type="checkbox"
                checked={allSelected}
                disabled={batch !== null || reviewable.length === 0}
                onChange={() => {
                  setSelected(allSelected ? new Set() : new Set(reviewable.map((game) => game.rowId ?? game.id)));
                }}
                aria-label={tMyGames(locale, "myGames.selectAll")}
              />
              {tMyGames(locale, "myGames.selectAll")}
            </label>
            <Button
              variant="secondary"
              size="sm"
              disabled={batch !== null || selectedGames.length === 0}
              onClick={() => startBatch(selectedGames)}
            >
              {tMyGames(locale, "myGames.reviewSelected")}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={batch !== null || unreviewed.length === 0}
              onClick={() => startBatch(unreviewed)}
            >
              {tMyGames(locale, "myGames.reviewAllUnreviewed")}
            </Button>
            {batch ? (
              <>
                <span role="status" className="text-caption tabular-nums text-studio-muted">
                  {tMyGames(locale, "myGames.reviewing", { done: batch.done, total: batch.total })}
                </span>
                <Button variant="ghost" size="sm" onClick={handleCancelBatch}>
                  {tMyGames(locale, "myGames.cancel")}
                </Button>
              </>
            ) : null}
          </div>
          {games.map((game) => {
            const detail = [formatTimeClass(game.timeClass), game.opening].filter(Boolean).join(" · ");
            const rowId = game.rowId ?? null;
            const checked = rowId != null && selected.has(rowId);
            const badge = badges.get(game.rowId ?? game.id) ?? null;
            return (
              <div key={game.id} className="flex items-start gap-1 px-1">
                {rowId != null && game.pgn?.trim() ? (
                  <input
                    type="checkbox"
                    className="mt-2.5 shrink-0"
                    checked={checked}
                    disabled={batch !== null}
                    onChange={() => toggleSelect(rowId)}
                    onClick={(event) => event.stopPropagation()}
                    aria-label={`${game.whiteName} – ${game.blackName}`}
                  />
                ) : (
                  <span className="w-[13px] shrink-0" aria-hidden="true" />
                )}
                <GameOpenRow
                  className="min-w-0 flex-1 px-2 py-1.5 text-left text-dense hover:bg-studio-hover-subtle"
                  onOpen={() => openGame(game)}
                  onOpenNew={() => openGame(game, true)}
                >
                  <span className="grid w-full grid-cols-[44px_1fr_44px_1fr_44px_64px] items-center gap-2">
                    <ResultMark winner={game.winner} />
                    <span className="truncate">{game.whiteName}</span>
                    <span className="text-right text-studio-faint">{game.whiteRating ?? ""}</span>
                    <span className="truncate">{game.blackName}</span>
                    <span className="text-right text-studio-faint">{game.blackRating ?? ""}</span>
                    <span className="truncate text-studio-faint">{formatYearMonth(game.year, game.month)}</span>
                  </span>
                  {detail ? (
                    <span className="mt-0.5 block truncate pl-[52px] text-caption text-studio-faint">{detail}</span>
                  ) : null}
                  {game.userAccuracy != null ? (
                    <span className="mt-0.5 block pl-[52px] text-caption tabular-nums text-studio-accent-text">
                      {Math.round(game.userAccuracy)}
                    </span>
                  ) : null}
                  {badge ? (
                    <span className="mt-0.5 block truncate pl-[52px] text-caption text-studio-muted">{badge}</span>
                  ) : null}
                </GameOpenRow>
              </div>
            );
          })}
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
