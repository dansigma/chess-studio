"use client";

import { useEffect, useRef, useState } from "react";
import { Cpu, Minus, Pause, Play, Plus } from "lucide-react";
import {
  ENGINE_LABEL,
  MAX_DEPTH,
  MAX_LINES,
  MIN_DEPTH,
  MIN_LINES,
  formatNps,
  formatScore,
  maxHardwareThreads,
  positionAfterPv,
  scoreNumber,
  evalBarPercent,
  StockfishEngine,
  supportsEngineThreads,
  type EngineInfo,
} from "@/src/engine/stockfish-client";
import { useActiveFen, useSideToMove } from "@/src/store/hooks";
import { useStudioStore } from "@/src/store/studio-store";
import { formatSanAtPly } from "@/src/chess/move-notation";

function isInsideEnginePv(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest("[data-engine-pv]"));
}

function Stepper({
  label,
  value,
  display,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center gap-1 text-[11px] text-studio-muted">
      <button
        type="button"
        className="flex h-5 w-5 items-center justify-center rounded hover:bg-studio-hover disabled:opacity-30"
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
        aria-label={`Decrease ${label}`}
      >
        <Minus size={12} />
      </button>
      <span className="min-w-28 px-1 text-center tabular-nums text-studio-fg">{display}</span>
      <button
        type="button"
        className="flex h-5 w-5 items-center justify-center rounded hover:bg-studio-hover disabled:opacity-30"
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
        aria-label={`Increase ${label}`}
      >
        <Plus size={12} />
      </button>
    </div>
  );
}

export function EnginePanel() {
  const fen = useActiveFen();
  const depthTarget = useStudioStore((state) => state.settings.engineDepth);
  const multiPv = useStudioStore((state) => state.settings.multiPv);
  const threads = useStudioStore((state) => state.settings.engineThreads);
  const setEngineDepth = useStudioStore((state) => state.setEngineDepth);
  const setMultiPv = useStudioStore((state) => state.setMultiPv);
  const setEngineThreads = useStudioStore((state) => state.setEngineThreads);
  const playUciSequence = useStudioStore((state) => state.playUciSequence);
  const setEnginePreview = useStudioStore((state) => state.setEnginePreview);
  const setEngineEval = useStudioStore((state) => state.setEngineEval);
  const putEvalCache = useStudioStore((state) => state.putEvalCache);
  const previewKey = useStudioStore((state) => state.enginePreview?.key ?? null);
  const moveNotation = useStudioStore((state) => state.settings.moveNotation);
  const side = useSideToMove();
  const engineRef = useRef<StockfishEngine | null>(null);
  const [paused, setPaused] = useState(false);
  const [runId, setRunId] = useState(0);
  const [coresOpen, setCoresOpen] = useState(false);
  const [info, setInfo] = useState<EngineInfo>({
    depth: 0,
    running: false,
    ready: false,
    lines: [],
    nps: 0,
    nodes: 0,
    threaded: false,
    fen: "",
  });

  useEffect(() => {
    const instance = new StockfishEngine();
    engineRef.current = instance;
    instance.start();
    const unsubscribe = instance.subscribe(setInfo);
    return () => {
      unsubscribe();
      instance.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (paused) {
      engineRef.current?.stopSearch();
      return;
    }
    engineRef.current?.analyze(fen, depthTarget, multiPv, threads);
  }, [fen, depthTarget, multiPv, threads, paused, runId]);

  useEffect(() => {
    setEnginePreview(null);
    setEngineEval(null);
    return () => {
      setEnginePreview(null);
      setEngineEval(null);
    };
  }, [fen, setEnginePreview, setEngineEval]);

  const lines = info.fen === fen ? info.lines : [];
  const best = lines[0];
  const evalLabel = formatScore(best, side);
  const evalValue = scoreNumber(best, side);
  const bar = evalBarPercent(evalValue);

  useEffect(() => {
    if (!best) {
      return;
    }
    setEngineEval({ pawns: evalValue, label: evalLabel });
    putEvalCache(fen, { pawns: evalValue, label: evalLabel, depth: info.depth });
  }, [best, evalLabel, evalValue, fen, info.depth, putEvalCache, setEngineEval]);
  const maxCores = info.threaded ? maxHardwareThreads() : 1;
  const nps = formatNps(info.nps);
  const status = !info.ready
    ? "Loading engine…"
    : paused || !info.running
      ? info.depth >= depthTarget && info.depth > 0
        ? "Max. depth reached"
        : "Engine stopped"
      : nps
        ? `Analyzing · ${nps}`
        : "Analyzing…";
  const placeholderLines = Math.max(0, multiPv - lines.length);

  return (
    <div className="flex h-full flex-col bg-studio-panel text-[13px] text-studio-fg">
      <div className="flex items-center gap-2 border-b border-studio-border bg-studio-elevated px-2 py-1.5">
        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded text-studio-fg hover:bg-studio-hover"
          onClick={() => {
            if (info.running && !paused) {
              setPaused(true);
              return;
            }
            if (paused) {
              setPaused(false);
              return;
            }
            setRunId((value) => value + 1);
          }}
          title={paused || !info.running ? "Start engine" : "Pause engine"}
        >
          {paused || !info.running ? <Play size={14} fill="currentColor" /> : <Pause size={14} fill="currentColor" />}
        </button>
        <div className="flex min-w-0 flex-1 items-center rounded border border-studio-border bg-studio-panel px-2 py-1 text-[12px] text-studio-fg">
          <span className="truncate">{ENGINE_LABEL}</span>
        </div>
        <div className="relative">
          <button
            type="button"
            className="flex items-center gap-1 rounded px-1.5 py-1 text-[12px] text-studio-fg hover:bg-studio-hover"
            onClick={() => setCoresOpen((open) => !open)}
            title={`${threads} CPU cores`}
          >
            <Cpu size={14} />
            <span className="tabular-nums">{threads}</span>
          </button>
          {coresOpen ? (
            <div className="absolute right-0 top-8 z-20 w-56 rounded border border-studio-border bg-studio-selected p-3 shadow-xl">
              <div className="mb-2 flex items-center justify-between text-[11px] text-studio-muted">
                <span>CPU cores</span>
                <span className="text-studio-fg">{threads}</span>
              </div>
              <input
                type="range"
                min={1}
                max={maxCores}
                value={Math.min(threads, maxCores)}
                onChange={(event) => setEngineThreads(Number(event.target.value))}
                className="w-full accent-sky-400"
              />
              {!supportsEngineThreads() ? (
                <p className="mt-2 text-[11px] leading-4 text-amber-200/80">
                  This browser is not cross-origin isolated, so Stockfish can only use 1 thread.
                </p>
              ) : (
                <p className="mt-2 text-[11px] text-studio-faint">{maxCores} available</p>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-2 border-b border-studio-border bg-studio-panel px-2 py-1">
        <Stepper
          label="depth"
          value={depthTarget}
          display={`Depth: ${info.depth} / ${depthTarget}`}
          min={MIN_DEPTH}
          max={MAX_DEPTH}
          onChange={setEngineDepth}
        />
        <div className="min-w-0 flex-1 truncate text-center text-[11px] text-studio-faint">{status}</div>
        <div className="flex items-center gap-1 text-[11px] text-studio-muted">
          <span>Lines</span>
          <span className="tabular-nums text-studio-fg">{multiPv}</span>
          <button
            type="button"
            className="flex h-5 w-5 items-center justify-center rounded hover:bg-studio-hover disabled:opacity-30"
            disabled={multiPv <= MIN_LINES}
            onClick={() => setMultiPv(multiPv - 1)}
          >
            <Minus size={12} />
          </button>
          <button
            type="button"
            className="flex h-5 w-5 items-center justify-center rounded hover:bg-studio-hover disabled:opacity-30"
            disabled={multiPv >= MAX_LINES}
            onClick={() => setMultiPv(multiPv + 1)}
          >
            <Plus size={12} />
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="relative w-2 shrink-0 overflow-hidden bg-zinc-900">
          <div className="absolute bottom-0 left-0 right-0 bg-zinc-100" style={{ height: `${bar}%` }} />
        </div>
        <div className="min-h-0 min-w-0 flex-1 overflow-auto">
          {lines.map((line) => (
            <div
              key={line.multipv}
              className="flex w-full items-start gap-3 border-b border-studio-border-subtle px-3 py-1.5"
            >
              <span
                className={`mt-0.5 min-w-12 rounded px-1.5 py-0.5 text-center text-xs font-semibold ${
                  scoreNumber(line, side) >= 0
                    ? "bg-zinc-100 text-zinc-900"
                    : "bg-zinc-900 text-zinc-100"
                }`}
              >
                {formatScore(line, side)}
              </span>
              <span
                data-engine-pv
                className="flex-1 font-mono text-[12px] leading-5 text-studio-fg"
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
                    return (
                      <button
                        key={key}
                        type="button"
                        className={`mr-1 ${hovered ? "text-studio-fg underline" : "hover:text-studio-fg hover:underline"}`}
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
                      >
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
              className="flex items-start gap-3 border-b border-studio-border-subtle px-3 py-1.5 text-studio-faint"
            >
              <span className="min-w-12 px-1.5">–</span>
              <span>…</span>
            </div>
          ))}
        </div>
      </div>
      {evalLabel ? (
        <span className="sr-only">
          Evaluation {evalLabel}
        </span>
      ) : null}
    </div>
  );
}
