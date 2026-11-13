"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { formatDateTime } from "@/src/i18n/format";
import { tLive } from "@/src/i18n/live-strings";
import type { SiteLocale } from "@/src/i18n/locale";
import { fetchTour } from "@/src/lib/live/lichess-broadcast";
import type { BroadcastRoundSummary, LiveGame } from "@/src/lib/live/types";
import { Button } from "@/src/studio/ui/Button";
import { useIsMobile } from "../use-is-mobile";
import { LiveConnectionIndicator } from "./LiveConnectionIndicator";
import { LiveBoardGrid } from "./LiveBoardGrid";
import { LiveGamesTable, orderedGames } from "./LiveGamesTable";
import { enqueueLiveRequest, useLiveStore } from "./live-store";
import { useLiveRound, useLiveRoundInfo } from "./use-live";
import { pickRoundForTour, useLiveTour } from "./use-live-tour";

const SKELETON_ROWS = 8;
/** SIG-1313: boards opened for a round that has none open (boards 1, 2 and 3, in board order). */
export const AUTO_OPEN_BOARDS = 3;

const SELECT_CLASS =
  "h-7 min-w-0 max-w-full rounded-md border border-studio-border bg-studio-panel px-2 text-dense text-studio-fg disabled:opacity-60";

/** Round selector label: name plus its state (live / finished / start date of a future round). */
export function roundOptionLabel(round: BroadcastRoundSummary, locale: SiteLocale): string {
  const state = round.ongoing
    ? tLive(locale, "live.round.state.live")
    : round.finished
      ? tLive(locale, "live.round.state.finished")
      : round.startsAt !== null
        ? tLive(locale, "live.round.state.upcoming", { date: formatDateTime(locale, round.startsAt) })
        : null;
  return state ? `${round.name} — ${state}` : round.name;
}

/**
 * Second bar: the focused game's opening (ECO code + name, once the PGN is known). Each card already has
 * the names, the result and its own Studio button, so the bar doesn't repeat them.
 */
function FollowedHeader({ game, locale }: { game: LiveGame | undefined; locale: SiteLocale }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-dense text-studio-muted" data-live-followed="">
      {game ? (
        game.eco || game.opening ? (
          <span className="min-w-0 truncate text-studio-fg" title={tLive(locale, "live.round.opening")} data-live-opening="">
            {game.eco ? <span className="font-semibold tabular-nums">{game.eco}</span> : null}
            {game.eco && game.opening ? " · " : null}
            {game.opening}
          </span>
        ) : null
      ) : (
        <span>{tLive(locale, "live.round.noFollowed")}</span>
      )}
    </div>
  );
}

function Skeleton({ label }: { label: string }) {
  return (
    <ul aria-busy="true" aria-label={label} className="flex flex-col gap-1 p-3">
      {Array.from({ length: SKELETON_ROWS }, (_, i) => (
        <li key={i} data-testid="live-skeleton-row" className="h-8 animate-pulse rounded bg-studio-hover-strong" />
      ))}
    </ul>
  );
}

export function LiveRoundView({
  roundId,
  locale,
  onBack,
}: {
  roundId: string;
  locale: SiteLocale;
  onBack: () => void;
}) {
  const games = useLiveRound(roundId);
  const info = useLiveRoundInfo(roundId);
  const connection = useLiveStore((s) => s.connection);
  const setTableRound = useLiveStore((s) => s.setTableRound);
  const followed = useLiveStore((s) => {
    const ref = s.focusedGame;
    return ref ? s.gamesByRound[ref.roundId]?.[ref.gameId] : undefined;
  });
  const tour = useLiveTour(info?.tour.id ?? null);
  const [switching, setSwitching] = useState(false);
  const [openedAt] = useState(() => Date.now());

  // The tour response lists every round; the snapshot's own round is fresher for the current one.
  const rounds = (() => {
    const list = tour?.rounds ?? [];
    if (!info) {
      return list;
    }
    return list.some((r) => r.id === info.round.id)
      ? list.map((r) => (r.id === info.round.id ? info.round : r))
      : [...list, info.round];
  })();

  const switchTour = async (tourId: string) => {
    if (!info || tourId === info.tour.id) {
      return;
    }
    setSwitching(true);
    try {
      const next = await enqueueLiveRequest((signal) => fetchTour(tourId, signal));
      const target = next ? pickRoundForTour(next) : null;
      if (target) {
        setTableRound(target);
      }
    } catch {
      // keep the current tournament; the connection indicator shows rate limits
    } finally {
      setSwitching(false);
    }
  };

  const retry = () => {
    setTableRound(null);
    setTableRound(roundId);
  };

  const groupTours = info?.group?.tours ?? [];
  const notStarted =
    info !== undefined &&
    !info.round.ongoing &&
    !info.round.finished &&
    info.round.startsAt !== null &&
    info.round.startsAt > openedAt;
  const hasBoards = useLiveStore((s) => s.openBoards.length > 0);
  const gameCount = games ? Object.keys(games).length : 0;

  // SIG-1313: boards 1-3 of the round (finished or not), board 1 focused. Desktop only: mobile shows a single
  // board the user picks. It runs once per round, when the round's first snapshot is in, so closing or clearing
  // boards never brings them back.
  //  - First round of the view: only when no boards are open, so a URL that restored `games=` is left as it is.
  //  - Switching round (round or tournament selector): the grid follows the new round, replacing the boards
  //    of the previous one.
  const mobile = useIsMobile();
  const openBoard = useLiveStore((s) => s.openBoard);
  const closeAllBoards = useLiveStore((s) => s.closeAllBoards);
  const autoOpenedRound = useRef<string | null>(null);
  useEffect(() => {
    if (mobile || !info || !games || autoOpenedRound.current === roundId) {
      return;
    }
    const first = orderedGames(games).slice(0, AUTO_OPEN_BOARDS);
    if (first.length === 0) {
      return;
    }
    const switched = autoOpenedRound.current !== null;
    autoOpenedRound.current = roundId;
    if (switched) {
      closeAllBoards();
    } else if (useLiveStore.getState().openBoards.length > 0) {
      return;
    }
    first.forEach((g, index) => openBoard({ roundId, gameId: g.id }, { focus: index === 0 }));
  }, [mobile, info, games, roundId, openBoard, closeAllBoards]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-studio-bg" data-live-round={roundId}>
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-studio-border-subtle px-3 py-2">
        <Button size="sm" variant="ghost" onClick={onBack}>
          <ArrowLeft size={14} aria-hidden="true" />
          {tLive(locale, "live.round.back")}
        </Button>
        {info && groupTours.length > 1 ? (
          <select
            aria-label={tLive(locale, "live.round.tournament")}
            className={SELECT_CLASS}
            value={info.tour.id}
            disabled={switching}
            onChange={(event) => void switchTour(event.target.value)}
          >
            {groupTours.some((t) => t.id === info.tour.id) ? null : <option value={info.tour.id}>{info.tour.name}</option>}
            {groupTours.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        ) : info ? (
          <span className="min-w-0 truncate text-dense font-medium text-studio-fg">{info.tour.name}</span>
        ) : null}
        {info ? (
          <select
            aria-label={tLive(locale, "live.round.round")}
            className={SELECT_CLASS}
            value={roundId}
            onChange={(event) => setTableRound(event.target.value)}
          >
            {rounds.map((r) => (
              <option key={r.id} value={r.id}>
                {roundOptionLabel(r, locale)}
              </option>
            ))}
          </select>
        ) : null}
        <a
          href={info?.round.url ?? "https://lichess.org/broadcast"}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto inline-flex items-center gap-1 text-caption text-studio-muted hover:text-studio-fg"
        >
          {tLive(locale, "live.poweredBy")}
          <ExternalLink size={12} aria-hidden="true" />
        </a>
      </div>
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-studio-border-subtle px-3 py-1.5">
        <FollowedHeader game={followed} locale={locale} />
        <LiveConnectionIndicator />
      </div>
      {notStarted && info?.round.startsAt != null ? (
        <p role="note" className="shrink-0 px-3 py-1.5 text-dense text-studio-muted">
          {tLive(locale, "live.round.startsIn", { date: formatDateTime(locale, info.round.startsAt) })}
        </p>
      ) : null}
      {games === undefined && connection === "error" ? (
        <div role="alert" className="grid place-items-center gap-3 py-12 text-center text-sm text-studio-muted">
          <p>{tLive(locale, "live.round.error")}</p>
          <Button onClick={retry}>{tLive(locale, "live.round.retry")}</Button>
        </div>
      ) : games === undefined ? (
        <Skeleton label={tLive(locale, "live.round.loading")} />
      ) : gameCount === 0 ? (
        <p className="p-4 text-sm text-studio-muted">
          {tLive(locale, notStarted ? "live.round.notStarted" : "live.round.empty")}
        </p>
      ) : (
        // Boards sit beside the table (lg+) or above it (narrow), so a row click always works and the
        // table stays the way to add boards. Each pane scrolls on its own.
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          {hasBoards ? (
            <div className="max-h-[65%] min-h-0 shrink-0 overflow-auto border-b border-studio-border-subtle lg:max-h-none lg:flex-1 lg:border-b-0 lg:border-r">
              <LiveBoardGrid locale={locale} />
            </div>
          ) : null}
          {/* 27–30rem fits the six columns of the games table without sideways scrolling. */}
          <div className={`flex min-h-48 min-w-0 flex-1 flex-col ${hasBoards ? "lg:w-[27rem] lg:flex-none xl:w-[30rem]" : ""}`}>
            <LiveGamesTable key={roundId} roundId={roundId} locale={locale} />
          </div>
        </div>
      )}
    </div>
  );
}
