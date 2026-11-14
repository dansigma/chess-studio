"use client";

// SIG-1341: the dossier's "Openings" area. Lists the player's main openings
// for the chosen side as compact two-line cards (the second line reserves two
// slots for later issues) and shows the move-by-move tree below. Clicking a
// card selects that group for the dossier's games area; "Prepare line" opens
// any line in the Studio oriented to the user's side.
import { useMemo, useState, type KeyboardEvent } from "react";
import { formatInteger } from "@/src/i18n/format";
import type { SiteLocale } from "@/src/i18n/locale";
import { tLibrary } from "@/src/i18n/library-strings";
import { tMyGames } from "@/src/i18n/my-games-strings";
import { localizeOpeningName } from "@/src/lib/opening-names";
import { buildOpeningTree, worstLines, type OpeningTreeGame } from "@/src/lib/my-games/opening-tree";
import {
  openingFilterToTreeFilters,
  openingRows,
  timeClassOptions,
  type OpeningUiFilters,
} from "@/src/lib/my-games/opening-rows";
import type { OpeningSort } from "@/src/lib/my-games/stats";
import type { PlayerGame } from "@/src/lib/player-types";
import { dossierOpenings, type DossierOpeningRow } from "@/src/lib/prep/dossier-openings";
import { sanMovesForGame } from "@/src/lib/prep/game-sans";
import { useStudioStore } from "@/src/store/studio-store";
import { OpeningLinesTree } from "../../stats/OpeningLinesTree";
import { EcoBadge } from "../../ui/EcoBadge";
import { Panel } from "../../ui/Panel";
import { DossierOpeningMine } from "./DossierOpeningMine";
import { DossierOpeningStatus } from "./DossierOpeningStatus";
import { DossierOpeningsNotice } from "./DossierOpeningsNotice";
import { DossierRepertoireGaps } from "./DossierRepertoireGaps";
import { useDossierStore } from "./dossier-store";
import { prepareLine } from "./prepare-line";

const MIN_GAMES_OPTIONS = [1, 3, 5, 10] as const;

/** Same order as `sortOpeningResults`: score first when asked, else games, ties by key. */
function sortRows(rows: readonly DossierOpeningRow[], sort: OpeningSort): DossierOpeningRow[] {
  return [...rows].sort((a, b) => {
    if (sort === "score" && a.scorePct !== b.scorePct) {
      return b.scorePct - a.scorePct;
    }
    if (a.games !== b.games) {
      return b.games - a.games;
    }
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });
}

function openingName(row: DossierOpeningRow, locale: SiteLocale): string {
  const name = row.opening ?? row.eco ?? row.key;
  return localizeOpeningName(name, locale, row.eco);
}

function OpeningCard({
  row,
  locale,
  opponentColor,
  selected,
  onToggle,
}: {
  row: DossierOpeningRow;
  locale: SiteLocale;
  opponentColor: "white" | "black";
  selected: boolean;
  onToggle: () => void;
}) {
  const name = openingName(row, locale);
  const lastYear =
    row.lastYear === null ? null : tLibrary(locale, "library.dossier.lastPlayed", { year: row.lastYear });
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    // Only the card itself reacts; keys pressed on the nested "Prepare line"
    // button (or a later slot) keep their own behaviour.
    if (event.target !== event.currentTarget) {
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onToggle();
    }
  }
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={name}
      aria-pressed={selected}
      data-testid="dossier-opening-card"
      data-key={row.key}
      onClick={onToggle}
      onKeyDown={onKeyDown}
      className={`flex min-w-0 cursor-pointer flex-col gap-1 rounded border p-1.5 text-left ${
        selected
          ? "border-studio-accent bg-studio-accent-soft"
          : "border-studio-border-subtle hover:border-studio-border-strong hover:bg-studio-hover/40"
      }`}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-dense text-studio-fg">
        <EcoBadge code={row.eco} opening={row.opening} />
        <span className="min-w-0 flex-1 truncate" title={name}>
          {name}
        </span>
        <span className="shrink-0 tabular-nums text-studio-muted" title={tMyGames(locale, "myGames.statsGames")}>
          {formatInteger(locale, row.games)}
        </span>
        <span className="flex shrink-0 items-center gap-1" title={`${formatInteger(locale, row.sharePct)}%`}>
          <span aria-hidden className="h-1.5 w-10 overflow-hidden rounded bg-studio-hover-strong">
            <span
              className="block h-full rounded bg-studio-accent"
              style={{ width: `${Math.max(0, Math.min(100, row.sharePct))}%` }}
            />
          </span>
          <span className="text-caption tabular-nums text-studio-muted">
            {formatInteger(locale, row.sharePct)}%
          </span>
        </span>
        <span className="shrink-0 text-caption tabular-nums text-studio-muted" title={tMyGames(locale, "myGames.statsScore")}>
          {formatInteger(locale, row.scorePct)}%
        </span>
        {row.lastYear === null || lastYear === null ? null : (
          <span className="shrink-0 text-caption tabular-nums text-studio-faint" title={lastYear}>
            {row.lastYear}
          </span>
        )}
      </div>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <DossierOpeningStatus row={row} opponentColor={opponentColor} />
          <DossierOpeningMine row={row} opponentColor={opponentColor} />
        </div>
        <button
          type="button"
          data-testid="dossier-opening-prepare"
          disabled={row.line.length === 0}
          onClick={(event) => {
            event.stopPropagation();
            prepareLine(row.line, opponentColor);
          }}
          className="shrink-0 rounded px-1.5 py-0.5 text-caption font-medium text-studio-accent-text hover:bg-studio-hover disabled:cursor-default disabled:text-studio-disabled"
        >
          {tLibrary(locale, "library.dossier.prepareLine")}
        </button>
      </div>
    </div>
  );
}

export function DossierOpenings({ games }: { games: PlayerGame[] }) {
  const locale = useStudioStore((state) => state.settings.locale);
  const filters = useDossierStore((state) => state.filters);
  const selectedOpening = useDossierStore((state) => state.selectedOpening);
  const selectOpening = useDossierStore((state) => state.selectOpening);
  const clearOpening = useDossierStore((state) => state.clearOpening);
  const [colorTab, setColorTab] = useState<"white" | "black">("white");
  const [sort, setSort] = useState<OpeningSort>("games");
  const [minGames, setMinGames] = useState(1);
  const [uiFilters, setUiFilters] = useState<OpeningUiFilters>({
    timeClass: "all",
    ratedOnly: false,
    preset: "all",
  });
  const [expandedKeys, setExpandedKeys] = useState<ReadonlySet<string>>(new Set());

  // The dossier's Cor filter wins when it is not "all"; otherwise the local
  // Brancas/Pretas tabs choose the side (same rule as My Stats).
  const opponentColor = filters.color === "all" ? colorTab : filters.color;
  const rows = useMemo(
    () => sortRows(dossierOpenings(games, opponentColor, { minGames }), sort),
    [games, opponentColor, minGames, sort],
  );

  const timeClasses = useMemo(() => timeClassOptions(games), [games]);
  // The tree follows the same side and keeps its own (separate) filters.
  const treeGames = useMemo<OpeningTreeGame[]>(
    () =>
      games.flatMap((game) => {
        const sans = sanMovesForGame(game);
        if (sans.length === 0) {
          return [];
        }
        return [
          {
            sans,
            color: game.color,
            result: game.playerResult,
            playedAt: game.playedAt,
            accuracy: null,
            timeClass: game.timeClass ?? null,
            rated: game.rated ?? null,
          },
        ];
      }),
    [games],
  );
  /* eslint-disable react-hooks/purity -- `now` is the memo's intentional clock read (same grain as MyStatsPanel). */
  const treeRoot = useMemo(() => {
    const now = Date.now();
    return buildOpeningTree(treeGames, {
      color: opponentColor,
      now,
      filters: openingFilterToTreeFilters(uiFilters, now),
    });
  }, [treeGames, opponentColor, uiFilters]);
  /* eslint-enable react-hooks/purity */
  const worstKeys = useMemo(
    () => new Set(worstLines(treeRoot).map((line) => line.path.join(" "))),
    [treeRoot],
  );
  const lineRows = useMemo(() => openingRows(treeRoot, expandedKeys, worstKeys), [treeRoot, expandedKeys, worstKeys]);

  function toggle(row: DossierOpeningRow): void {
    if (selectedOpening === row.key) {
      clearOpening();
    } else {
      selectOpening(row.key, row.line);
    }
  }

  function resetTree(): void {
    setExpandedKeys(new Set());
  }

  return (
    <Panel
      as="section"
      aria-label={tLibrary(locale, "library.dossier.openings")}
      className="flex min-w-0 flex-col gap-2 p-2"
      data-testid="dossier-openings"
    >
      <h3 className="text-caption font-semibold text-studio-muted">
        {tLibrary(locale, "library.dossier.openings")}
      </h3>
      <DossierOpeningsNotice games={games} opponentColor={opponentColor} />
      <section aria-labelledby="dossier-main-openings" className="flex min-w-0 flex-col gap-1">
        <h4 id="dossier-main-openings" className="text-caption font-semibold text-studio-muted">
          {tLibrary(locale, "library.dossier.mainOpenings")}
        </h4>
        {filters.color === "all" ? (
          <div
            role="tablist"
            aria-label={tMyGames(locale, "myGames.statsByOpening")}
            data-testid="dossier-openings-color-tabs"
            className="flex gap-1"
          >
            {(["white", "black"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={opponentColor === tab}
                onClick={() => {
                  setColorTab(tab);
                  resetTree();
                }}
                className={`rounded px-2 py-0.5 text-caption ${opponentColor === tab ? "bg-studio-hover-strong text-studio-fg" : "text-studio-muted hover:bg-studio-hover"}`}
              >
                {tMyGames(locale, tab === "white" ? "myGames.statsWhite" : "myGames.statsBlack")}
              </button>
            ))}
          </div>
        ) : null}
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-caption text-studio-muted">
          <div role="group" aria-label={tMyGames(locale, "myGames.statsSortBy")} className="flex items-center gap-1">
            <span>{tMyGames(locale, "myGames.statsSortBy")}</span>
            {(["games", "score"] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={sort === option}
                onClick={() => setSort(option)}
                className={`rounded px-2 py-0.5 text-caption ${sort === option ? "bg-studio-hover-strong text-studio-fg" : "text-studio-muted hover:bg-studio-hover"}`}
              >
                {tMyGames(locale, option === "games" ? "myGames.statsSortGames" : "myGames.statsSortScore")}
              </button>
            ))}
          </div>
          <div role="group" aria-label={tMyGames(locale, "myGames.statsMinGames")} className="flex items-center gap-1">
            <span>{tMyGames(locale, "myGames.statsMinGames")}</span>
            {MIN_GAMES_OPTIONS.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={minGames === value}
                onClick={() => setMinGames(value)}
                className={`rounded px-2 py-0.5 text-caption tabular-nums ${minGames === value ? "bg-studio-hover-strong text-studio-fg" : "text-studio-muted hover:bg-studio-hover"}`}
              >
                {formatInteger(locale, value)}
              </button>
            ))}
          </div>
        </div>
        {rows.length === 0 ? (
          <p className="text-dense text-studio-faint" data-testid="dossier-openings-empty">
            {tLibrary(locale, "library.dossier.openingsEmpty")}
          </p>
        ) : (
          <ul className="flex min-w-0 flex-col gap-1" data-testid="dossier-openings-list">
            {rows.map((row) => (
              <li key={row.key} className="min-w-0">
                <OpeningCard
                  row={row}
                  locale={locale}
                  opponentColor={opponentColor}
                  selected={selectedOpening === row.key}
                  onToggle={() => toggle(row)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="dossier-move-lines" className="flex min-w-0 flex-col gap-1">
        <h4 id="dossier-move-lines" className="text-caption font-semibold text-studio-muted">
          {tLibrary(locale, "library.dossier.moveLines")}
        </h4>
        <OpeningLinesTree
          embedded
          locale={locale}
          lineColor={opponentColor}
          setLineColor={(color) => {
            // The Cor filter wins when it is not "all"; the tree's own tabs
            // then have nothing to change (the list must keep following it).
            if (filters.color !== "all") {
              return;
            }
            setColorTab(color);
            resetTree();
          }}
          uiFilters={uiFilters}
          setUiFilters={(next) => {
            setUiFilters(next);
            resetTree();
          }}
          timeClasses={timeClasses}
          rows={lineRows}
          totalGames={treeRoot.games}
          onToggle={(key) => {
            setExpandedKeys((previous) => {
              const next = new Set(previous);
              if (next.has(key)) {
                next.delete(key);
              } else {
                next.add(key);
              }
              return next;
            });
          }}
          onOpenLine={(path) => prepareLine(path, opponentColor)}
          openLineLabel={tLibrary(locale, "library.dossier.prepareLine")}
        />
      </section>
      <DossierRepertoireGaps games={games} opponentColor={opponentColor} />
    </Panel>
  );
}
