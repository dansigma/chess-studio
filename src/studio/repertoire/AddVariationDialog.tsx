"use client";

import { Chess } from "chess.js";
import { useEffect, useId, useMemo, useState } from "react";
import { Chessboard } from "react-chessboard";
import { createPortal } from "react-dom";
import { boardCoordinateOptions, boardSquareStyles } from "@/src/chess/board-themes";
import type { CountsBook } from "@/src/chess/opening-book-counts-format";
import { piecesForSet } from "@/src/chess/piece-sets";
import { buildVariationBook, VARIATION_LEVELS, type VariationBookOptions } from "@/src/chess/variation-book";
import type { VariationMergeDecisions } from "@/src/chess/repertoire-merge";
import { fenKey } from "@/src/chess/tree";
import type { SiteLocale } from "@/src/i18n/locale";
import { tRepertoire } from "@/src/i18n/repertoire-strings";
import { tPanels } from "@/src/i18n/studio-panel-strings";
import { loadCountsBook } from "@/src/lib/opening-book-counts";
import { localizeOpeningName } from "@/src/lib/opening-names";
import { catalogTree, loadCatalog, searchCatalog, type CatalogEntry, type CatalogNode } from "@/src/lib/openings-catalog";
import type { BoardOrientation, BoardSession, StudioState } from "@/src/store/slices/types";
import { useStudioStore } from "@/src/store/studio-store";
import { openBoardPanel } from "../dock-api";
import { Button } from "../ui/Button";
import { SearchInput, Segmented } from "../ui/Controls";
import { Dialog } from "../ui/Dialog";
import { EcoBadge } from "../ui/EcoBadge";

type Level = VariationBookOptions["level"];
const LEVELS = Object.keys(VARIATION_LEVELS) as Level[];
const COLORS = ["white", "black"] as const;

function lineName(line: CatalogEntry, locale: SiteLocale) {
  return localizeOpeningName(line.name, locale, line.eco);
}

function lineMoves(line: CatalogEntry) {
  const chess = new Chess();
  return line.uci.map((uci, index) => {
    const { san } = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    return index % 2 === 0 ? `${index / 2 + 1}. ${san}` : san;
  }).join(" ");
}

type LinePickerProps = {
  locale: SiteLocale;
  selected: CatalogEntry | null;
  onSelect: (line: CatalogEntry) => void;
};

function LineOption({ line, alternate, locale, selected, onSelect }: LinePickerProps & {
  line: CatalogEntry;
  alternate?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected === line}
      onClick={() => onSelect(line)}
      className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left hover:bg-studio-hover-subtle aria-pressed:bg-studio-accent-soft aria-pressed:text-studio-accent-text"
    >
      <EcoBadge code={line.eco} />
      <span>
        {lineName(line, locale)}
        {alternate && <span className="block text-caption">{lineMoves(line)}</span>}
      </span>
    </button>
  );
}

function CatalogBranch({ node, ...picker }: LinePickerProps & { node: CatalogNode }) {
  const [expanded, setExpanded] = useState(false);
  if (node.children.length === 0 && node.entries.length === 1) {
    return <LineOption line={node.line} {...picker} />;
  }

  return (
    <div>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
        className="w-full rounded px-2 py-1.5 text-left font-medium hover:bg-studio-hover-subtle"
      >
        <span aria-hidden="true" className="mr-2">{expanded ? "▾" : "▸"}</span>
        {node.name}
      </button>
      {expanded && (
        <div className="ml-2 border-l border-studio-border pl-1">
          {node.entries.map((line) => (
            <LineOption key={line.uci.join(" ")} line={line} alternate={node.entries.length > 1} {...picker} />
          ))}
          {node.children.map((child) => <CatalogBranch key={child.name} node={child} {...picker} />)}
        </div>
      )}
    </div>
  );
}

function LinePreview({ line, color, locale }: { line: CatalogEntry; color: BoardOrientation; locale: SiteLocale }) {
  const id = useId().replace(/[^A-Za-z0-9_-]/g, "");
  const boardTheme = useStudioStore((state) => state.settings.boardTheme);
  const pieceSet = useStudioStore((state) => state.settings.pieceSet);
  const showCoordinates = useStudioStore((state) => state.settings.showCoordinates);
  const theme = boardSquareStyles(boardTheme);
  const moves = useMemo(() => lineMoves(line), [line]);

  return (
    <div className="space-y-2">
      <p className="flex items-start gap-2 font-medium text-studio-fg">
        <EcoBadge code={line.eco} /> {lineName(line, locale)}
      </p>
      <div className="aspect-square w-full max-w-40 overflow-hidden rounded-lg" role="img" aria-label={tRepertoire(locale, "variation.position")}>
        <Chessboard options={{
          id: `variation-preview-${id}`,
          position: line.fen,
          boardOrientation: color,
          showNotation: showCoordinates,
          showAnimations: false,
          allowDragging: false,
          allowDrawingArrows: false,
          lightSquareStyle: theme.light,
          darkSquareStyle: theme.dark,
          ...boardCoordinateOptions(boardTheme),
          pieces: piecesForSet(pieceSet),
        }} />
      </div>
      <p className="text-dense tabular-nums">{moves}</p>
    </div>
  );
}

function VariationConflictDialog({
  pending,
  locale,
  onComplete,
  onCancel,
}: {
  pending: NonNullable<StudioState["pendingVariationMerge"]>;
  locale: SiteLocale;
  onComplete: (board: BoardSession | null) => void;
  onCancel: () => void;
}) {
  const groupId = useId();
  const [selection, setSelection] = useState<{ pending: typeof pending; decisions: VariationMergeDecisions }>();
  const decisions = selection?.pending === pending ? selection.decisions : {};

  return createPortal(
    <Dialog
      title={tRepertoire(locale, "variation.mergeTitle")}
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>{tRepertoire(locale, "variation.mergeCancel")}</Button>
          <Button variant="primary" onClick={() => onComplete(useStudioStore.getState().resolveVariationMerge(decisions))}>
            {tRepertoire(locale, "variation.mergeConfirm")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {pending.conflicts.map(({ fen, moveNumber, mineSan, bookSan }, index) => {
          const key = fenKey(fen);
          return (
            <fieldset key={key} className="rounded border border-studio-border px-3 pb-2">
              <legend className="px-1 text-studio-fg">
                {tRepertoire(locale, "variation.mergeConflict", { number: moveNumber, mine: mineSan, book: bookSan })}
              </legend>
              {(["mine", "book"] as const).map((choice) => (
                <label key={choice} className="flex cursor-pointer items-center gap-2 py-1">
                  <input
                    type="radio"
                    name={`${groupId}-${index}`}
                    className="accent-studio-accent"
                    checked={(decisions[key] ?? "mine") === choice}
                    onChange={() => setSelection({ pending, decisions: { ...decisions, [key]: choice } })}
                  />
                  {tRepertoire(locale, choice === "mine" ? "variation.keepMine" : "variation.useBook")}
                </label>
              ))}
            </fieldset>
          );
        })}
      </div>
    </Dialog>,
    document.body,
  );
}

export function AddVariationDialog({ defaultColor, onClose }: { defaultColor: BoardOrientation; onClose: () => void }) {
  const locale = useStudioStore((state) => state.settings.locale);
  const pending = useStudioStore((state) => state.pendingVariationMerge);
  const levelName = useId();
  const [entries, setEntries] = useState<readonly CatalogEntry[] | null>();
  const [counts, setCounts] = useState<CountsBook | null>();
  const [bookAttempt, setBookAttempt] = useState(0);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<CatalogEntry | null>(null);
  const [color, setColor] = useState(defaultColor);
  const [level, setLevel] = useState<Level>("beginner");

  useEffect(() => {
    let active = true;
    void loadCatalog().then(
      (catalog) => { if (active) setEntries(catalog); },
      () => { if (active) setEntries(null); },
    );
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    void loadCountsBook({ retry: bookAttempt > 0 }).then((book) => { if (active) setCounts(book); });
    return () => { active = false; };
  }, [bookAttempt]);

  const families = useMemo(() => entries ? catalogTree(entries, locale) : [], [entries, locale]);
  const searching = query.trim().length > 0;
  const results = useMemo(
    () => entries && searching ? searchCatalog(entries, query, locale).slice(0, 100) : [],
    [entries, searching, query, locale],
  );
  const preview = useMemo(
    () => counts && selected ? buildVariationBook(counts, { startUci: selected.uci, color, level }) : null,
    [counts, selected, color, level],
  );
  const picker = { locale, selected, onSelect: setSelected };

  function addVariation() {
    if (!selected || !preview) return;
    finish(useStudioStore.getState().addVariationToRepertoire(preview.tree, color, lineName(selected, locale)));
  }

  function finish(board: BoardSession | null) {
    if (board) openBoardPanel(board.id, board.title);
    if (!useStudioStore.getState().pendingVariationMerge) onClose();
  }

  if (pending) {
    return (
      <VariationConflictDialog
        pending={pending}
        locale={locale}
        onComplete={finish}
        onCancel={() => {
          useStudioStore.getState().cancelVariationMerge();
          onClose();
        }}
      />
    );
  }

  return createPortal(
    <Dialog
      title={tRepertoire(locale, "variation.title")}
      onClose={onClose}
      width="w-full md:w-[48rem]"
      fullScreenOnMobile
      footer={
        <Button variant="primary" disabled={!preview} onClick={addVariation}>
          {tRepertoire(locale, "variation.add")}
        </Button>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className="min-w-0 space-y-2">
          <SearchInput
            value={query}
            onChange={setQuery}
            label={tRepertoire(locale, "variation.search")}
            placeholder={tRepertoire(locale, "variation.search")}
            clearLabel={tRepertoire(locale, "variation.clear")}
          />
          <div className="max-h-[35dvh] overflow-y-auto rounded border border-studio-border md:max-h-[28rem]">
            {entries === undefined && <p role="status" className="p-2">{tRepertoire(locale, "variation.catalogLoading")}</p>}
            {entries === null && <p role="alert" className="p-2">{tRepertoire(locale, "variation.catalogUnavailable")}</p>}
            {entries && searching && results.length === 0 && <p className="p-2">{tRepertoire(locale, "variation.noResults")}</p>}
            {searching
              ? results.map((line) => <LineOption key={line.uci.join(" ")} line={line} {...picker} />)
              : families.map((node) => <CatalogBranch key={node.name} node={node} {...picker} />)}
          </div>
        </div>
        <div className="min-w-0 space-y-3">
          {selected && <LinePreview line={selected} color={color} locale={locale} />}
          <Segmented
            ariaLabel={tPanels(locale, "repertoire.colorSwitch")}
            value={color}
            options={COLORS.map((value) => ({ value, label: tPanels(locale, `repertoire.color.${value}`) }))}
            onChange={setColor}
          />
          <fieldset className="space-y-1">
            <legend className="font-medium text-studio-fg">{tRepertoire(locale, "variation.level")}</legend>
            {LEVELS.map((option) => (
              <label key={option} className="flex cursor-pointer items-start gap-2 rounded px-2 py-1 hover:bg-studio-hover-subtle">
                <input
                  type="radio"
                  name={levelName}
                  checked={level === option}
                  onChange={() => setLevel(option)}
                  aria-label={tRepertoire(locale, `variation.${option}`)}
                  aria-describedby={`${levelName}-${option}`}
                  className="mt-1 accent-studio-accent"
                />
                <span>
                  <span className="block text-studio-fg">{tRepertoire(locale, `variation.${option}`)}</span>
                  <span id={`${levelName}-${option}`} className="block text-caption">
                    {tRepertoire(locale, `variation.${option}Help`)}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
          <div role="status" aria-busy={counts === undefined}>
            {counts === undefined && tRepertoire(locale, "variation.bookLoading")}
            {counts === null && tRepertoire(locale, "variation.bookUnavailable")}
            {preview && (
              <>
                <p className="font-medium text-studio-fg">{tRepertoire(locale, "variation.preview", { lines: preview.lines, moves: preview.userMoves })}</p>
                {preview.capped && <p className="text-caption">{tRepertoire(locale, "variation.capped")}</p>}
              </>
            )}
          </div>
          {counts === null && (
            <Button variant="secondary" size="sm" onClick={() => {
              setCounts(undefined);
              setBookAttempt((attempt) => attempt + 1);
            }}>
              {tRepertoire(locale, "variation.retry")}
            </Button>
          )}
        </div>
      </div>
    </Dialog>,
    document.body,
  );
}
