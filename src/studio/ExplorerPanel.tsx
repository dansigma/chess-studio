"use client";

import { tLibrary } from "@/src/i18n/library-strings";
import { LibraryLoadingStatus } from "./library/LibraryLoadingStatus";
import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { explorerSourceTitle, fileExplorerSource, type ExplorerResponse, type ExplorerSource } from "@/src/lib/explorer-types";
import { formatSan, sideFromFen } from "@/src/chess/move-notation";
import { fenKey } from "@/src/chess/tree";
import type { SiteLocale } from "@/src/i18n/locale.ts";
import { tPanels } from "@/src/i18n/studio-panel-strings.ts";
import { formatGameCount, formatInteger } from "@/src/i18n/format.ts";
import { useStudioStore } from "@/src/store/studio-store";
import { useActiveLineFens } from "@/src/store/hooks";
import { ExplorerFiltersBar } from "./ExplorerFiltersBar";
import { Badge } from "./ui/Controls";
import { ResultBar } from "./ui/ResultBar";
import { IconButton } from "./ui/Button";
import { isExplorerPanelId } from "./dock-layout";
import { openExplorerPanel, persistExplorerSource } from "./dock-api";
import { useExplorerData } from "./use-explorer-data";
import { EXPLORER_COMPACT_MAX_HEIGHT, usePanelSize } from "./use-panel-size";
import { localizeOpeningName } from "@/src/lib/opening-names";
import { indexCatalogOpenings, resolveLineOpening } from "@/src/lib/line-opening";
import { loadCatalog } from "@/src/lib/openings-catalog";

const ROW_GRID = "grid grid-cols-[64px_minmax(0,1fr)_minmax(170px,220px)] items-center gap-3 px-3";

// SIG-1385: fallback order for the empty-state "try another source" action.
const EMPTY_STATE_ALTERNATES: readonly ExplorerSource[] = ["lichess", "masters", "curated"];

/**
 * SIG-908: runtime guard for a dockview `params.source` value. The panel id
 * suffix is an opaque uid; only this validates the source. Personal sources
 * are `file:<id>` with a non-empty whitespace-free id.
 */
export function parseExplorerSource(value: unknown): ExplorerSource | null {
  if (value === "curated" || value === "masters" || value === "lichess" || value === "chesscom") {
    return value;
  }
  if (typeof value === "string" && value.startsWith("file:")) {
    const suffix = value.slice("file:".length);
    if (suffix.length > 0 && !/\s/.test(suffix)) {
      return value as ExplorerSource;
    }
  }
  return null;
}

export function ExplorerPanel({ source, panelId }: { source?: ExplorerSource; panelId?: string }) {
  // Dynamic `explorer:<uid>` panels own their source via dock params + the
  // shared hook. The bare `explorer` panel stays on the global store fields
  // (sidebar-driven) so the default flow + GamesPanel are unchanged.
  if (panelId && isExplorerPanelId(panelId)) {
    return <DynamicExplorerPanel initialSource={source} panelId={panelId} />;
  }
  return <BareExplorerPanel />;
}

function DynamicExplorerPanel({ initialSource, panelId }: { initialSource?: ExplorerSource; panelId: string }) {
  const databases = useStudioStore((state) => state.files.databases);
  const globalSource = useStudioStore((state) => state.databaseSource);
  const validated = parseExplorerSource(initialSource) ?? parseExplorerSource(globalSource) ?? "masters";
  const [retryTick, setRetryTick] = useState(0);
  const { explorer, loading, error } = useExplorerData(validated, retryTick);
  return (
    <ExplorerChrome
      effectiveSource={validated}
      databases={databases}
      explorer={explorer}
      loading={loading}
      error={error}
      onRetry={() => setRetryTick((count) => count + 1)}
      onSourceChange={(next) => {
        if (next !== validated) {
          persistExplorerSource(panelId, next);
        }
      }}
      onDuplicate={() => openExplorerPanel(validated)}
    />
  );
}

function BareExplorerPanel() {
  const explorer = useStudioStore((state) => state.explorer);
  const loading = useStudioStore((state) => state.explorerLoading);
  const error = useStudioStore((state) => state.explorerError);
  const retryExplorer = useStudioStore((state) => state.retryExplorer);
  const source = useStudioStore((state) => state.databaseSource);
  const databases = useStudioStore((state) => state.files.databases);
  const setDatabaseSource = useStudioStore((state) => state.setDatabaseSource);
  return (
    <ExplorerChrome
      effectiveSource={source}
      databases={databases}
      explorer={explorer}
      loading={loading}
      error={error}
      onRetry={retryExplorer}
      onSourceChange={setDatabaseSource}
      onDuplicate={() => openExplorerPanel(source)}
    />
  );
}

function ExplorerChrome({
  effectiveSource,
  databases,
  explorer,
  loading,
  error,
  onRetry,
  onSourceChange,
  onDuplicate,
}: {
  effectiveSource: ExplorerSource;
  databases: Array<{ id: string; name: string }>;
  explorer: ExplorerResponse | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onSourceChange: (source: ExplorerSource) => void;
  onDuplicate: () => void;
}) {
  const filesHydrated = useStudioStore((state) => state.filesHydrated);
  const libraryLoading = !filesHydrated && effectiveSource.startsWith("file:");
  const locale: SiteLocale = useStudioStore((state) => state.settings.locale);
  const lineFens = useActiveLineFens();
  const activeFen = lineFens[lineFens.length - 1];
  const [openingIndex, setOpeningIndex] = useState<ReturnType<typeof indexCatalogOpenings>>();
  useEffect(() => {
    let active = true;
    void loadCatalog().then((entries) => {
      if (active) setOpeningIndex(indexCatalogOpenings(entries));
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  // The move list can retain a previous response while a new position loads.
  const exactOpening = explorer?.opening && explorer.source === effectiveSource
    && fenKey(explorer.fen) === fenKey(activeFen) ? explorer.opening : null;
  const opening = exactOpening ?? (openingIndex ? resolveLineOpening(lineFens, openingIndex) : null);
  const openingName = opening ? localizeOpeningName(opening.name, locale, opening.eco) : undefined;
  // SIG-1211: the Chess.com source has no global database — it indexes the
  // games of the Chess.com player loaded via search, so name that player in
  // the selector and explain the empty state when none is loaded.
  const chesscomPlayer = useStudioStore((state) =>
    state.playerProfile?.source === "chesscom" ? state.playerProfile.username : null,
  );
  const chesscomNeedsPlayer = effectiveSource === "chesscom" && chesscomPlayer === null;
  // SIG-1385: the empty state must offer a way forward — switch to the first
  // alternative shared source (Lichess first: the broadest online DB, and it
  // never needs a loaded Chess.com player).
  const alternateSource =
    EMPTY_STATE_ALTERNATES.find((candidate) => candidate !== effectiveSource) ?? null;
  const makeUciMove = useStudioStore((state) => state.makeUciMove);
  const moveNotation = useStudioStore((state) => state.settings.moveNotation);
  const filters = useStudioStore((state) => state.settings.explorerFilters);
  const setExplorerFilters = useStudioStore((state) => state.setExplorerFilters);
  const setExplorerHover = useStudioStore((state) => state.setExplorerHover);
  const rootRef = useRef<HTMLDivElement>(null);
  const compactHeader = usePanelSize(rootRef).height < EXPLORER_COMPACT_MAX_HEIGHT;
  // SIG-1194: hovering a move previews its arrow on the board.
  const showHoverArrow = (uci: string) =>
    setExplorerHover({ fen: activeFen, from: uci.slice(0, 2), to: uci.slice(2, 4) });
  const clearHoverArrow = () => setExplorerHover(null);
  useEffect(() => () => setExplorerHover(null), [setExplorerHover]);
  const side = explorer ? sideFromFen(explorer.fen) : "w";
  const totalGames = explorer ? explorer.white + explorer.draws + explorer.black : 0;
  const hasMoves = (explorer?.moves.length ?? 0) > 0;
  const knownSources = new Set<ExplorerSource>([
    "curated",
    "masters",
    "lichess",
    "chesscom",
    ...databases.map((database) => fileExplorerSource(database.id)),
  ]);

  return (
    <div ref={rootRef} className="flex h-full flex-col bg-studio-panel text-body text-studio-fg">
      {/* SIG-1194: two rows (64px) instead of four bordered strips (~137px).
          Row 1 is the context — the opening — row 2 the source and filters. */}
      <div className="relative shrink-0 border-b border-studio-border-subtle">
        {/* SIG-1197: short panels fold the opening into the source row (ECO
            badge, name in its tooltip) so the move list keeps its rows. */}
        {compactHeader ? null : (
        <div className="flex h-8 items-center gap-2 px-3">
          {opening ? (
            <>
              <Badge tone="accent">{opening.eco}</Badge>
              <span className="min-w-0 flex-1 truncate font-semibold" title={openingName}>
                {openingName}
              </span>
            </>
          ) : (
            <span className="min-w-0 flex-1 truncate text-dense text-studio-faint">
              {tPanels(locale, "explorer.opening.none")}
            </span>
          )}
          {explorer ? (
            <span className="shrink-0 text-caption tabular-nums text-studio-muted">
              {totalGames === 1
                ? tPanels(locale, "explorer.count.one", { count: formatInteger(locale, totalGames) })
                : tPanels(locale, "explorer.count.other", { count: formatInteger(locale, totalGames) })}
            </span>
          ) : null}
        </div>
        )}
        <div className="flex h-[31px] items-center gap-1 pl-2 pr-1.5">
          {compactHeader && opening ? (
            <span title={openingName} className="shrink-0">
              <Badge tone="accent">{opening.eco}</Badge>
            </span>
          ) : null}
          <select
            aria-label={tPanels(locale, "explorer.sourceLabel")}
            value={effectiveSource}
            onChange={(event) => {
              const next = parseExplorerSource(event.target.value);
              if (next) {
                onSourceChange(next);
              }
            }}
            className="min-w-0 flex-1 truncate rounded-md border border-transparent bg-transparent px-1 py-0.5 text-dense font-medium text-studio-fg-secondary outline-none hover:border-studio-border focus:border-studio-accent"
          >
            <option value="curated">{tPanels(locale, "explorer.source.curated")}</option>
            <option value="masters">{tPanels(locale, "explorer.source.masters")}</option>
            <option value="lichess">{tPanels(locale, "explorer.source.lichess")}</option>
            <option value="chesscom">
              {chesscomPlayer
                ? `${tPanels(locale, "explorer.source.chesscom")} · ${chesscomPlayer}`
                : tPanels(locale, "explorer.source.chesscom")}
            </option>
            {filesHydrated ? databases.map((database) => (
              <option key={database.id} value={fileExplorerSource(database.id)}>
                {database.name}
              </option>
            )) : (
              <option disabled value={libraryLoading ? effectiveSource : ""}>
                {tLibrary(locale, "library.sync.loading")}
              </option>
            )}
            {!libraryLoading && !knownSources.has(effectiveSource) ? <option value={effectiveSource}>{tPanels(locale, "explorer.source.personal")}</option> : null}
          </select>
          <ExplorerFiltersBar source={effectiveSource} filters={filters} onChange={setExplorerFilters} />
          <IconButton label={tPanels(locale, "explorer.splitView")} size="sm" onClick={onDuplicate}>
            <Plus size={15} />
          </IconButton>
        </div>
        {loading ? (
          <span className="absolute inset-x-0 -bottom-px h-0.5 overflow-hidden" role="progressbar" aria-label={tPanels(locale, "explorer.loading")}>
            <span className="absolute inset-y-0 w-1/3 animate-[studio-progress_1.1s_ease-in-out_infinite] bg-studio-accent" />
          </span>
        ) : null}
      </div>
      {!libraryLoading && explorer?.notice ? (
        <div className="border-b border-studio-border-subtle bg-studio-warning-bg px-3 py-2 text-caption text-studio-warning-fg">
          {explorer.notice}
        </div>
      ) : null}
      {!libraryLoading && error ? (
        <div className="border-b border-studio-border-subtle bg-studio-warning-bg px-3 py-2 text-caption text-studio-warning-fg">
          {tPanels(locale, "explorer.error")}{" "}
          <button type="button" className="underline" onClick={onRetry}>
            {tPanels(locale, "explorer.errorRetry")}
          </button>
        </div>
      ) : null}
      <div
        className={`min-h-0 flex-1 overflow-auto transition-opacity ${loading && hasMoves ? "opacity-60" : ""}`}
        aria-busy={libraryLoading || loading || undefined}
      >
        {libraryLoading ? <LibraryLoadingStatus /> : null}
        {!libraryLoading && hasMoves ? (
          <div
            className={`${ROW_GRID} sticky top-0 z-[1] border-b border-studio-border-subtle bg-studio-panel py-1 text-[10px] uppercase tracking-wider text-studio-faint`}
          >
            <span>{tPanels(locale, "explorer.column.move")}</span>
            <span className="truncate">{tPanels(locale, "explorer.column.games")}</span>
            {/* SIG-1194: swatches in the bar's own colours replace the text legend. */}
            <span className="flex items-center gap-2.5 normal-case tracking-normal" aria-label={tPanels(locale, "explorer.column.split")}>
              <LegendSwatch className="bg-studio-win" label={tPanels(locale, "explorer.legend.white")} />
              <LegendSwatch className="bg-studio-draw" label={tPanels(locale, "explorer.legend.draws")} />
              <LegendSwatch className="bg-studio-result-black" label={tPanels(locale, "explorer.legend.black")} />
            </span>
          </div>
        ) : null}
        {!libraryLoading && loading && !explorer ? (
          <div className="px-3 py-4 text-dense text-studio-faint" role="status">{tPanels(locale, "explorer.loadingLabel")}</div>
        ) : null}
        {!libraryLoading && !loading && !error && !hasMoves ? (
          <div className="flex flex-col items-start gap-2 px-3 py-4 text-dense text-studio-faint">
            <p>
              {tPanels(locale, chesscomNeedsPlayer ? "explorer.chesscom.needPlayer" : "explorer.empty")}
            </p>
            {alternateSource ? (
              <button
                type="button"
                onClick={() => onSourceChange(alternateSource)}
                className="rounded bg-studio-hover px-2 py-0.5 text-caption font-medium text-studio-accent-text hover:bg-studio-hover-strong"
              >
                {tPanels(locale, "explorer.trySource", {
                  source: explorerSourceTitle(alternateSource, databases, locale),
                })}
              </button>
            ) : null}
          </div>
        ) : null}
        {!libraryLoading && explorer?.moves.map((row) => {
          const share = totalGames > 0 ? (row.games / totalGames) * 100 : 0;
          const rowGames = formatInteger(locale, row.games);
          return (
            <button
              key={row.uci}
              title={tPanels(locale, "explorer.rowGames", { count: rowGames })}
              className={`${ROW_GRID} relative w-full py-1.5 text-left hover:bg-studio-hover`}
              onMouseEnter={() => showHoverArrow(row.uci)}
              onFocus={() => showHoverArrow(row.uci)}
              onMouseLeave={clearHoverArrow}
              onBlur={clearHoverArrow}
              onClick={() => {
                clearHoverArrow();
                const from = row.uci.slice(0, 2);
                const to = row.uci.slice(2, 4);
                const promotion = row.uci[4];
                makeUciMove(from, to, promotion);
              }}
            >
              {/* SIG-1194: the row's share as a faint background fill. */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-0"
                style={{ width: `${share}%`, background: "color-mix(in srgb, var(--studio-accent) 8%, transparent)" }}
              />
              <span className="relative font-semibold">{formatSan(row.san, moveNotation, side)}</span>
              <span className="relative flex min-w-0 items-center gap-2">
                <span className="w-11 shrink-0 text-right text-dense tabular-nums text-studio-fg">
                  {formatGameCount(locale, row.games)}
                </span>
                <span className="w-9 shrink-0 text-right text-caption tabular-nums text-studio-faint">
                  {share >= 1 ? `${Math.round(share)}%` : "<1%"}
                </span>
              </span>
              <span className="relative">
                <ResultBar white={row.white} draws={row.draws} black={row.black} />
              </span>
            </button>
          );
        })}
        {/* SIG-1299: Total lives inside the scroller (sticky bottom) so it shares
            the rows' width, scrollbar and grid columns exactly. */}
        {explorer && hasMoves ? (
          <div
            data-testid="explorer-total-row"
            className={`${ROW_GRID} sticky bottom-0 z-[1] border-t border-studio-border bg-studio-panel py-1.5 text-dense`}
          >
            <span className="font-semibold text-studio-muted">{tPanels(locale, "explorer.total")}</span>
            <span className="flex min-w-0 items-center gap-2">
              <span className="w-11 shrink-0 text-right tabular-nums">{formatGameCount(locale, totalGames)}</span>
              <span className="min-w-0 truncate text-caption text-studio-faint">{explorer.moves.length === 1
                ? tPanels(locale, "explorer.moves.one", { count: explorer.moves.length })
                : tPanels(locale, "explorer.moves.other", { count: explorer.moves.length })}</span>
            </span>
            <span className="relative">
              <ResultBar white={explorer.white} draws={explorer.draws} black={explorer.black} />
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function LegendSwatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`h-2 w-2 rounded-[2px] ring-1 ring-studio-border-strong ${className}`} aria-hidden="true" />
      {label}
    </span>
  );
}
