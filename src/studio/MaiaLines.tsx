"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { formatSanAtPly } from "@/src/chess/move-notation";
import { fenKey } from "@/src/chess/tree";
import { resolveMaiaChances, resolveMaiaRun } from "@/src/engine/maia/calibration";
import { HISTORY_LENGTH } from "@/src/engine/maia/encode";
import { MaiaClient } from "@/src/engine/maia/maia-client";
import { MAIA_ELOS, type MaiaChances, type MaiaChancesMode, type MaiaMove, type MaiaPosition } from "@/src/engine/maia/protocol";
import { tPanels, type StudioPanelStringKey } from "@/src/i18n/studio-panel-strings";
import type { SiteLocale } from "@/src/i18n/locale";
import { ResultBar } from "./ui/ResultBar";
import { useActiveLineFens } from "@/src/store/hooks";
import { useStudioStore } from "@/src/store/studio-store";

/** Waits for quick navigation through a line to settle before asking the worker. */
const DEBOUNCE_MS = 120;

type Analysis =
  | { position: MaiaPosition; moves: MaiaMove[]; chances: MaiaChances | null }
  | { position: MaiaPosition; failed: true };
type ShownMove = MaiaMove & { label: string };

function ratingLabel(elo: number): string {
  return elo === MAIA_ELOS.at(-1) ? `${elo}+` : String(elo);
}

/** The position's chances for two players of the chosen rating, as the explorer's result bar. */
function MaiaChancesBar({ chances, rating, mode, locale }: {
  chances: MaiaChances;
  rating: string;
  mode: MaiaChancesMode;
  locale: SiteLocale;
}) {
  const percent = (value: number) => Math.round(value * 100);
  const title = tPanels(locale, `maia.chances.title.${mode}`, { rating });
  const label = tPanels(locale, "maia.chances.label", {
    white: percent(chances.white),
    draw: percent(chances.draw),
    black: percent(chances.black),
  });
  return (
    // role="img": the bar's own aria-label sits on a role-less span (colour mode), which screen readers skip.
    <div role="img" aria-label={`${title}: ${label}`} title={title} className="border-b border-studio-border-subtle px-2 pb-1.5 pt-0.5">
      {/* Full panel width: a 6% segment still fits "6%", unlike the narrow explorer column. */}
      <ResultBar white={chances.white} draws={chances.draw} black={chances.black} minLabelPercent={6} />
    </div>
  );
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
  const mode = useStudioStore((state) => state.settings.maiaChancesMode);
  const lines = useStudioStore((state) => state.settings.maiaLines);
  const setElo = useStudioStore((state) => state.setMaiaElo);
  const fens = useActiveLineFens();
  const run = useMemo(() => resolveMaiaRun(elo, mode), [elo, mode]);
  const position = useMemo<MaiaPosition>(
    () => ({ fens: fens.slice(-HISTORY_LENGTH), elo: run.modelElo, lines }),
    [fens, run, lines],
  );
  const currentFen = position.fens.at(-1);
  const cachedEval = useStudioStore((state) => (currentFen ? state.evalByFen[fenKey(currentFen)] : undefined));
  const engineActive = useStudioStore((state) => state.engineActive);
  const rating = ratingLabel(elo);
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
        ({ moves, chances }) => {
          if (stale) return;
          setAnalysis({ position, moves, chances });
        },
        () => { if (!stale) setAnalysis({ position, failed: true }); },
      );
    }, DEBOUNCE_MS);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [position]);

  // Only a result for exactly this position (same FENs, rating, mode and count) is shown.
  const current = analysis?.position === position ? analysis : undefined;
  const chances = useMemo(() => {
    if (!current || !("chances" in current) || !current.chances) return null;
    if (!currentFen) return current.chances;
    return resolveMaiaChances(current.chances, currentFen, mode, elo, cachedEval, engineActive);
  }, [current, currentFen, mode, elo, cachedEval, engineActive]);
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
      <div className="flex items-center gap-2 px-2 py-1">
        <span className="text-dense font-semibold text-studio-fg">Maia</span>
        <span className="min-w-0 flex-1 truncate text-caption text-studio-faint">{tPanels(locale, "maia.subtitle")}</span>
        <select
          aria-label={tPanels(locale, "maia.rating")}
          title={tPanels(locale, "maia.rating")}
          value={elo}
          onChange={(event) => setElo(Number(event.target.value))}
          className="h-5 shrink-0 cursor-pointer rounded-[5px] border-0 bg-transparent pl-1 text-dense font-semibold tabular-nums text-studio-muted ring-1 ring-studio-border-strong hover:text-studio-fg"
        >
          {MAIA_ELOS.map((elo) => <option key={elo} value={elo}>{ratingLabel(elo)}</option>)}
        </select>
      </div>
      {chances ? (
        <MaiaChancesBar chances={chances} rating={rating} mode={mode} locale={locale} />
      ) : null}
      {status ? <p role="status" className="px-2 py-1 text-dense text-studio-muted">{tPanels(locale, status)}</p> : null}
      {shown.map(({ uci, prob, label }) => {
        const percent = `${Math.round(prob * 100)}%`;
        return (
          <button
            key={uci}
            type="button"
            onClick={() => onPlay([uci])}
            title={tPanels(locale, "maia.moveTitle", { percent, rating, move: label })}
            className="relative flex min-h-7 w-full items-center gap-2 overflow-hidden border-b border-studio-border-subtle px-2 py-1 text-left text-dense hover:bg-studio-hover-strong"
          >
            {/* How often players of this rating choose the move, as a bar behind the row. */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-0 bg-studio-accent/10"
              style={{ width: percent }}
            />
            <span className="relative h-5 min-w-12 shrink-0 rounded-[5px] px-1.5 text-center font-semibold leading-5 tabular-nums text-studio-fg ring-1 ring-studio-border-strong">
              {percent}
            </span>
            <span className="relative font-semibold text-studio-fg">{label}</span>
          </button>
        );
      })}
    </section>
  );
}
