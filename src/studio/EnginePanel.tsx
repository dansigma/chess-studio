"use client";

import { useEffect, useRef, useState } from "react";
import { Cpu, ListPlus, Pause, Play, RotateCcw, Settings2 } from "lucide-react";
import { useMenuKeyDown } from "./ui/use-menu-keyboard";
import {
  ENGINE_BUILD_INFO,
  ENGINE_BUILDS,
  MAX_DEPTH,
  MAX_LINES,
  MIN_DEPTH,
  MIN_LINES,
  formatNps,
  formatScore,
  maxHardwareThreads,
  positionAfterPv,
  scoreNumber,
  supportsEngineThreads,
  type EngineInfo,
} from "@/src/engine/stockfish-client";
import { acquire, type SharedEngineLease } from "@/src/engine/shared-engine";
import { useActiveFen, useSideToMove } from "@/src/store/hooks";
import { useStudioStore } from "@/src/store/studio-store";
import { tPanels } from "@/src/i18n/studio-panel-strings.ts";
import { EngineLineContextMenu, type EngineLineMenuState } from "./EngineLineContextMenu";
import { fenKey } from "@/src/chess/tree";
import { resolveEvalDisplay } from "@/src/lib/eval-cache";
import { throttleLatest } from "@/src/lib/throttle";
import { formatSanAtPly } from "@/src/chess/move-notation";
import { IconButton } from "./ui/Button";
import { Stepper } from "./ui/Controls";
import { EvalSparkline } from "./EvalGraphPanel";
import { ENGINE_SPARKLINE_MIN_HEIGHT, usePanelSize } from "./use-panel-size";

function isInsideEnginePv(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest("[data-engine-pv]"));
}

const PV_EMPHASIS = 8;

function moveNumberLabel(fen: string, side: "w" | "b", index: number): string | null {
  const fullmove = Number(fen.split(" ")[5]) || 1;
  const ply = index + (side === "b" ? 1 : 0);
  const number = fullmove + Math.floor(ply / 2);
  if (ply % 2 === 0) return `${number}.`;
  return index === 0 ? `${number}…` : null;
}

export function EnginePanel() {
  const locale = useStudioStore((state) => state.settings.locale);
  const fen = useActiveFen();
  const depthTarget = useStudioStore((state) => state.settings.engineDepth);
  const multiPv = useStudioStore((state) => state.settings.multiPv);
  const threads = useStudioStore((state) => state.settings.engineThreads);
  const engineBuild = useStudioStore((state) => state.settings.engineBuild);
  const setEngineDepth = useStudioStore((state) => state.setEngineDepth);
  const setMultiPv = useStudioStore((state) => state.setMultiPv);
  const setEngineThreads = useStudioStore((state) => state.setEngineThreads);
  const setEngineBuild = useStudioStore((state) => state.setEngineBuild);
  const playUciSequence = useStudioStore((state) => state.playUciSequence);
  const insertEngineLines = useStudioStore((state) => state.insertEngineLines);
  const setEnginePreview = useStudioStore((state) => state.setEnginePreview);
  const setEngineEval = useStudioStore((state) => state.setEngineEval);
  const putEvalCache = useStudioStore((state) => state.putEvalCache);
  const previewKey = useStudioStore((state) => state.enginePreview?.key ?? null);
  const moveNotation = useStudioStore((state) => state.settings.moveNotation);
  const side = useSideToMove();
  // SIG-856: the cached eval for this FEN (shown immediately, no engine
  // wait) and the last displayed eval (held instead of zeroed on fresh FENs).
  const cachedForFen = useStudioStore((state) => state.evalByFen[fenKey(fen)]);
  const heldEval = useStudioStore((state) => state.engineEval);
  const engineRef = useRef<SharedEngineLease | null>(null);
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(true);
  const [runId, setRunId] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const showSparkline = useStudioStore((state) => state.settings.engineSparkline);
  const toggleSparkline = useStudioStore((state) => state.toggleEngineSparkline);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelSize = usePanelSize(rootRef);
  const [buildOpen, setBuildOpen] = useState(false);
  const [lineMenu, setLineMenu] = useState<EngineLineMenuState | null>(null);
  // SIG-1192: PVs render on one line; clicking a line's score expands it.
  const [expandedLines, setExpandedLines] = useState<ReadonlySet<number>>(() => new Set());
  const buildMenuRef = useRef<HTMLDivElement>(null);
  const handleBuildMenuKeyDown = useMenuKeyDown(buildMenuRef, () => setBuildOpen(false), buildOpen);
  const [info, setInfo] = useState<EngineInfo>({
    depth: 0,
    running: false,
    ready: false,
    failed: false,
    lines: [],
    nps: 0,
    nodes: 0,
    threaded: false,
    fen: "",
  });

  useEffect(() => {
    if (!started) {
      return;
    }
    const lease = acquire("engine", engineBuild);
    engineRef.current = lease;
    // SIG-1080: the engine emits dozens of snapshots per second; throttle
    // to at most one state update per 150 ms with a trailing flush so the
    // last snapshot is always shown.
    const throttled = throttleLatest(setInfo, 150);
    const unsubscribe = lease.subscribe((snapshot) => throttled(snapshot));
    return () => {
      throttled.flush();
      unsubscribe();
      lease.release();
      engineRef.current = null;
    };
  }, [engineBuild, started]);

  useEffect(() => {
    if (!started) {
      return;
    }
    if (paused) {
      engineRef.current?.stop();
      return;
    }
    engineRef.current?.analyze(fen, depthTarget, multiPv, threads);
  }, [fen, depthTarget, multiPv, threads, paused, runId, engineBuild, started]);

  // SIG-856 choice (b): on a FEN change, show the cached eval immediately
  // when present; otherwise hold the last displayed value — never zero the
  // bar while the engine analyzes the new FEN. The cleanup must not clear
  // the eval either: passive-effect cleanup runs after paint, so a
  // clear-then-set would flash a zero frame.
  useEffect(() => {
    setEnginePreview(null);
    const cached = useStudioStore.getState().evalByFen[fenKey(fen)];
    if (cached) {
      setEngineEval({ pawns: cached.pawns, label: cached.label, depth: cached.depth });
    }
    return () => {
      setEnginePreview(null);
    };
  }, [fen, setEnginePreview, setEngineEval]);

  // SIG-1196: once this panel pauses, the eval walk (sparkline / graph) takes
  // the shared engine and its snapshots carry other FENs. Keep the last lines
  // this panel saw for the current FEN instead of blanking them.
  const [keptLines, setKeptLines] = useState<{ fen: string; lines: EngineInfo["lines"] } | null>(null);
  if (info.fen === fen && info.lines.length > 0 && keptLines?.lines !== info.lines) {
    setKeptLines({ fen, lines: info.lines });
  }
  const lines = info.fen === fen ? info.lines : keptLines?.fen === fen ? keptLines.lines : [];
  const best = lines[0];
  const evalLabel = formatScore(best, side);
  const evalValue = scoreNumber(best, side);
  const display = resolveEvalDisplay(
    best ? { pawns: evalValue, label: evalLabel, depth: info.depth } : null,
    cachedForFen,
    heldEval,
    info.depth,
  );

  useEffect(() => {
    if (!best) {
      return;
    }
    setEngineEval({ pawns: evalValue, label: evalLabel, depth: info.depth });
    putEvalCache(fen, { pawns: evalValue, label: evalLabel, depth: info.depth });
  }, [best, evalLabel, evalValue, fen, info.depth, putEvalCache, setEngineEval]);
  const maxCores = info.threaded ? maxHardwareThreads() : 1;
  const nps = formatNps(info.nps);
  const status = info.failed
    ? tPanels(locale, "engine.status.failed")
    : !started
    ? tPanels(locale, "engine.status.paused")
    : !info.ready
    ? tPanels(locale, "engine.status.loading")
    : paused || !info.running
      ? info.depth >= depthTarget && info.depth > 0
        ? tPanels(locale, "engine.status.maxDepth")
        : tPanels(locale, "engine.status.stopped")
      : nps
        ? tPanels(locale, "engine.status.analyzing", { nps })
        : tPanels(locale, "engine.status.analyzingPlain");
  const placeholderLines = Math.max(0, multiPv - lines.length);
  const engineInfo = ENGINE_BUILD_INFO[engineBuild];

  const statusLine = info.failed || !started || !info.ready
    ? status
    : paused || !info.running
      ? info.depth >= depthTarget && info.depth > 0
        ? tPanels(locale, "engine.status.lineMax", { depth: display.depth, target: depthTarget })
        : tPanels(locale, "engine.status.stopped")
      : nps
        ? tPanels(locale, "engine.status.line", { depth: display.depth, target: depthTarget, nps })
        : tPanels(locale, "engine.status.lineNoNps", { depth: display.depth, target: depthTarget });
  const running = info.running && !paused;

  return (
    <div ref={rootRef} className="flex h-full flex-col bg-studio-panel text-body text-studio-fg">
      {/* SIG-1195: one 32px control row. Depth, lines and cores moved into the
          gear popover; status lives in the row's depth text. */}
      <div className="flex h-8 shrink-0 items-center gap-1.5 border-b border-studio-border pl-1 pr-1.5">
        <IconButton
          size="sm"
          label={paused || !info.running ? tPanels(locale, "engine.start") : tPanels(locale, "engine.pause")}
          active={running}
          onClick={() => {
            if (info.running && !paused) {
              setPaused(true);
              return;
            }
            if (!started) {
              setStarted(true);
              setPaused(false);
              return;
            }
            if (paused) {
              setPaused(false);
              return;
            }
            setRunId((value) => value + 1);
          }}
        >
          {paused || !info.running ? <Play size={13} fill="currentColor" /> : <Pause size={13} fill="currentColor" />}
        </IconButton>
        <span className="min-w-[3.25rem] text-[16px] font-bold leading-none tabular-nums text-studio-fg" aria-hidden="true">
          {display.label || "–"}
        </span>
        {display.label ? (
          <span className="sr-only">{tPanels(locale, "engine.evaluation", { label: display.label })}</span>
        ) : null}
        <div className="relative min-w-0 shrink">
          <button
            type="button"
            aria-expanded={buildOpen}
            aria-haspopup="menu"
            className="flex max-w-[10rem] items-center rounded-md px-1 py-0.5 text-dense text-studio-muted hover:bg-studio-hover-strong hover:text-studio-fg"
            onClick={() => setBuildOpen((open) => !open)}
          >
            <span className="truncate">{engineInfo.label}</span>
          </button>
          {buildOpen ? (
            <>
              <button
                className="fixed inset-0 z-10 cursor-default"
                aria-label={tPanels(locale, "engine.closeMenu")}
                onClick={() => setBuildOpen(false)}
              />
              <div
                ref={buildMenuRef}
                role="menu"
                aria-label={tPanels(locale, "engine.buildMenu")}
                onKeyDown={handleBuildMenuKeyDown}
                className="absolute left-0 top-7 z-20 w-64 rounded-[9px] border border-studio-border-strong bg-studio-elevated p-1.5 shadow-2xl"
              >
                {ENGINE_BUILDS.map((build) => {
                  const item = ENGINE_BUILD_INFO[build];
                  const selected = build === engineBuild;
                  return (
                    <button
                      key={build}
                      type="button"
                      role="menuitemradio"
                      aria-checked={selected}
                      className={`flex w-full flex-col rounded-md px-2 py-1.5 text-left hover:bg-studio-hover ${
                        selected ? "bg-studio-hover" : ""
                      }`}
                      onClick={() => {
                        setEngineBuild(build);
                        setBuildOpen(false);
                        setPaused(false);
                      }}
                    >
                      <span className="text-dense font-medium text-studio-fg">{item.label}</span>
                      <span className="text-caption text-studio-faint">
                        {item.detail} · {item.size}
                      </span>
                    </button>
                  );
                })}
                <p className="px-2 pb-1 pt-1.5 text-caption text-studio-faint">
                  {tPanels(locale, "engine.buildNote", { size: "99 MB" })}
                </p>
              </div>
            </>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-1.5 text-caption tabular-nums text-studio-faint" role="status">
          {running ? (
            <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-studio-success" aria-hidden="true" />
          ) : null}
          <span className="truncate">{statusLine}</span>
          {info.failed ? (
            <button
              type="button"
              className="shrink-0 rounded-md border border-studio-border-strong px-1.5 py-0.5 text-caption font-medium text-studio-fg hover:bg-studio-hover"
              onClick={() => engineRef.current?.restart()}
            >
              <span className="inline-flex items-center gap-1">
                <RotateCcw size={12} aria-hidden="true" />
                {tPanels(locale, "engine.restart")}
              </span>
            </button>
          ) : null}
        </div>
        <IconButton
          size="sm"
          label={tPanels(locale, "engine.insertLines")}
          disabled={lines.length === 0}
          onClick={() =>
            insertEngineLines(
              fen,
              lines.map((line) => line.pvUci),
            )
          }
        >
          <ListPlus size={14} />
        </IconButton>
        <div className="relative">
          <IconButton
            size="sm"
            label={tPanels(locale, "engine.settings")}
            active={settingsOpen}
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen((open) => !open)}
          >
            <Settings2 size={14} />
          </IconButton>
          {settingsOpen ? (
            <>
              <button
                className="fixed inset-0 z-10 cursor-default"
                aria-label={tPanels(locale, "engine.closeSettings")}
                onClick={() => setSettingsOpen(false)}
              />
              <div
                role="dialog"
                aria-label={tPanels(locale, "engine.settings")}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setSettingsOpen(false);
                  }
                }}
                className="absolute right-0 top-7 z-20 flex w-64 flex-col gap-3 rounded-[9px] border border-studio-border-strong bg-studio-elevated p-3 shadow-2xl"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-dense text-studio-muted">{tPanels(locale, "engine.depth")}</span>
                  <Stepper
                    label={tPanels(locale, "engine.depth")}
                    hideLabel
                    decrementLabel={tPanels(locale, "engine.depth.decrease")}
                    incrementLabel={tPanels(locale, "engine.depth.increase")}
                    value={
                      <span>
                        {display.depth}
                        <span className="text-studio-faint"> / {depthTarget}</span>
                      </span>
                    }
                    canDecrement={depthTarget > MIN_DEPTH}
                    canIncrement={depthTarget < MAX_DEPTH}
                    onDecrement={() => setEngineDepth(depthTarget - 1)}
                    onIncrement={() => setEngineDepth(depthTarget + 1)}
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-dense text-studio-muted">{tPanels(locale, "engine.lines")}</span>
                  <Stepper
                    label={tPanels(locale, "engine.lines")}
                    hideLabel
                    decrementLabel={tPanels(locale, "engine.lines.decrease")}
                    incrementLabel={tPanels(locale, "engine.lines.increase")}
                    value={multiPv}
                    canDecrement={multiPv > MIN_LINES}
                    canIncrement={multiPv < MAX_LINES}
                    onDecrement={() => setMultiPv(multiPv - 1)}
                    onIncrement={() => setMultiPv(multiPv + 1)}
                  />
                </div>
                <label className="flex cursor-pointer items-center justify-between gap-2 text-dense text-studio-muted">
                  {tPanels(locale, "engine.sparkline")}
                  <input
                    type="checkbox"
                    checked={showSparkline}
                    onChange={toggleSparkline}
                    className="h-3.5 w-3.5 accent-studio-accent"
                  />
                </label>
                <div>
                  <div className="mb-1.5 flex items-center justify-between text-dense text-studio-muted">
                    <span className="inline-flex items-center gap-1.5">
                      <Cpu size={13} aria-hidden="true" />
                      {threads === 1
                        ? tPanels(locale, "engine.cores.title.one", { count: threads })
                        : tPanels(locale, "engine.cores.title.other", { count: threads })}
                    </span>
                    <span className="font-semibold tabular-nums text-studio-fg">{threads}</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={maxCores}
                    value={Math.min(threads, maxCores)}
                    aria-label={tPanels(locale, "engine.cores.title.other", { count: threads })}
                    onChange={(event) => setEngineThreads(Number(event.target.value))}
                    className="w-full accent-studio-accent"
                  />
                  {!supportsEngineThreads() ? (
                    <p className="mt-1.5 text-caption text-studio-warning-fg">
                      {tPanels(locale, "engine.cores.singleThreadWarning")}
                    </p>
                  ) : (
                    <p className="mt-1.5 text-caption text-studio-faint">{tPanels(locale, "engine.cores.available", { count: maxCores })}</p>
                  )}
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* SIG-1196: the line's eval at a glance; walks only once the engine was started. */}
      {/* SIG-1197: short panels drop the sparkline so at least one line shows. */}
      {showSparkline && panelSize.height >= ENGINE_SPARKLINE_MIN_HEIGHT ? <EvalSparkline walk={started} /> : null}

      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 min-w-0 flex-1 overflow-auto">
          {lines.map((line) => (
            <div
              key={line.multipv}
              className="flex min-h-7 w-full items-start gap-2 border-b border-studio-border-subtle px-2 py-1"
              onContextMenu={(event) => {
                event.preventDefault();
                setLineMenu({
                  x: event.clientX,
                  y: event.clientY,
                  multipv: line.multipv,
                  pvUci: [...line.pvUci],
                });
              }}
            >
              <button
                type="button"
                aria-expanded={expandedLines.has(line.multipv)}
                title={tPanels(locale, expandedLines.has(line.multipv) ? "engine.collapseLine" : "engine.expandLine")}
                onClick={() =>
                  setExpandedLines((current) => {
                    const next = new Set(current);
                    if (next.has(line.multipv)) {
                      next.delete(line.multipv);
                    } else {
                      next.add(line.multipv);
                    }
                    return next;
                  })
                }
                // SIG-1195: only the best line gets a solid chip; the others are
                // outlined, so the strongest element is the evaluation that matters.
                className={`h-5 min-w-12 shrink-0 rounded-[5px] px-1.5 text-center text-dense font-semibold leading-5 tabular-nums ${
                  line.multipv === 1
                    ? scoreNumber(line, side) >= 0
                      ? "bg-studio-win text-studio-loss ring-1 ring-studio-border-strong"
                      : "bg-studio-loss text-studio-win ring-1 ring-studio-border-strong"
                    : scoreNumber(line, side) >= 0
                      ? "text-studio-fg ring-1 ring-studio-border-strong"
                      : "text-studio-muted ring-1 ring-studio-border-strong"
                }`}
              >
                {formatScore(line, side)}
              </button>
              <span
                data-engine-pv
                className={`min-w-0 flex-1 text-dense leading-5 tabular-nums text-studio-fg ${
                  expandedLines.has(line.multipv) ? "" : "truncate whitespace-nowrap"
                }`}
                onMouseLeave={(event) => {
                  if (isInsideEnginePv(event.relatedTarget)) {
                    return;
                  }
                  setEnginePreview(null);
                }}
              >
                {line.pvSan.length === 0 ? (
                  <span className="text-studio-faint">…</span>
                ) : (
                  line.pvSan.map((san, index) => {
                    const key = `${line.multipv}-${index}`;
                    const ucis = line.pvUci.slice(0, index + 1);
                    const hovered = previewKey === key;
                    const number = moveNumberLabel(fen, side, index);
                    const tone =
                      index < PV_EMPHASIS
                          ? "text-studio-fg"
                          : "text-studio-muted";
                    return (
                      <button
                        key={key}
                        type="button"
                        className={`mr-1 ${index === 0 ? "font-semibold" : ""} ${hovered ? "text-studio-accent-text underline" : `${tone} hover:text-studio-accent-text hover:underline`}`}
                        onMouseEnter={() => {
                          const preview = positionAfterPv(fen, ucis);
                          if (!preview) {
                            return;
                          }
                          setEnginePreview({ ...preview, key });
                        }}
                        onMouseLeave={(event) => {
                          if (isInsideEnginePv(event.relatedTarget)) {
                            return;
                          }
                          setEnginePreview(null);
                        }}
                        onClick={() => playUciSequence(ucis)}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setLineMenu({
                            x: event.clientX,
                            y: event.clientY,
                            multipv: line.multipv,
                            pvUci: [...line.pvUci],
                          });
                        }}
                      >
                        {number ? <span className="mr-0.5 font-normal text-studio-faint">{number}</span> : null}
                        {formatSanAtPly(san, moveNotation, side, index)}
                      </button>
                    );
                  })
                )}
              </span>
            </div>
          ))}
          {Array.from({ length: placeholderLines }, (_, index) => (
            <div
              key={`empty-${index}`}
              aria-hidden="true"
              className="flex h-7 items-center gap-2 border-b border-studio-border-subtle px-2"
            >
              <span className="h-5 min-w-12 animate-pulse rounded-[5px] bg-studio-hover-strong" />
              <span
                className="h-2.5 animate-pulse rounded bg-studio-hover-strong"
                style={{ width: `${70 - index * 12}%` }}
              />
            </div>
          ))}
        </div>
      </div>
      {lineMenu ? (
        <EngineLineContextMenu
          menu={lineMenu}
          fen={fen}
          locale={locale}
          onClose={() => setLineMenu(null)}
        />
      ) : null}
    </div>
  );
}
