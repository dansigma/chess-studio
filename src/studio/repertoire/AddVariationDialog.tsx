"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Chess } from "chess.js";
import { Chessboard, type ChessboardOptions } from "react-chessboard";
import { createPortal } from "react-dom";
import { boardSquareStyles } from "@/src/chess/board-themes";
import { bookKey } from "@/src/chess/opening-book";
import type { CountsBook } from "@/src/chess/opening-book-counts-format";
import { piecesForSet } from "@/src/chess/piece-sets";
import { buildVariationBook, VARIATION_LEVELS, type VariationBookOptions } from "@/src/chess/variation-book";
import type { VariationMergeDecisions } from "@/src/chess/repertoire-merge";
import { fenKey } from "@/src/chess/tree";
import type { SiteLocale } from "@/src/i18n/locale";
import { tRepertoire } from "@/src/i18n/repertoire-strings";
import { tPanels } from "@/src/i18n/studio-panel-strings";
import { loadCountsBook } from "@/src/lib/opening-book-counts";
import { catalogTree, loadCatalog, searchCatalog, type CatalogEntry, type CatalogNode } from "@/src/lib/openings-catalog";
import type { BoardOrientation, BoardSession, StudioState } from "@/src/store/slices/types";
import { useStudioStore } from "@/src/store/studio-store";
import { openBoardPanel } from "../dock-api";
import { Button } from "../ui/Button";
import { SearchInput, Segmented } from "../ui/Controls";
import { Dialog } from "../ui/Dialog";
import { EcoBadge } from "../ui/EcoBadge";
import { catalogPositionIndex, replayCatalogPath } from "./catalog-positions";
import { groupSearchResults, lineMovesFrom, lineName, type SearchGroup } from "./group-search-results";

type Level = VariationBookOptions["level"];
const LEVELS = Object.keys(VARIATION_LEVELS) as Level[];
const COLORS = ["white", "black"] as const;
const PROMOTIONS = {
  q: "panels.board.promoteQueen",
  r: "panels.board.promoteRook",
  b: "panels.board.promoteBishop",
  n: "panels.board.promoteKnight",
} as const;

type LinePickerProps = {
  locale: SiteLocale;
  selected: CatalogEntry | null;
  onSelect: (line: CatalogEntry) => void;
};

function LineOption({ line, alternate, continuation, locale, selected, onSelect }: LinePickerProps & {
  line: CatalogEntry;
  alternate?: boolean;
  continuation?: { moves: string; showEco: boolean };
}) {
  return (
    <button
      type="button"
      aria-pressed={selected === line}
      aria-label={continuation
        ? `${continuation.showEco ? `${line.eco} ` : ""}${lineName(line, locale)} — ${continuation.moves}`
        : undefined}
      onClick={() => onSelect(line)}
      className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left hover:bg-studio-hover-subtle aria-pressed:bg-studio-accent-soft aria-pressed:text-studio-accent-text"
    >
      {(!continuation || continuation.showEco) && <EcoBadge code={line.eco} />}
      {continuation ? <span>{continuation.moves}</span> : (
        <span>
          {lineName(line, locale)}
          {alternate && <span className="block text-caption">{lineMovesFrom(line)}</span>}
        </span>
      )}
    </button>
  );
}

function SearchResultGroup({
  group: { name, lines, prefixLength },
  positionMoves,
  ...picker
}: LinePickerProps & { group: SearchGroup<CatalogEntry>; positionMoves?: (line: CatalogEntry) => string }) {
  const first = lines[0];
  if (lines.length === 1 && !positionMoves) return <LineOption line={first} {...picker} />;

  const showRowEco = lines.some((line) => line.eco !== first.eco);
  return (
    <div role="group" aria-label={name}>
      <p className="flex items-start gap-2 px-2 py-1.5 font-medium">
        {!showRowEco && <EcoBadge code={first.eco} />}
        {name}
      </p>
      <div className="ml-2 border-l border-studio-border pl-1">
        {lines.map((line) => (
          <LineOption
            key={`${line.eco} ${line.uci.join(" ")}`}
            line={line}
            continuation={{
              moves: positionMoves
                ? positionMoves(line)
                : lineMovesFrom(line, line.uci.length === prefixLength ? 0 : prefixLength),
              showEco: showRowEco,
            }}
            {...picker}
          />
        ))}
      </div>
    </div>
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
          {node.children.map((child) => <CatalogBranch key={child.sourceName} node={child} {...picker} />)}
        </div>
      )}
    </div>
  );
}

function LinePreview({ line, title, moves, fen, color, locale, onMove }: {
  line: CatalogEntry | null;
  title: string | null;
  moves: string | null;
  fen: string;
  color: BoardOrientation;
  locale: SiteLocale;
  onMove: (uci: string) => void;
}) {
  const id = useId().replace(/[^A-Za-z0-9_-]/g, "");
  const boardTheme = useStudioStore((state) => state.settings.boardTheme);
  const pieceSet = useStudioStore((state) => state.settings.pieceSet);
  const theme = boardSquareStyles(boardTheme);
  const [promotion, setPromotion] = useState<{ fen: string; line: CatalogEntry | null; uci: string } | null>(null);
  const pendingPromotion = promotion?.fen === fen && promotion.line === line ? promotion : null;
  if (promotion && !pendingPromotion) setPromotion(null);

  const turn = fen.split(" ")[1];
  const onPieceDrop: NonNullable<ChessboardOptions["onPieceDrop"]> = ({ sourceSquare, targetSquare }) => {
    if (!targetSquare || pendingPromotion) return false;
    const chess = new Chess(fen);
    try {
      const move = chess.move({ from: sourceSquare, to: targetSquare, promotion: "q" });
      if (move.promotion) {
        setPromotion({ fen, line, uci: move.lan.slice(0, 4) });
        return false;
      }
      onMove(move.lan);
      return true;
    } catch {
      return false;
    }
  };

  return (
    <div className="space-y-2">
      {title && (
        <p className="flex items-start gap-2 font-medium text-studio-fg">
          {line && <EcoBadge code={line.eco} />} {title}
        </p>
      )}
      <div className="aspect-square w-full max-w-[22rem] overflow-hidden rounded-lg" role="img" aria-label={tRepertoire(locale, line ? "variation.position" : "variation.boardPosition")}>
        <Chessboard options={{
          id: `variation-preview-${id}`,
          position: fen,
          boardOrientation: color,
          showNotation: false,
          showAnimations: false,
          canDragPiece: ({ piece }) => !pendingPromotion && piece.pieceType[0] === turn,
          onPieceDrop,
          allowDrawingArrows: false,
          lightSquareStyle: theme.light,
          darkSquareStyle: theme.dark,
          pieces: piecesForSet(pieceSet),
        }} />
      </div>
      {pendingPromotion && (
        <div role="group" aria-label={tPanels(locale, "panels.board.promoteDialog")} className="flex flex-wrap gap-2">
          {Object.entries(PROMOTIONS).map(([piece, label]) => (
            <Button key={piece} size="sm" onClick={() => {
              setPromotion(null);
              onMove(pendingPromotion.uci + piece);
            }}>
              {tPanels(locale, label)}
            </Button>
          ))}
          <Button size="sm" onClick={() => setPromotion(null)}>{tRepertoire(locale, "variation.mergeCancel")}</Button>
        </div>
      )}
      {moves && <p className="text-dense tabular-nums">{moves}</p>}
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
  const [anchor, setAnchor] = useState<string[]>([]);
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
  const exploring = anchor.length > 0;
  const path = useMemo(() => replayCatalogPath(anchor), [anchor]);
  const positionIndex = entries && exploring ? catalogPositionIndex(entries) : null;
  const positionKey = path.keys.at(-1);
  const position = useMemo(() => {
    if (!positionIndex || !positionKey) return null;
    const plies = new Map(positionIndex.matches.get(positionKey)?.map(({ line, ply }) => [line, ply]));
    return { plies, lines: [...plies.keys()] };
  }, [positionIndex, positionKey]);
  const positionPlies = position?.plies;
  const positionName = positionIndex?.deepestEnding(path.keys);
  const results = useMemo(() => {
    if (!entries) return [];
    if (position) {
      const { lines, plies } = position;
      return groupSearchResults(
        searching ? searchCatalog(lines, query, locale) : lines,
        locale,
        (line) => plies.get(line)!,
      );
    }
    return searching ? groupSearchResults(searchCatalog(entries, query, locale).slice(0, 100), locale) : [];
  }, [entries, searching, query, locale, position]);
  const [previousResults, setPreviousResults] = useState({ results, anchor });
  if (results !== previousResults.results || anchor !== previousResults.anchor) {
    setPreviousResults({ results, anchor });
    // Text search may select a preview. Board navigation always shows the anchor.
    if (searching && anchor === previousResults.anchor) setSelected(results[0]?.lines[0] ?? null);
  }
  const fen = selected?.fen ?? path.fen;
  const positionMoves = positionPlies && positionIndex ? (line: CatalogEntry) => {
    const ply = positionPlies.get(line)!;
    return ply === line.uci.length
      ? tRepertoire(locale, "variation.currentPosition")
      : lineMovesFrom(line, ply, positionIndex.notation.get(line));
  } : undefined;
  const startUci = selected?.uci ?? (exploring ? anchor : null);
  const moves = useMemo(() => startUci ? lineMovesFrom({ uci: startUci }) : null, [startUci]);
  const namedLine = selected ?? positionName;
  const title = namedLine ? lineName(namedLine, locale) : moves;
  // The book builder counts the played prefix even if the position has no games.
  const missingAnchorGames = Boolean(counts && exploring && !selected && !counts.positionFor(bookKey(fen))?.moves.length);
  const preview = useMemo(
    () => counts && startUci && !missingAnchorGames ? buildVariationBook(counts, { startUci, color, level }) : null,
    [counts, startUci, missingAnchorGames, color, level],
  );
  const noBookGames = missingAnchorGames || (!selected && preview !== null && (preview.userMoves === 0 || preview.lines === 0));
  const canAdd = Boolean(preview && !noBookGames);
  const picker = { locale, selected, onSelect: setSelected };

  function playMove(uci: string) {
    setAnchor([...(selected?.uci ?? anchor), uci]);
    setSelected(null);
  }

  function undoMove() {
    if (selected) setSelected(null);
    else setAnchor(anchor.slice(0, -1));
  }

  function startOver() {
    if (exploring) setAnchor([]);
    setSelected(null);
  }

  function addVariation() {
    if (!canAdd || !preview || !title) return;
    finish(useStudioStore.getState().addVariationToRepertoire(preview.tree, color, title));
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
      width="w-full md:w-[60rem]"
      fullScreenOnMobile
      footer={
        <Button variant="primary" disabled={!canAdd} onClick={addVariation}>
          {tRepertoire(locale, "variation.add")}
        </Button>
      }
    >
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="min-w-0 space-y-2">
          <SearchInput
            value={query}
            onChange={setQuery}
            label={tRepertoire(locale, "variation.search")}
            placeholder={tRepertoire(locale, "variation.search")}
            clearLabel={tRepertoire(locale, "variation.clear")}
          />
          {positionName && (
            <p className="font-medium text-studio-fg">
              {tRepertoire(locale, "variation.youAreAt", { name: lineName(positionName, locale) })}
            </p>
          )}
          <div className="max-h-[35dvh] overflow-y-auto rounded border border-studio-border md:max-h-[36rem]">
            {entries === undefined && <p role="status" className="p-2">{tRepertoire(locale, "variation.catalogLoading")}</p>}
            {entries === null && <p role="alert" className="p-2">{tRepertoire(locale, "variation.catalogUnavailable")}</p>}
            {entries && (searching || exploring) && results.length === 0 && (
              <p className="p-2">
                {tRepertoire(locale, positionPlies?.size === 0 ? "variation.noContinuation" : "variation.noResults")}
              </p>
            )}
            {searching || exploring
              ? results.map((group) => <SearchResultGroup key={group.name} group={group} positionMoves={positionMoves} {...picker} />)
              : families.map((node) => <CatalogBranch key={node.sourceName} node={node} {...picker} />)}
          </div>
        </div>
        <div className="min-w-0 space-y-3">
          <LinePreview line={selected} title={title} moves={moves} fen={fen} color={color} locale={locale} onMove={playMove} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={!selected && !exploring} onClick={undoMove}>
              {tRepertoire(locale, "variation.undoMove")}
            </Button>
            <Button size="sm" disabled={!selected && !exploring} onClick={startOver}>
              {tRepertoire(locale, "variation.startOver")}
            </Button>
          </div>
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
            {noBookGames && tRepertoire(locale, "variation.noBookGames")}
            {preview && !noBookGames && (
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
