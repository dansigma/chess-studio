"use client";

import { memo, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { moveNumberForPath, plyColor, type Path, type TreeNode } from "@/src/chess/tree";
import { formatMoveSuffix, formatPositionGlyphs } from "@/src/chess/nags";
import { formatSan, type MoveNotation } from "@/src/chess/move-notation";
import type { SiteLocale } from "@/src/i18n/locale.ts";
import { tPanels } from "@/src/i18n/studio-panel-strings.ts";
import type { NotationDensity } from "./notation-density";
import { pathKey } from "./notation-format";
import { useReviewTier } from "@/src/store/review-labels";
import { useStudioStore } from "@/src/store/studio-store";
import { tierName } from "@/src/chess/review-strings";
import { TierBadge } from "./review/TierBadge";

/**
 * SIG-1193: variation depth at which lines stop being indented blocks and
 * flow inline in parentheses (Lichess convention). Depth 1 = a variation of
 * the mainline. Keeping depth 2+ inline means a depth-1 block reads as one
 * paragraph, so a line resuming after a sub-variation can no longer be
 * mistaken for a new sibling line.
 */
export const INLINE_FROM_DEPTH = 2;

/** SIG-1193: weight by depth — mainline 600, first-level variations 500, deeper 400. */
export function moveWeightClass(depth: number): string {
  if (depth <= 0) {
    return "font-semibold";
  }
  return depth === 1 ? "font-medium" : "font-normal";
}

/**
 * SIG-1193: container class of one variation at `depth` (>= 1). Compact
 * density keeps every variation inline, as before.
 */
export function variationClass(depth: number, density: NotationDensity): string {
  if (density === "compact" || depth >= INLINE_FROM_DEPTH) {
    return "inline text-dense text-studio-muted before:ml-0.5 before:text-studio-faint before:content-['('] after:mr-1 after:text-studio-faint after:content-[')']";
  }
  return "relative my-0.5 ml-1.5 flex basis-full flex-wrap items-baseline gap-0.5 border-l-2 border-studio-border-strong pl-2 text-body text-studio-fg-secondary";
}

function CommentText({ text }: { text?: string }) {
  if (!text) {
    return null;
  }
  // SIG-957: inline-block so long comments wrap inside the flex row instead
  // of stretching it; break-words keeps long tokens (e.g. pasted analysis)
  // from overflowing the notation pane.
  return <span className="inline-block max-w-full break-words px-1 text-studio-comment">{text}</span>;
}

// SIG-857: memoized — a notation tree renders N tokens; without memo every
// token re-rendered on each cursor move. Props are primitives + stable
// callbacks; the style prop is hoisted from the panel root so all tokens
// share one subscription instead of N.
// SIG-919: compact density reuses the same token — the button keeps click,
// right-click annotate, the same active highlight, and an aria-current step
// marker so highlighting/annotations/keyboard parity holds in both modes.
const MoveToken = memo(function MoveToken({
  san,
  color,
  nags,
  path,
  active,
  style,
  compact = false,
  depth = 0,
  block = false,
  onClick,
  onAnnotate,
}: {
  san: string;
  color: "w" | "b";
  nags?: number[];
  /** SIG-1219: `pathKey` of the move; looks up its Game Review tier badge. */
  path: string;
  active: boolean;
  style: MoveNotation;
  compact?: boolean;
  /** SIG-1193: 0 = mainline; sets the weight via `moveWeightClass`. */
  depth?: number;
  /** SIG-1193: fills its table cell (table density). */
  block?: boolean;
  onClick: () => void;
  onAnnotate: (event: React.MouseEvent) => void;
}) {
  const suffix = formatMoveSuffix(nags);
  const rest = formatPositionGlyphs(nags);
  const tier = useReviewTier(path);
  const locale = useStudioStore((state) => state.settings.locale);
  return (
    <span className={block ? "flex min-w-0 items-center" : "inline-flex items-center"}>
      <button
        type="button"
        onClick={onClick}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onAnnotate(event);
        }}
        aria-current={active ? "step" : undefined}
        className={`rounded-[5px] leading-5 ${moveWeightClass(depth)} ${
          compact ? "px-0.5 py-px" : "px-1 py-0.5"
        } ${block ? "min-w-0 flex-1 truncate text-left" : ""} ${
          active ? "bg-studio-accent-move text-studio-accent-fg" : "hover:bg-studio-hover-strong"
        }`}
      >
        {formatSan(san, style, color)}
        {suffix}
        {tier ? (
          <>
            {/* SIG-1219: same height as the 20px text line, so rows keep their density. */}
            <TierBadge label={tier} size={compact ? 12 : 14} className="ml-1 align-middle" />
            <span className="sr-only"> {tierName(locale, tier)}</span>
          </>
        ) : null}
      </button>
      {rest ? <span className="pl-0.5 text-dense text-studio-muted">{rest}</span> : null}
    </span>
  );
});

/**
 * SIG-1193: collapsed variations leave a "+N" pill in their place, so the
 * reader sees that (and how many) lines are hidden.
 */
function HiddenVariationsPill({
  count,
  locale,
  onClick,
}: {
  count: number;
  locale: SiteLocale;
  onClick: () => void;
}) {
  const label =
    count === 1
      ? tPanels(locale, "notation.panel.hiddenVariations.one", { count })
      : tPanels(locale, "notation.panel.hiddenVariations.other", { count });
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-expanded={false}
      onClick={onClick}
      className="mx-0.5 inline-flex h-[18px] items-center rounded-full bg-studio-hover px-1.5 text-caption font-medium tabular-nums text-studio-muted hover:bg-studio-hover-strong hover:text-studio-fg"
    >
      +{count}
    </button>
  );
}

/**
 * SIG-1193: the hide control. On a block it sits on the block's left rule
 * (the rule reads as the line's spine); inline it is a small chevron.
 */
function CollapseToggle({
  placement,
  locale,
  onClick,
}: {
  placement: "gutter" | "inline";
  locale: SiteLocale;
  onClick: () => void;
}) {
  const label = tPanels(locale, "notation.panel.hideVariations");
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-expanded
      onClick={onClick}
      className={
        placement === "gutter"
          ? "absolute -left-[9px] top-[5px] grid h-4 w-4 place-items-center rounded-full border border-studio-border-strong bg-studio-panel text-studio-faint hover:text-studio-fg"
          : "mx-0.5 inline-grid h-4 w-4 place-items-center rounded text-studio-faint hover:bg-studio-hover-strong hover:text-studio-fg"
      }
    >
      <ChevronDown size={11} strokeWidth={2.25} />
    </button>
  );
}

type LineProps = {
  nodes: TreeNode[];
  parentPath: Path;
  startFen: string;
  collapsed: Set<string>;
  currentPath: string;
  style: MoveNotation;
  density?: NotationDensity;
  goPath: (path: Path) => void;
  onToggleCollapse: (key: string) => void;
  onAnnotate: (path: Path, event: React.MouseEvent) => void;
  continuation?: boolean;
  /** SIG-1193: 0 for the mainline, n for a line inside an n-deep variation. */
  depth?: number;
  locale?: SiteLocale;
};

/**
 * SIG-1193: the sibling variations at one branch point. Shared by the free
 * flow (`Line`) and the table density, which always renders them as blocks.
 */
function Variations({
  variations,
  parent,
  number,
  color,
  depth,
  forceBlock = false,
  props,
}: {
  variations: TreeNode[];
  parent: Path;
  number: number;
  color: "w" | "b";
  /** Depth of these variations (the line they branch from + 1). */
  depth: number;
  forceBlock?: boolean;
  props: Omit<LineProps, "nodes" | "parentPath" | "continuation" | "depth">;
}) {
  const { startFen, collapsed, currentPath, style, density = "normal", goPath, onToggleCollapse, onAnnotate, locale = "en" } = props;
  const containerClass = forceBlock ? variationClass(1, "normal") : variationClass(depth, density);
  const inline = !forceBlock && (density === "compact" || depth >= INLINE_FROM_DEPTH);
  const collapseKey = pathKey(parent);
  return (
    <>
      {variations.map((variation, index) => {
        const variationPath = [...parent, index + 1];
        return (
          <span key={variation.id} className={containerClass}>
            {index === 0 && !inline ? (
              <CollapseToggle placement="gutter" locale={locale} onClick={() => onToggleCollapse(collapseKey)} />
            ) : null}
            <CommentText text={variation.commentBefore} />
            <span className="px-0.5 tabular-nums text-studio-faint">
              {number}
              {color === "b" ? "..." : "."}
            </span>
            <MoveToken
              san={variation.san}
              color={color}
              nags={variation.nags}
              path={pathKey(variationPath)}
              active={currentPath === pathKey(variationPath)}
              style={style}
              compact={density === "compact" || inline}
              depth={forceBlock ? 1 : depth}
              onClick={() => goPath(variationPath)}
              onAnnotate={(event) => onAnnotate(variationPath, event)}
            />
            <CommentText text={variation.comment} />
            {variation.children.length > 0 ? (
              <Line
                nodes={variation.children}
                parentPath={variationPath}
                startFen={startFen}
                collapsed={collapsed}
                currentPath={currentPath}
                style={style}
                density={forceBlock && density === "table" ? "normal" : density}
                goPath={goPath}
                onToggleCollapse={onToggleCollapse}
                onAnnotate={onAnnotate}
                continuation
                depth={forceBlock ? 1 : depth}
                locale={locale}
              />
            ) : null}
          </span>
        );
      })}
    </>
  );
}

export const Line = memo(function Line({
  nodes,
  parentPath,
  startFen,
  collapsed,
  currentPath,
  style,
  density = "normal",
  goPath,
  onToggleCollapse,
  onAnnotate,
  continuation = false,
  depth = 0,
  locale = "en",
}: LineProps) {
  if (!nodes[0]) {
    return null;
  }

  const items: ReactNode[] = [];
  let cursor = nodes;
  let parent = parentPath;
  let resumeAfterVariation = false;
  const childDepth = depth + 1;
  const childrenInline = density === "compact" || childDepth >= INLINE_FROM_DEPTH;

  while (cursor[0]) {
    const node = cursor[0];
    const nodePath = [...parent, 0];
    const plyIndex = nodePath.length;
    const color = plyColor(startFen, plyIndex);
    const number = moveNumberForPath(startFen, plyIndex);
    const variations = cursor.slice(1);
    const collapseKey = pathKey(parent);
    const hideVariations = collapsed.has(collapseKey);
    // SIG-1193: after a block of variations the line resumes on a new row;
    // its number steps up from faint so the resumption reads as the same line.
    const numberTone = resumeAfterVariation && !childrenInline ? "text-studio-muted" : "text-studio-faint";

    if (color === "w") {
      items.push(
        <span key={`n-${pathKey(nodePath)}`} className={`px-0.5 tabular-nums ${numberTone}`}>
          {number}.
        </span>,
      );
    } else if (((parent.length === parentPath.length && !continuation) || resumeAfterVariation) && color === "b") {
      items.push(
        <span key={`n-${pathKey(nodePath)}`} className={`px-0.5 tabular-nums ${numberTone}`}>
          {number}...
        </span>,
      );
    }

    items.push(<CommentText key={`${node.id}-before`} text={node.commentBefore} />);
    items.push(
      <MoveToken
        key={node.id}
        san={node.san}
        color={color}
        nags={node.nags}
        path={pathKey(nodePath)}
        active={currentPath === pathKey(nodePath)}
        style={style}
        compact={density === "compact" || depth >= INLINE_FROM_DEPTH}
        depth={depth}
        onClick={() => goPath(nodePath)}
        onAnnotate={(event) => onAnnotate(nodePath, event)}
      />,
    );
    items.push(<CommentText key={`${node.id}-after`} text={node.comment} />);

    if (variations.length > 0) {
      if (hideVariations) {
        items.push(
          <HiddenVariationsPill
            key={`${node.id}-hidden`}
            count={variations.length}
            locale={locale}
            onClick={() => onToggleCollapse(collapseKey)}
          />,
        );
      } else {
        // SIG-1193: an inline control between two moves breaks the line, so
        // in normal density only blocks (depth 1) carry a hide control; deeper
        // lines are already compact. Compact density keeps one per branch,
        // since every variation there is inline.
        if (density === "compact") {
          items.push(
            <CollapseToggle
              key={`${node.id}-toggle`}
              placement="inline"
              locale={locale}
              onClick={() => onToggleCollapse(collapseKey)}
            />,
          );
        }
        items.push(
          <Variations
            key={`${node.id}-vars`}
            variations={variations}
            parent={parent}
            number={number}
            color={color}
            depth={childDepth}
            props={{ startFen, collapsed, currentPath, style, density, goPath, onToggleCollapse, onAnnotate, locale }}
          />,
        );
      }
    }

    resumeAfterVariation = !hideVariations && variations.length > 0;
    parent = nodePath;
    cursor = node.children;
  }

  return <>{items}</>;
});

/**
 * SIG-1193: `table` density. The mainline sits in a three-column grid
 * (number · White · Black); comments and variations break the grid as
 * full-width rows, and a Black move that resumes after a break shows "…"
 * in the White cell (Chess.com / Lichess column view).
 */
export const TableMainline = memo(function TableMainline({
  nodes,
  startFen,
  collapsed,
  currentPath,
  style,
  goPath,
  onToggleCollapse,
  onAnnotate,
  locale = "en",
}: Omit<LineProps, "parentPath" | "density" | "continuation" | "depth">) {
  const rows: ReactNode[] = [];
  let white: ReactNode = null;
  let black: ReactNode = null;
  let rowNumber: number | null = null;
  let cursor = nodes;
  let parent: Path = [];

  const flush = () => {
    if (rowNumber === null) {
      return;
    }
    rows.push(
      <div key={`row-${rowNumber}-${rows.length}`} className="contents">
        <span className="py-0.5 pr-1 text-right tabular-nums text-studio-faint">{rowNumber}.</span>
        {white ?? <span className="px-1 py-0.5 text-studio-faint">…</span>}
        {black ?? <span />}
        <span />
      </div>,
    );
    white = null;
    black = null;
    rowNumber = null;
  };

  const fullRow = (key: string, child: ReactNode) => {
    rows.push(
      <div key={key} className="col-span-4 flex flex-wrap items-baseline gap-0.5 py-0.5 pl-2">
        {child}
      </div>,
    );
  };

  while (cursor[0]) {
    const node = cursor[0];
    const nodePath = [...parent, 0];
    const plyIndex = nodePath.length;
    const color = plyColor(startFen, plyIndex);
    const number = moveNumberForPath(startFen, plyIndex);
    const variations = cursor.slice(1);
    const collapseKey = pathKey(parent);
    const hideVariations = collapsed.has(collapseKey);

    if (color === "w" || rowNumber !== number) {
      flush();
    }
    if (node.commentBefore) {
      flush();
      fullRow(`${node.id}-before`, <CommentText text={node.commentBefore} />);
    }
    rowNumber = number;
    const token = (
      <MoveToken
        key={node.id}
        san={node.san}
        color={color}
        nags={node.nags}
        path={pathKey(nodePath)}
        active={currentPath === pathKey(nodePath)}
        style={style}
        depth={0}
        block
        onClick={() => goPath(nodePath)}
        onAnnotate={(event) => onAnnotate(nodePath, event)}
      />
    );
    if (color === "w") {
      white = token;
    } else {
      black = token;
    }

    const breaks = Boolean(node.comment) || variations.length > 0;
    if (breaks) {
      flush();
      if (node.comment) {
        fullRow(`${node.id}-after`, <CommentText text={node.comment} />);
      }
      if (variations.length > 0) {
        fullRow(
          `${node.id}-vars`,
          hideVariations ? (
            <HiddenVariationsPill count={variations.length} locale={locale} onClick={() => onToggleCollapse(collapseKey)} />
          ) : (
            <Variations
              variations={variations}
              parent={parent}
              number={number}
              color={color}
              depth={1}
              forceBlock
              props={{ startFen, collapsed, currentPath, style, density: "table", goPath, onToggleCollapse, onAnnotate, locale }}
            />
          ),
        );
      }
    }

    parent = nodePath;
    cursor = node.children;
  }
  flush();

  // Fixed move columns (Lichess-like width) plus a filler column, so wide
  // panels do not push Black's move far from White's; variation rows span all.
  return (
    <div className="grid grid-cols-[2.25rem_minmax(0,7.5rem)_minmax(0,7.5rem)_1fr] items-center gap-x-1">{rows}</div>
  );
});
