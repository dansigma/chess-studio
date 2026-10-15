"use client";

import { useEffect, useMemo, useState } from "react";
import {
  compareThreats,
  computePositionFacts,
  computeThreats,
  type Color,
  type Threat,
  type ThreatSet,
} from "@/src/chess/facts";
import type { BoardMarks } from "@/src/chess/marks";
import { isNullMoveToken } from "@/src/chess/null-move";
import { getFenAt, getLastMove, getNodeAt, goBack } from "@/src/chess/tree";
import { useActiveBoard } from "@/src/store/hooks";
import { useStudioStore } from "@/src/store/studio-store";
import {
  PIECE_GLYPH,
  PIECE_NAME_KEY,
  insightsLabel,
  insightsLangFrom,
  type InsightsLabelKey,
} from "./insights-labels";
import {
  TAG_LABEL,
  THREAT_KIND_LABEL,
  buildConcepts,
  buildPieceRows,
  marksForThreat,
  marksForThreats,
  mergeBoardMarks,
} from "./insights-model";
import { useInsightMarks } from "./useInsightMarks";

type Tab = "pieces" | "threats" | "concepts";
type Which = "before" | "after";

const TABS: Array<{ id: Tab; label: InsightsLabelKey }> = [
  { id: "pieces", label: "tabPieces" },
  { id: "threats", label: "tabThreats" },
  { id: "concepts", label: "tabConcepts" },
];

const ROW =
  "flex w-full items-center gap-2 px-3 py-1 text-left text-dense hover:bg-studio-hover focus-visible:bg-studio-hover";

export function PositionInsightsPanel() {
  const board = useActiveBoard();
  const setupMode = useStudioStore((state) => state.setupMode);
  const setEnginePreview = useStudioStore((state) => state.setEnginePreview);
  const [tab, setTab] = useState<Tab>("pieces");
  const [which, setWhich] = useState<Which>("after");
  const [hover, setHover] = useState<BoardMarks | null>(null);
  const lang = useMemo(
    () => insightsLangFrom(typeof navigator === "undefined" ? undefined : navigator.language),
    [],
  );
  const t = (key: InsightsLabelKey) => insightsLabel(lang, key);

  const fen = getFenAt(board.tree, board.path);
  const node = getNodeAt(board.tree, board.path);
  const uci = node?.uci && !isNullMoveToken(node.uci) ? node.uci : null;
  const parentPath = goBack(board.path);
  const beforeFen = uci ? getFenAt(board.tree, parentPath) : null;
  const parentMove = uci ? getLastMove(board.tree, parentPath) : null;
  const parentMoveKey = parentMove ? `${parentMove.from}${parentMove.to}` : "";

  // The choice is per position: moving through the game returns to "after".
  const [whichFen, setWhichFen] = useState(fen);
  if (whichFen !== fen) {
    setWhichFen(fen);
    setWhich("after");
    setHover(null);
  }

  const facts = useMemo(() => computePositionFacts(fen), [fen]);
  const comparison = useMemo(
    () => (beforeFen && uci ? compareThreats(beforeFen, uci) : null),
    [beforeFen, uci],
  );
  const current = useMemo(() => (comparison ? null : computeThreats(fen)), [comparison, fen]);
  const pieceRows = useMemo(() => buildPieceRows(facts), [facts]);
  const concepts = useMemo(() => buildConcepts(facts), [facts]);

  const showingBefore = tab === "threats" && which === "before" && comparison !== null;
  const shownFen = showingBefore && beforeFen ? beforeFen : fen;

  // "Before move" borrows the board's existing preview slot to show the
  // position the threats were computed on; it is dropped on any other state.
  const previewFen = showingBefore && !setupMode ? beforeFen : null;
  useEffect(() => {
    if (!previewFen) {
      return;
    }
    const key = `insights:${previewFen}`;
    setEnginePreview({ fen: previewFen, lastMove: parentMoveKey, key });
    return () => {
      if (useStudioStore.getState().enginePreview?.key === key) {
        setEnginePreview(null);
      }
    };
  }, [previewFen, parentMoveKey, setEnginePreview]);

  const baseMarks = useMemo<BoardMarks | null>(() => {
    if (tab !== "threats") {
      return null;
    }
    if (comparison) {
      return which === "before"
        ? marksForThreats(comparison.before.threats, "R")
        : mergeBoardMarks([
            marksForThreats(comparison.after.threats, "R"),
            marksForThreats(comparison.created.threats, "B"),
          ]);
    }
    return current ? marksForThreats(current.threats, "R") : null;
  }, [tab, which, comparison, current]);

  useInsightMarks(setupMode ? null : shownFen, hover ?? baseMarks);

  function hoverProps(marks: BoardMarks) {
    return {
      onMouseEnter: () => setHover(marks),
      onMouseLeave: () => setHover(null),
      onFocus: () => setHover(marks),
      onBlur: () => setHover(null),
    };
  }

  function sideName(color: Color): string {
    return color === "w" ? t("white") : t("black");
  }

  function threatRows(threats: Threat[], badge?: Map<string, InsightsLabelKey>, color: "R" | "B" = "R") {
    return threats.map((threat) => (
      <li key={threat.id}>
        <button type="button" className={ROW} {...hoverProps(marksForThreat(threat, color))}>
          <span className={`font-semibold ${color === "R" ? "text-studio-danger" : "text-studio-accent"}`}>
            {t(THREAT_KIND_LABEL[threat.kind])}
          </span>
          <span className="tabular-nums text-studio-muted">
            {threat.from}→{threat.to}
          </span>
          {badge?.has(threat.id) ? (
            <span className="ml-auto text-caption text-studio-faint">{t(badge.get(threat.id) as InsightsLabelKey)}</span>
          ) : null}
        </button>
      </li>
    ));
  }

  function threatBlock(title: string, set: ThreatSet, badge?: Map<string, InsightsLabelKey>, color: "R" | "B" = "R") {
    return (
      <section>
        <h3 className="px-3 py-2 text-caption uppercase tracking-wide text-studio-faint">{title}</h3>
        {set.status === "in-check" ? (
          <p className="px-3 pb-2 text-dense text-studio-faint">{t("inCheck")}</p>
        ) : set.status === "game-over" ? (
          <p className="px-3 pb-2 text-dense text-studio-faint">{t("gameOver")}</p>
        ) : set.threats.length === 0 ? (
          <p className="px-3 pb-2 text-dense text-studio-faint">{t("noThreats")}</p>
        ) : (
          <ul>{threatRows(set.threats, badge, color)}</ul>
        )}
      </section>
    );
  }

  function body() {
    if (setupMode) {
      return <p className="px-3 py-4 text-dense text-studio-faint">{t("emptySetup")}</p>;
    }
    if (!facts.valid) {
      return <p className="px-3 py-4 text-dense text-studio-faint">{t("emptyInvalid")}</p>;
    }
    if (tab === "pieces") {
      return (["w", "b"] as const).map((color) => (
        <section key={color}>
          <h3 className="px-3 py-2 text-caption uppercase tracking-wide text-studio-faint">{sideName(color)}</h3>
          <ul>
            {pieceRows
              .filter((row) => row.color === color)
              .map((row) => (
                <li key={row.id}>
                  <button type="button" className={ROW} {...hoverProps(row.marks)}>
                    <span aria-hidden="true" className="w-4 text-center">
                      {PIECE_GLYPH[row.color][row.type]}
                    </span>
                    <span>{t(PIECE_NAME_KEY[row.type])}</span>
                    <span className="tabular-nums text-studio-muted">{row.square}</span>
                    <span className="ml-auto flex flex-wrap justify-end gap-1">
                      {row.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded bg-studio-hover px-1 text-caption text-studio-warning-fg"
                        >
                          {t(TAG_LABEL[tag])}
                        </span>
                      ))}
                    </span>
                  </button>
                </li>
              ))}
          </ul>
        </section>
      ));
    }
    if (tab === "threats") {
      if (!comparison) {
        return current
          ? threatBlock(`${t("currentPosition")} · ${sideName(current.by)}`, current)
          : null;
      }
      const neutralized = new Map<string, InsightsLabelKey>(
        comparison.neutralized.map((threat) => [threat.id, "neutralized"]),
      );
      const exposed = new Map<string, InsightsLabelKey>(
        comparison.exposed.map((threat) => [threat.id, "exposed"]),
      );
      return (
        <>
          <div
            role="group"
            aria-label={t("tabThreats")}
            className="flex gap-1 border-b border-studio-border-subtle px-3 py-2"
          >
            {(["before", "after"] as const).map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={which === id}
                onClick={() => {
                  setHover(null);
                  setWhich(id);
                }}
                className={`rounded px-2 py-1 text-dense ${
                  which === id
                    ? "bg-studio-hover-strong font-semibold text-studio-fg"
                    : "text-studio-muted hover:bg-studio-hover"
                }`}
              >
                {t(id === "before" ? "beforeMove" : "afterMove")}
              </button>
            ))}
          </div>
          {which === "before"
            ? threatBlock(
                `${t("threatsAgainst")} · ${sideName(comparison.before.by)}`,
                comparison.before,
                neutralized,
              )
            : (
              <>
                {threatBlock(
                  `${t("threatsRemaining")} · ${sideName(comparison.after.by)}`,
                  comparison.after,
                  exposed,
                )}
                {threatBlock(
                  `${t("threatsCreated")} · ${sideName(comparison.mover)}`,
                  comparison.created,
                  undefined,
                  "B",
                )}
              </>
            )}
        </>
      );
    }
    return concepts.length === 0 ? (
      <p className="px-3 py-4 text-dense text-studio-faint">{t("noConcepts")}</p>
    ) : (
      <ul className="py-1">
        {concepts.map((item) => (
          <li key={item.id}>
            <button type="button" className={ROW} {...hoverProps(item.marks)}>
              {item.color ? (
                <span aria-hidden="true" className="w-4 text-center">
                  {PIECE_GLYPH[item.color].k}
                </span>
              ) : (
                <span className="w-4" />
              )}
              <span>{t(item.label)}</span>
              <span className="ml-auto tabular-nums text-studio-muted">{item.squares.join(" ")}</span>
            </button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-studio-panel text-body text-studio-fg">
      <div role="tablist" aria-label={t("title")} className="flex items-center gap-1 border-b border-studio-border-subtle px-2 py-1.5">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => {
              setHover(null);
              setTab(item.id);
            }}
            className={`rounded px-2 py-1 text-dense ${
              tab === item.id
                ? "bg-studio-hover-strong font-semibold text-studio-fg"
                : "text-studio-muted hover:bg-studio-hover"
            }`}
          >
            {t(item.label)}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="min-h-0 flex-1 overflow-auto" onMouseLeave={() => setHover(null)}>
        {body()}
      </div>
    </div>
  );
}
