"use client";

import { useEffect, useRef, useState } from "react";
import { Cpu, Pause, Play } from "lucide-react";
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
import { IconButton } from "./ui/Button";
import { Badge, Stepper } from "./ui/Controls";

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
  const [engineName, engineDetail] = ENGINE_LABEL.split(" · ");

  return (
    <div className="flex h-full flex-col bg-studio-panel text-body text-studio-fg">
      <div className="flex items-center gap-2 border-b border-studio-border px-2 py-1.5">
        <IconButton
          label={paused || !info.running ? "Start engine" : "Pause engine"}
          active={info.running && !paused}
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
        >
          {paused || !info.running ? <Play size={14} fill="currentColor" /> : <Pause size={14} fill="currentColor" />}
        </IconButton>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="truncate font-semibold">{engineName}</span>
          {engineDetail ? <Badge>{engineDetail}</Badge> : null}
        </div>
        <div className="relative">
          <button
            type="button"
            aria-expanded={coresOpen}
            className={`flex h-7 items-center gap-1 rounded-md px-1.5 text-dense text-studio-muted hover:bg-studio-hover-strong hover:text-studio-fg ${
              coresOpen ? "bg-studio-hover-strong text-studio-fg" : ""
            }`}
            onClick={() => setCoresOpen((open) => !open)}
            title={`${threads} CPU cores`}
          >
            <Cpu size={14} />
            <span className="tabular-nums">{threads}</span>
          </button>
          {coresOpen ? (
            <>
            <button
              className="fixed inset-0 z-10 cursor-default"
              aria-label="Close CPU cores"
              onClick={() => setCoresOpen(false)}
            />
            <div className="absolute right-0 top-8 z-20 w-60 rounded-[9px] border border-studio-border-strong bg-studio-elevated p-3 shadow-2xl">
              <div className="mb-2 flex items-center justify-between text-dense text-studio-muted">
                <span>CPU cores</span>
                <span className="font-semibold tabular-nums text-studio-fg">{threads}</span>
              </div>
              <input
                type="range"
                min={1}
                max={maxCores}
                value={Math.min(threads, maxCores)}
                onChange={(event) => setEngineThreads(Number(event.target.value))}
                className="w-full accent-studio-accent"
              />
              {!supportsEngineThreads() ? (
                <p className="mt-2 text-caption text-studio-warning-fg">
                  This browser is not cross-origin isolated, so Stockfish can only use 1 thread.
                </p>
              ) : (
                <p className="mt-2 text-caption text-studio-faint">{maxCores} available</p>
              )}
            </div>
            </>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-2 border-b border-studio-border px-2 py-1.5">
        <Stepper
          label="Depth"
          value={
            <span>
              {info.depth}
              <span className="text-studio-faint"> / {depthTarget}</span>
            </span>
          }
          canDecrement={depthTarget > MIN_DEPTH}
          canIncrement={depthTarget < MAX_DEPTH}
          onDecrement={() => setEngineDepth(depthTarget - 1)}
          onIncrement={() => setEngineDepth(depthTarget + 1)}
        />
        <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5 truncate text-caption text-studio-faint">
          {info.running && !paused ? (
            <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-studio-success" aria-hidden="true" />
          ) : null}
          <span className="truncate">{status}</span>
        </div>
        <Stepper
          label="Lines"
          value={multiPv}
          canDecrement={multiPv > MIN_LINES}
          canIncrement={multiPv < MAX_LINES}
          onDecrement={() => setMultiPv(multiPv - 1)}
          onIncrement={() => setMultiPv(multiPv + 1)}
        />
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="relative w-1.5 shrink-0 overflow-hidden border-r border-studio-border-strong bg-studio-loss">
          <div
            className="absolute bottom-0 left-0 right-0 bg-studio-win transition-[height] duration-300"
            style={{ height: `${bar}%` }}
          />
        </div>
        <div className="min-h-0 min-w-0 flex-1 overflow-auto">
          {lines.map((line) => (
            <div
              key={line.multipv}
              className="flex w-full items-start gap-3 border-b border-studio-border-subtle px-3 py-1.5"
            >
              <span
                className={`mt-0.5 min-w-14 rounded-[5px] border px-1.5 py-0.5 text-center text-dense font-semibold tabular-nums ${
                  scoreNumber(line, side) >= 0
                    ? "border-studio-border-strong bg-studio-win text-studio-loss"
                    : "border-studio-border-strong bg-studio-loss text-studio-win"
                }`}
              >
                {formatScore(line, side)}
              </span>
              <span
                data-engine-pv
                className="flex-1 font-mono text-dense leading-5 text-studio-fg"
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
                        className={`mr-1 ${index === 0 ? "font-bold" : ""} ${hovered ? "text-studio-accent-text underline" : `${tone} hover:text-studio-accent-text hover:underline`}`}
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
              className="flex items-center gap-3 border-b border-studio-border-subtle px-3 py-2"
            >
              <span className="h-5 min-w-14 animate-pulse rounded-[5px] bg-studio-hover-strong" />
              <span
                className="h-2.5 animate-pulse rounded bg-studio-hover-strong"
                style={{ width: `${70 - index * 12}%` }}
              />
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
