// SIG-1089: "My Games" activity sidebar (My Games 3/5). Lists the user's
// imported games (newest first, paged) with a Sync header, using the same
// `SidebarPanel` grain as `BookmarksSidebar`. Local component state only —
// the list is per-user remote data with its own pagination cursor and sync
// lifecycle, so no zustand slice (same rationale as `SearchSidebar`'s hits).
//
// SIG-1090: batch review controls (My Games 4/5). Checkboxes select loaded
// rows; "Review selected" / "Review all unreviewed" run the sequential
// `createReviewQueue` on a one-worker review pool (lite, Threads 1, SIG-1223)
// with the e2e fake seam when enabled. Each finished summary is written back to the 4
// granted columns and patched into local state, so accuracy badges survive
// reload; opening a reviewed row hits the cached result with no second
// analysis (same cache key as the interactive hook).
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChartSpline, RefreshCw } from "lucide-react";
import { formatTimeClass, formatYearMonth } from "@/src/lib/game-date";
import { deviationBadgeText, deviationForGame } from "@/src/lib/my-games/deviation-for-game";
import type { DeviationEvent } from "@/src/chess/repertoire-deviation";
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
import { formatInteger } from "@/src/i18n/format";
import type { SiteLocale } from "@/src/i18n/locale";
import { tMyGames } from "@/src/i18n/my-games-strings";
import { tRepertoire } from "@/src/i18n/repertoire-strings";
import { tPanels } from "@/src/i18n/studio-panel-strings";
import { tStudioChrome } from "@/src/i18n/studio-chrome-strings";
import { createBrowserSupabase } from "@/src/lib/supabase/client";
import { toJson } from "@/src/lib/supabase/database.types";
import { DEFAULT_REVIEW_PRESET } from "@/src/chess/review-engine";
import { createReviewPool } from "@/src/engine/review-pool";
import { resolveBook } from "./review/resolve-book";
import { createE2eFakeReviewEngine, isE2eFakeReviewEnabled } from "./review/e2e-fake-review-engine";
import { selectActiveBoard, useStudioStore } from "@/src/store/studio-store";
import { openBoardPanel, openStudioPanel } from "./dock-api";
import { GameOpenRow } from "./GameOpenRow";
import { ResultMark } from "./ResultMark";
import { PlayerCell, outcomeFor } from "./ui/PlayerCell";
import { Button, IconButton } from "./ui/Button";
import { Badge } from "./ui/Controls";
import { SidebarHint, SidebarPanel } from "./ui/Sidebar";
import { myGamesViewState } from "@/src/lib/my-games/view-state";

type SyncNotice =
  | { kind: "synced"; count: number }
  | { kind: "error"; key: "unavailable" | "upstream" }
  | { kind: "review"; count: number }
  | null;

type BatchState = { done: number; total: number };

export type MyGamesRowFix = {
  label: string;
  kind: "user_deviation" | "opponent_gap";
  event: DeviationEvent;
};

export function MyGamesRow({
  game,
  locale,
  checked,
  disabled,
  badge,
  fix,
  repMissing,
  onToggleSelect,
  onOpen,
  onOpenNew,
  onFix,
}: {
  game: PlayerGame;
  locale: SiteLocale;
  checked: boolean;
  disabled: boolean;
  badge: string | null;
  fix: MyGamesRowFix | null;
  repMissing: boolean;
  onToggleSelect: (rowId: string) => void;
  onOpen: () => void;
  onOpenNew: () => void;
  onFix: () => void;
}) {
  const rowId = game.rowId ?? null;
  const opponentSide = game.color === "white" ? "black" : "white";
  const opponentName = opponentSide === "white" ? game.whiteName : game.blackName;
  const opponentRating = (opponentSide === "white" ? game.whiteRating : game.blackRating) ?? null;
  const colorLabel = tMyGames(locale, game.color === "white" ? "myGames.playedWhite" : "myGames.playedBlack");
  const dateText = formatYearMonth(game.year, game.month);
  const detail = [formatTimeClass(game.timeClass), game.opening].filter(Boolean).join(" · ");
  const roundedAccuracy = game.userAccuracy != null ? Math.round(game.userAccuracy) : null;
  const formattedAccuracy = roundedAccuracy != null ? formatInteger(locale, roundedAccuracy) : null;
  const accuracyText = formattedAccuracy != null ? `${formattedAccuracy}%` : null;
  const accuracyLabel =
    formattedAccuracy != null ? tMyGames(locale, "myGames.rowAccuracy", { value: formattedAccuracy }) : undefined;

  return (
    <div className="flex items-start gap-1 px-1">
      {rowId != null && game.pgn?.trim() ? (
        <input
          type="checkbox"
          className="mt-2.5 shrink-0"
          checked={checked}
          disabled={disabled}
          onChange={() => onToggleSelect(rowId)}
          onClick={(event) => event.stopPropagation()}
          aria-label={`${game.whiteName} – ${game.blackName}`}
        />
      ) : (
        <span className="w-[13px] shrink-0" aria-hidden="true" />
      )}
      <div className="min-w-0 flex-1 rounded-md hover:bg-studio-hover">
        <GameOpenRow
          className="flex w-full flex-col px-2 py-1.5 text-left text-dense"
          onOpen={onOpen}
          onOpenNew={onOpenNew}
        >
          <span className="flex w-full items-center gap-1.5">
            <span
              role="img"
              aria-label={colorLabel}
              title={colorLabel}
              className={`size-2.5 shrink-0 rounded-full ring-1 ring-studio-border-strong ${
                game.color === "white"
                  ? "bg-studio-piece-white text-studio-piece-white-fg"
                  : "bg-studio-piece-black text-studio-piece-black-fg"
              }`}
            />
            <span className="min-w-0 flex-1">
              <PlayerCell
                name={opponentName}
                rating={opponentRating}
                outcome={outcomeFor(game.winner, opponentSide)}
              />
            </span>
            <ResultMark winner={game.winner} />
            {dateText ? (
              <span className="shrink-0 tabular-nums text-caption text-studio-faint">
                {dateText}
              </span>
            ) : null}
          </span>
          {detail || accuracyText ? (
            <span className="mt-0.5 flex w-full items-center justify-between gap-2">
              <span className="min-w-0 flex-1 truncate text-caption text-studio-faint">
                {detail}
              </span>
              {accuracyText ? (
                <Badge
                  tone="accent"
                  title={accuracyLabel}
                  aria-label={accuracyLabel}
                  className="tabular-nums"
                >
                  {accuracyText}
                </Badge>
              ) : null}
            </span>
          ) : null}
          {badge ? (
            <span className="mt-0.5 block w-full truncate text-caption text-studio-muted">
              {badge}
            </span>
          ) : null}
        </GameOpenRow>
        {fix ? (
          <div className="px-2 pb-1.5">
            <button
              type="button"
              title={repMissing ? tRepertoire(locale, "repertoire.deviation.noBoard") : fix.label}
              aria-label={fix.label}
              disabled={repMissing}
              onClick={onFix}
              className="text-caption font-medium text-studio-accent-text hover:underline disabled:cursor-default disabled:text-studio-disabled disabled:hover:no-underline"
            >
              {fix.label}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function MyGamesSidebar() {
  const locale = useStudioStore((state) => state.settings.locale);
  const user = useStudioStore((state) => state.user);
  const importPlayerGame = useStudioStore((state) => state.importPlayerGame);
  const setStatus = useStudioStore((state) => state.setStatus);
  const openSettings = useStudioStore((state) => state.openSettings);
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
    // Same seam shape as `useGameReview`: the e2e fake never starts a worker.
    // SIG-1223: the batch uses the review engine (lite, Threads 1) with a
    // single worker, so it stays out of the way of interactive analysis and of
    // an interactive review; nothing is shared with the analysis engine.
    const useFake = isE2eFakeReviewEnabled();
    const pool = useFake ? null : createReviewPool({ size: 1, isCancelled });
    const engine = pool ?? createE2eFakeReviewEngine({ delayMs: 40, isCancelled });
    // Batch preset is fixed (no picker in batch UI); the same preset feeds
    // the cache key, so the interactive opener reuses these rows.
    const queue = createReviewQueue({
      games: queueGames,
      preset: DEFAULT_REVIEW_PRESET,
      engine,
      book: useFake ? undefined : (startFen, ucis) => resolveBook(startFen, ucis),
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
      release: () => pool?.dispose(),
    };
    setNotice(null);
    setBatch({ done: 0, total: queueGames.length });
    void queue
      .start()
      .catch(() => undefined)
      .finally(() => {
        batchRef.current = null;
        pool?.dispose();
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
  // SIG-1094: the same memo also keeps the per-row event for the one-click
  // fix buttons (computed once per row, never called twice).
  const whiteRepTree = useStudioStore((state) => state.boards.find((b) => b.repertoireColor === "white")?.tree ?? null);
  const blackRepTree = useStudioStore((state) => state.boards.find((b) => b.repertoireColor === "black")?.tree ?? null);
  const whiteRepBoardId = useStudioStore((state) => state.boards.find((b) => b.repertoireColor === "white")?.id ?? null);
  const blackRepBoardId = useStudioStore((state) => state.boards.find((b) => b.repertoireColor === "black")?.id ?? null);
  const trainDeviationLine = useStudioStore((state) => state.trainDeviationLine);
  const addGapToRepertoire = useStudioStore((state) => state.addGapToRepertoire);
  const rowBadges = useMemo(() => {
    const map = new Map<string, { text: string; fix: { label: string; kind: "user_deviation" | "opponent_gap"; event: DeviationEvent } | null }>();
    for (const game of games) {
      const tree = game.color === "white" ? whiteRepTree : blackRepTree;
      const event = deviationForGame({ pgn: game.pgn, color: game.color, repertoireTree: tree });
      const text = deviationBadgeText(locale, event);
      if (!text) {
        continue;
      }
      const fix =
        event && (event.kind === "user_deviation" || event.kind === "opponent_gap")
          ? {
              label:
                event.kind === "user_deviation"
                  ? tRepertoire(locale, "repertoire.deviation.trainLine")
                  : tRepertoire(locale, "repertoire.deviation.addGap"),
              kind: event.kind,
              event,
            }
          : null;
      map.set(game.rowId ?? game.id, { text, fix });
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
      {view === "linkAccount" ? (
        <>
          <SidebarHint>{tMyGames(locale, "myGames.linkAccountHint")}</SidebarHint>
          <div className="px-2 pb-3">
            <Button variant="secondary" size="sm" onClick={() => openSettings("linkedAccounts")}>
              {tMyGames(locale, "myGames.openLinkedAccounts")}
            </Button>
          </div>
        </>
      ) : null}
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
            const rowId = game.rowId ?? null;
            const checked = rowId != null && selected.has(rowId);
            const row = rowBadges.get(game.rowId ?? game.id) ?? null;
            const badge = row?.text ?? null;
            const fix = row?.fix ?? null;
            const repMissing =
              game.color === "white" ? whiteRepBoardId === null : blackRepBoardId === null;
            return (
              <MyGamesRow
                key={game.id}
                game={game}
                locale={locale}
                checked={checked}
                disabled={batch !== null}
                badge={badge}
                fix={fix}
                repMissing={repMissing}
                onToggleSelect={toggleSelect}
                onOpen={() => openGame(game)}
                onOpenNew={() => openGame(game, true)}
                onFix={() => {
                  if (!fix) {
                    return;
                  }
                  if (fix.kind === "user_deviation") {
                    trainDeviationLine(fix.event, game.color);
                  } else {
                    addGapToRepertoire(fix.event, game.color);
                  }
                }}
              />
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
