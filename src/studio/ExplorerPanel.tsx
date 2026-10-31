"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { fileExplorerSource, type ExplorerResponse, type ExplorerSource } from "@/src/lib/explorer-types";
import { formatSan, sideFromFen } from "@/src/chess/move-notation";
import type { SiteLocale } from "@/src/i18n/locale.ts";
import { tPanels } from "@/src/i18n/studio-panel-strings.ts";
import { useStudioStore } from "@/src/store/studio-store";
import { ExplorerFiltersBar } from "./ExplorerFiltersBar";
import { Badge } from "./ui/Controls";
import { ResultBar } from "./ui/ResultBar";
import { IconButton } from "./ui/Button";
import { isExplorerPanelId } from "./dock-layout";
import { openExplorerPanel, persistExplorerSource } from "./dock-api";
import { useExplorerData } from "./use-explorer-data";

const compactCount = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

const ROW_GRID = "grid grid-cols-[64px_minmax(0,1fr)_minmax(170px,220px)] items-center gap-3 px-3";

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
  const locale: SiteLocale = useStudioStore((state) => state.settings.locale);
  const makeUciMove = useStudioStore((state) => state.makeUciMove);
  const moveNotation = useStudioStore((state) => state.settings.moveNotation);
  const filters = useStudioStore((state) => state.settings.explorerFilters);
  const setExplorerFilters = useStudioStore((state) => state.setExplorerFilters);
  const maxGames = Math.max(1, ...(explorer?.moves.map((row) => row.games) ?? [1]));
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
    <div className="flex h-full flex-col bg-studio-panel text-body text-studio-fg">
      <div className="flex items-center gap-1 border-b border-studio-border-subtle px-3 py-2">
        <select
          aria-label={tPanels(locale, "explorer.sourceLabel")}
          value={effectiveSource}
          onChange={(event) => {
            const next = parseExplorerSource(event.target.value);
            if (next) {
              onSourceChange(next);
            }
          }}
          className="min-w-0 flex-1 truncate rounded-md border border-transparent bg-transparent px-1 py-0.5 text-dense font-semibold text-studio-fg outline-none hover:border-studio-border focus:border-studio-accent"
        >
          <option value="curated">{tPanels(locale, "explorer.source.curated")}</option>
          <option value="masters">{tPanels(locale, "explorer.source.masters")}</option>
          <option value="lichess">{tPanels(locale, "explorer.source.lichess")}</option>
          <option value="chesscom">{tPanels(locale, "explorer.source.chesscom")}</option>
          {databases.map((database) => (
            <option key={database.id} value={fileExplorerSource(database.id)}>
              {database.name}
            </option>
          ))}
          {knownSources.has(effectiveSource) ? null : <option value={effectiveSource}>{tPanels(locale, "explorer.source.personal")}</option>}
        </select>
        {explorer ? (
          <span className="shrink-0 text-caption tabular-nums text-studio-faint">
            {totalGames === 1
              ? tPanels(locale, "explorer.count.one", { count: totalGames.toLocaleString() })
              : tPanels(locale, "explorer.count.other", { count: totalGames.toLocaleString() })}
          </span>
        ) : null}
        <IconButton label={tPanels(locale, "explorer.splitView")} size="sm" onClick={onDuplicate}>
          <Plus size={15} />
        </IconButton>
      </div>
      <ExplorerFiltersBar source={effectiveSource} filters={filters} onChange={setExplorerFilters} />
      {explorer?.opening ? (
        <div className="flex items-center gap-2 border-b border-studio-border-subtle px-3 py-2 text-dense text-studio-muted">
          <Badge tone="accent">{explorer.opening.eco}</Badge>
          <span className="truncate">{explorer.opening.name}</span>
        </div>
      ) : null}
      {explorer?.notice ? (
        <div className="border-b border-studio-border-subtle bg-studio-warning-bg px-3 py-2 text-caption text-studio-warning-fg">
          {explorer.notice}
        </div>
      ) : null}
      {error ? (
        <div className="border-b border-studio-border-subtle bg-studio-warning-bg px-3 py-2 text-caption text-studio-warning-fg">
          {tPanels(locale, "explorer.error")}{" "}
          <button type="button" className="underline" onClick={onRetry}>
            {tPanels(locale, "explorer.errorRetry")}
          </button>
        </div>
      ) : null}
      <div
        className={`${ROW_GRID} relative border-b border-studio-border-subtle py-1.5 text-caption uppercase tracking-wider text-studio-faint`}
      >
        <span>{tPanels(locale, "explorer.column.move")}</span>
        <span className="truncate">{tPanels(locale, "explorer.column.games")}</span>
        <span className="whitespace-nowrap">{tPanels(locale, "explorer.column.split")}</span>
        {loading ? (
          <span className="absolute inset-x-0 -bottom-px h-0.5 overflow-hidden" role="progressbar" aria-label={tPanels(locale, "explorer.loading")}>
            <span className="absolute inset-y-0 w-1/3 animate-[studio-progress_1.1s_ease-in-out_infinite] bg-studio-accent" />
          </span>
        ) : null}
      </div>
      <div
        className={`min-h-0 flex-1 overflow-auto transition-opacity ${loading && hasMoves ? "opacity-60" : ""}`}
        aria-busy={loading || undefined}
      >
        {loading && !explorer ? (
          <div className="px-3 py-4 text-dense text-studio-faint" role="status">{tPanels(locale, "explorer.loadingLabel")}</div>
        ) : null}
        {!loading && !error && !hasMoves ? (
          <div className="px-3 py-4 text-dense text-studio-faint">{tPanels(locale, "explorer.empty")}</div>
        ) : null}
        {explorer?.moves.map((row) => {
          const share = totalGames > 0 ? (row.games / totalGames) * 100 : 0;
          const rowGames = row.games.toLocaleString();
          return (
            <button
              key={row.uci}
              title={tPanels(locale, "explorer.rowGames", { count: rowGames })}
              className={`${ROW_GRID} w-full py-1.5 text-left hover:bg-studio-hover`}
              onClick={() => {
                const from = row.uci.slice(0, 2);
                const to = row.uci.slice(2, 4);
                const promotion = row.uci[4];
                makeUciMove(from, to, promotion);
              }}
            >
              <span className="font-semibold">{formatSan(row.san, moveNotation, side)}</span>
              <span className="flex min-w-0 items-center gap-2">
                <span className="w-11 shrink-0 text-right text-dense tabular-nums text-studio-fg">
                  {compactCount.format(row.games)}
                </span>
                <span className="w-9 shrink-0 text-right text-caption tabular-nums text-studio-faint">
                  {share >= 1 ? `${Math.round(share)}%` : "<1%"}
                </span>
                <span className="h-1 min-w-6 flex-1 overflow-hidden rounded-full bg-studio-track">
                  <span
                    className="block h-full rounded-full bg-studio-accent"
                    style={{ width: `${(row.games / maxGames) * 100}%` }}
                  />
                </span>
              </span>
              <ResultBar white={row.white} draws={row.draws} black={row.black} />
            </button>
          );
        })}
      </div>
      {explorer && hasMoves ? (
        <div className={`${ROW_GRID} border-t border-studio-border py-1.5 text-dense`}>
          <span className="font-semibold text-studio-muted">{tPanels(locale, "explorer.total")}</span>
          <span className="flex items-center gap-2">
            <span className="w-11 shrink-0 text-right tabular-nums">{compactCount.format(totalGames)}</span>
            <span className="text-caption text-studio-faint">{explorer.moves.length === 1
              ? tPanels(locale, "explorer.moves.one", { count: explorer.moves.length })
              : tPanels(locale, "explorer.moves.other", { count: explorer.moves.length })}</span>
          </span>
          <ResultBar white={explorer.white} draws={explorer.draws} black={explorer.black} />
        </div>
      ) : null}
    </div>
  );
}
