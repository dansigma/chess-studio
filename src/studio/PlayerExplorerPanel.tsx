"use client";

import { useMemo } from "react";
import type { PlayerColorFilter, PlayerGame, PlayerHit, PlayerResultFilter } from "@/src/lib/player-types";
import { bookmarkKey } from "@/src/lib/player-bookmarks";
import { tPanels } from "@/src/i18n/studio-panel-strings.ts";
import { formatGameCount } from "@/src/i18n/format.ts";
import { playerMoveStatsFromIndex, buildPlayerIndex, filterPlayerGames, playerGamesFromIndex } from "@/src/lib/player-stats";
import { useStudioStore } from "@/src/store/studio-store";
import { formatSan, sideFromFen } from "@/src/chess/move-notation";
import { BookmarkStar } from "./PlayerHitRow";
import { tSidebar } from "@/src/i18n/studio-sidebar-strings";
import { tStudioChrome } from "@/src/i18n/studio-chrome-strings";
import { localPlayerGames } from "@/src/lib/players/local-files";
import { openPlayerPanel, updatePlayerPanel } from "./dock-api";
import { parsePlayerPanelParams } from "./player-panel-params";
import { PlayerGameRows } from "./PlayerGamesPanel";
import { usePlayerSearch } from "./library/use-player-search";
import { useLegacyPlayerGames, usePlayerGames } from "./use-player-games";
import { ResultBar } from "./ui/ResultBar";
import { useLockablePosition } from "./use-lockable-position";
import { PositionLockButton } from "./PositionLockButton";

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded px-2 py-0.5 text-caption ${
        active ? "bg-studio-hover-strong text-studio-fg" : "text-studio-faint hover:bg-studio-hover-subtle hover:text-studio-fg"
      }`}
    >
      {children}
    </button>
  );
}

export function PlayerExplorerPanel({ params }: { params?: unknown }) {
  const persisted = parsePlayerPanelParams(params);
  const player = useStudioStore((state) => state.playerProfile);
  const color = useStudioStore((state) => state.playerColorFilter);
  const result = useStudioStore((state) => state.playerResultFilter);
  const setColor = useStudioStore((state) => state.setPlayerColorFilter);
  const setResult = useStudioStore((state) => state.setPlayerResultFilter);
  const data = useLegacyPlayerGames(player ?? persisted.player);
  const current = player ? { player, color, result } : persisted;

  return (
    <PlayerPositionView
      {...current}
      {...data}
      panelId="player-explorer"
      setColor={(value) => {
        if (player) setColor(value);
        updatePlayerPanel("player-explorer", { ...current, color: value });
      }}
      setResult={(value) => {
        if (player) setResult(value);
        updatePlayerPanel("player-explorer", { ...current, result: value });
      }}
    />
  );
}

export function ComparisonPlayerPanel({ panelId, params }: { panelId: string; params?: unknown }) {
  const current = parsePlayerPanelParams(params);
  const { player } = current;
  const databases = useStudioStore((state) => state.files.databases);
  const localName = player?.inDatabases ? player.username : undefined;
  const local = useMemo(() => localName ? localPlayerGames(databases, localName) : [], [databases, localName]);
  const data = usePlayerGames(local.length > 0 ? null : player);

  if (!player) {
    return (
      <FindPlayer onSelect={(selected) => updatePlayerPanel(panelId, { ...current, player: selected })} />
    );
  }

  return (
    <PlayerPositionView
      {...current}
      {...data}
      games={local.length > 0 ? local : data.games}
      panelId={panelId}
      setColor={(color) => updatePlayerPanel(panelId, { ...current, color })}
      setResult={(result) => updatePlayerPanel(panelId, { ...current, result })}
    />
  );
}

function FindPlayer({ onSelect }: { onSelect: (player: PlayerHit) => void }) {
  const locale = useStudioStore((state) => state.settings.locale);
  const { query, setQuery, hits, loading, searching, failedSources } = usePlayerSearch({ includeXd: true });
  const placeholder = tPanels(locale, "players.searchPlaceholder");
  return (
    <div className="flex h-full flex-col bg-studio-panel p-2 text-body text-studio-fg">
      <input
        aria-label={placeholder}
        placeholder={placeholder}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className="w-full rounded border border-studio-border-subtle bg-studio-panel px-2 py-1"
      />
      <div className="min-h-0 overflow-auto" aria-busy={loading || undefined}>
        {loading ? <p role="status" className="p-2 text-studio-faint">{tStudioChrome(locale, "chrome.players.searching")}</p> : null}
        {failedSources.length > 0 ? (
          <p role="status" className="p-2 text-caption text-studio-warning-fg">
            {tPanels(locale, "players.searchUnavailable", {
              source: failedSources.map((source) => tPanels(locale, `explorer.source.${source}` as "explorer.source.xadrez-digital")).join(", "),
            })}
          </p>
        ) : null}
        {hits.map((hit) => (
          <button
            key={hit.id}
            type="button"
            onClick={() => onSelect(hit)}
            className="block w-full rounded px-2 py-1.5 text-left hover:bg-studio-hover"
          >
            <span className="block truncate">{hit.displayName}</span>
            <span className="block truncate text-caption text-studio-faint">{hit.subtitle}</span>
          </button>
        ))}
        {searching && !loading && hits.length === 0 ? (
          <p className="p-2 text-studio-faint">{tStudioChrome(locale, "chrome.players.none")}</p>
        ) : null}
      </div>
    </div>
  );
}

function PlayerPositionView({
  panelId, player, games, loading, notice, color, result, setColor, setResult,
}: {
  panelId: string;
  player: PlayerHit | null;
  games: PlayerGame[];
  loading: boolean;
  notice: string | null;
  color: PlayerColorFilter;
  result: PlayerResultFilter;
  setColor: (color: PlayerColorFilter) => void;
  setResult: (result: PlayerResultFilter) => void;
}) {
  const moveNotation = useStudioStore((state) => state.settings.moveNotation);
  const locale = useStudioStore((state) => state.settings.locale);
  const position = useLockablePosition();
  const fen = position.fen;
  const side = sideFromFen(fen);
  const togglePlayerBookmark = useStudioStore((state) => state.togglePlayerBookmark);
  const bookmarked = useStudioStore((state) =>
    player ? state.bookmarks.some((item) => bookmarkKey(item) === bookmarkKey(player)) : false,
  );

  const visible = useMemo(() => filterPlayerGames(games, color, result), [games, color, result]);
  const index = useMemo(() => buildPlayerIndex(visible), [visible]);
  const moves = useMemo(() => playerMoveStatsFromIndex(index, fen, true), [index, fen]);
  const reached = useMemo(() => playerGamesFromIndex(index, fen), [index, fen]);
  const maxGames = Math.max(1, ...moves.map((row) => row.games));

  if (!player) {
    return (
      <div className="flex h-full items-center justify-center bg-studio-panel text-sm text-studio-faint">
        {tPanels(locale, "players.searchOpenings")}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-studio-panel text-body text-studio-fg">
      <div className="flex flex-wrap items-center gap-1 border-b border-studio-border-subtle px-2 py-1.5">
        {(["all", "white", "black"] as const).map((value) => (
          <Chip key={value} active={color === value} onClick={() => setColor(value)}>
            {value === "all"
              ? tPanels(locale, "players.filter.all")
              : value === "white"
                ? tPanels(locale, "players.filter.white")
                : tPanels(locale, "players.filter.black")}
          </Chip>
        ))}
        <span className="mx-1 h-4 w-px bg-studio-hover" />
        {(["all", "win", "loss", "draw"] as const).map((value) => (
          <Chip key={value} active={result === value} onClick={() => setResult(value)}>
            {value === "all"
              ? tPanels(locale, "players.filter.all")
              : value === "win"
                ? tPanels(locale, "players.filter.won")
                : value === "loss"
                  ? tPanels(locale, "players.filter.lost")
                  : tPanels(locale, "players.filter.draw")}
          </Chip>
        ))}
        <span className="ml-auto flex items-center gap-1 pr-1 text-caption text-studio-faint">
          <span>
            {reached.length === 1
              ? tPanels(locale, "players.count.one", { count: reached.length })
              : tPanels(locale, "players.count.other", { count: reached.length })}
          </span>
          <PositionLockButton position={position} locale={locale} />
          {player.source === "xadrez-digital" ? null : (
            <BookmarkStar
              active={bookmarked}
              title={tSidebar(locale, bookmarked ? "sidebar.player.removeBookmark" : "sidebar.player.bookmark")}
              onClick={() => togglePlayerBookmark(player)}
            />
          )}
        </span>
      </div>
      <div className="border-b border-studio-border-subtle px-2 py-1.5">
        <button
          type="button"
          className="rounded px-2 py-1 text-caption text-studio-accent-text hover:bg-studio-hover"
          onClick={() => openPlayerPanel(panelId, { player, color, result })}
        >
          {tPanels(locale, "players.compare")}
        </button>
      </div>
      {notice ? (
        <div className="bg-studio-warning-bg px-3 py-1.5 text-caption text-studio-warning-fg">{notice}</div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto" aria-busy={loading || undefined}>
        <div className="grid grid-cols-[minmax(34px,1fr)_minmax(34px,1fr)_minmax(60px,2fr)] gap-3 border-b border-studio-border-subtle px-3 py-1.5 text-caption uppercase tracking-wider text-studio-faint">
          <span>{tPanels(locale, "players.column.move")}</span>
          <span className="truncate">{tPanels(locale, "players.column.games")}</span>
          <span className="truncate">{tPanels(locale, "players.column.split")}</span>
        </div>
        {loading ? (
          <div className="px-3 py-4 text-studio-faint" role="status">
            {tPanels(locale, "players.loading")}
          </div>
        ) : null}
        {!loading && moves.length === 0 ? (
          <div className="px-3 py-4 text-studio-faint">{tPanels(locale, "players.rowEmpty")}</div>
        ) : null}
        {moves.map((row) => {
          return (
            <button
              key={row.uci}
              disabled={!position.canPlay}
              title={position.canPlay ? undefined : tPanels(locale, "position.lockedOutside")}
              className="grid w-full grid-cols-[minmax(34px,1fr)_minmax(34px,1fr)_minmax(60px,2fr)] items-center gap-3 px-3 py-1.5 text-left hover:bg-studio-hover disabled:cursor-default disabled:opacity-60 disabled:hover:bg-transparent"
              onClick={() => {
                const from = row.uci.slice(0, 2);
                const to = row.uci.slice(2, 4);
                const promotion = row.uci[4];
                position.playUci(from, to, promotion);
              }}
            >
              <span className="font-medium">{formatSan(row.san, moveNotation, side)}</span>
              <span className="flex items-center gap-2">
                <span className="text-right tabular-nums text-studio-fg">{formatGameCount(locale, row.games)}</span>
                <span className="h-1 flex-1 overflow-hidden rounded-full bg-studio-track">
                  <span
                    className="block h-full rounded-full bg-studio-accent"
                    style={{ width: `${(row.games / maxGames) * 100}%` }}
                  />
                </span>
              </span>
              <ResultBar
                white={row.white}
                draws={row.draws}
                black={row.black}
                perspective="player"
                label={tPanels(locale, "players.moveResults", { win: row.white, draw: row.draws, loss: row.black })}
              />
            </button>
          );
        })}
        <h3 className="border-y border-studio-border-subtle px-3 py-1.5 text-caption font-medium">
          {tPanels(locale, "players.positionGames")}
        </h3>
        <PlayerGameRows games={reached} />
        {!loading && reached.length === 0 ? (
          <div className="px-3 py-4 text-studio-faint">{tPanels(locale, "players.positionGamesEmpty")}</div>
        ) : null}
      </div>
    </div>
  );
}
