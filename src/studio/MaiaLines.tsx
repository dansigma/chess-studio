"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { formatSanAtPly } from "@/src/chess/move-notation";
import { HISTORY_LENGTH } from "@/src/engine/maia/encode";
import { MaiaClient } from "@/src/engine/maia/maia-client";
import { MAIA_ELOS, type MaiaMove, type MaiaPosition } from "@/src/engine/maia/protocol";
import { tPanels, type StudioPanelStringKey } from "@/src/i18n/studio-panel-strings";
import { useActiveLineFens } from "@/src/store/hooks";
import { useStudioStore } from "@/src/store/studio-store";

/** Waits for quick navigation through a line to settle before asking the worker. */
const DEBOUNCE_MS = 120;

type Analysis = { position: MaiaPosition; moves: MaiaMove[] } | { position: MaiaPosition; failed: true };
type ShownMove = MaiaMove & { label: string };

/** Whole percentages that always add up to 100 (largest-remainder rounding). */
function roundedWdl(wdl: MaiaMove["wdl"]) {
  const scaled = wdl.map((probability) => probability * 100);
  const percentages = scaled.map(Math.floor);
  const remainder = 100 - percentages.reduce((sum, value) => sum + value, 0);
  const order = [0, 1, 2].sort((a, b) =>
    (scaled[b] - percentages[b]) - (scaled[a] - percentages[a]));
  for (const index of order.slice(0, remainder)) percentages[index]++;
  const [win, draw, loss] = percentages;
  return { win, draw, loss };
}

function statusKey(current: Analysis | undefined): StudioPanelStringKey | null {
  if (!current) return "maia.loading";
  if ("failed" in current) return "maia.error";
  if (current.moves.length === 0) return "maia.noMoves";
  return null;
}

export function MaiaLines({ onPlay }: { onPlay: (moves: string[]) => void }) {
  const locale = useStudioStore((state) => state.settings.locale);
  const moveNotation = useStudioStore((state) => state.settings.moveNotation);
  const elo = useStudioStore((state) => state.settings.maiaElo);
  const lines = useStudioStore((state) => state.settings.maiaLines);
  const setElo = useStudioStore((state) => state.setMaiaElo);
  const fens = useActiveLineFens();
  const position = useMemo(() => ({ fens: fens.slice(-HISTORY_LENGTH), elo, lines }), [fens, elo, lines]);
  const client = useRef<MaiaClient | null>(null);
  const [analysis, setAnalysis] = useState<Analysis>();

  useEffect(() => () => {
    client.current?.dispose();
    client.current = null;
  }, []);

  useEffect(() => {
    let stale = false;
    const timer = setTimeout(() => {
      client.current ??= new MaiaClient();
      client.current.analyze(position).then(
        ({ moves }) => { if (!stale) setAnalysis({ position, moves }); },
        () => { if (!stale) setAnalysis({ position, failed: true }); },
      );
    }, DEBOUNCE_MS);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [position]);

  // Only a result for exactly this position (same FENs, rating and count) is shown.
  const current = analysis?.position === position ? analysis : undefined;
  const status = statusKey(current);
  const shown = useMemo<ShownMove[]>(() => {
    const fen = position.fens.at(-1);
    if (!current || !("moves" in current) || !fen) return [];
    try {
      const board = new Chess(fen);
      const side = board.turn();
      return current.moves.flatMap((move) => {
        const played = board.move(move.uci);
        board.undo();
        return [{ ...move, label: formatSanAtPly(played.san, moveNotation, side, 0) }];
      });
    } catch {
      return [];
    }
  }, [current, position, moveNotation]);

  return (
    <section className="border-t border-studio-border-strong">
      <div className="flex items-center justify-between gap-2 px-2 py-1.5">
        <h3 className="text-dense font-semibold text-studio-fg">Maia 3 · {elo}</h3>
        <select
          aria-label={tPanels(locale, "maia.rating")}
          value={elo}
          onChange={(event) => setElo(Number(event.target.value))}
          className="rounded border border-studio-border-strong bg-studio-elevated px-1 text-dense text-studio-fg"
        >
          {MAIA_ELOS.map((rating) => <option key={rating}>{rating}</option>)}
        </select>
      </div>
      {status ? <p role="status" className="px-2 py-1 text-dense text-studio-muted">{tPanels(locale, status)}</p> : null}
      {shown.map(({ uci, prob, wdl, label }) => (
        <button
          key={uci}
          type="button"
          onClick={() => onPlay([uci])}
          className="flex w-full flex-wrap items-center justify-between gap-x-2 border-b border-studio-border-subtle px-2 py-1 text-left text-dense hover:bg-studio-hover-strong"
        >
          <span className="font-semibold text-studio-fg">
            {label} · {Math.round(prob * 100)}%
          </span>
          <span className="tabular-nums text-studio-muted">{tPanels(locale, "maia.wdl", roundedWdl(wdl))}</span>
        </button>
      ))}
      <p className="px-2 py-1 text-caption text-studio-faint">Maia-3 · CSSLab, University of Toronto</p>
    </section>
  );
}
