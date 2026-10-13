"use client";

import { memo, type ReactNode } from "react";
import { Minus, Plus } from "lucide-react";
import { moveNumberForPath, plyColor, type Path, type TreeNode } from "@/src/chess/tree";
import { formatMoveSuffix, formatPositionGlyphs } from "@/src/chess/nags";
import { formatSan, type MoveNotation } from "@/src/chess/move-notation";
import type { NotationDensity } from "./notation-density";
import { pathKey } from "./notation-format";

function CommentText({ text }: { text?: string }) {
  if (!text) {
    return null;
  }
  return <span className="px-1 text-studio-comment">{text}</span>;
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
  active,
  style,
  compact = false,
  onClick,
  onAnnotate,
}: {
  san: string;
  color: "w" | "b";
  nags?: number[];
  active: boolean;
  style: MoveNotation;
  compact?: boolean;
  onClick: () => void;
  onAnnotate: (event: React.MouseEvent) => void;
}) {
  const suffix = formatMoveSuffix(nags);
  const rest = formatPositionGlyphs(nags);
  return (
    <span className="inline-flex items-center">
      <button
        type="button"
        onClick={onClick}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onAnnotate(event);
        }}
        aria-current={active ? "step" : undefined}
        className={`rounded-[5px] font-medium leading-5 ${
          compact ? "px-0.5 py-px" : "px-1 py-0.5"
        } ${active ? "bg-studio-accent-move text-studio-accent-fg" : "hover:bg-studio-hover-strong"}`}
      >
        {formatSan(san, style, color)}
        {suffix}
      </button>
      {rest ? <span className="pl-0.5 text-dense text-studio-muted">{rest}</span> : null}
    </span>
  );
});

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
}: {
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
}) {
  if (!nodes[0]) {
    return null;
  }

  const items: ReactNode[] = [];
  let cursor = nodes;
  let parent = parentPath;
  let resumeAfterVariation = false;

  while (cursor[0]) {
    const node = cursor[0];
    const nodePath = [...parent, 0];
    const plyIndex = nodePath.length;
    const color = plyColor(startFen, plyIndex);
    const number = moveNumberForPath(startFen, plyIndex);
    const variations = cursor.slice(1);
    const collapseKey = pathKey(parent);
    const hideVariations = collapsed.has(collapseKey);

    if (color === "w") {
      items.push(
        <span key={`n-${pathKey(nodePath)}`} className="px-0.5 text-studio-faint">
          {number}.
        </span>,
      );
    } else if (((parent.length === parentPath.length && !continuation) || resumeAfterVariation) && color === "b") {
      items.push(
        <span key={`n-${pathKey(nodePath)}`} className="px-0.5 text-studio-faint">
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
        active={currentPath === pathKey(nodePath)}
        style={style}
        compact={density === "compact"}
        onClick={() => goPath(nodePath)}
        onAnnotate={(event) => onAnnotate(nodePath, event)}
      />,
    );
    items.push(<CommentText key={`${node.id}-after`} text={node.comment} />);

    if (variations.length > 0) {
      items.push(
        <button
          key={`${node.id}-toggle`}
          type="button"
          title={hideVariations ? "Show variations" : "Hide variations"}
          onClick={() => onToggleCollapse(collapseKey)}
          className="mx-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-studio-hover text-studio-muted hover:bg-studio-hover-strong hover:text-studio-fg"
        >
          {hideVariations ? <Plus size={10} /> : <Minus size={10} />}
        </button>,
      );
    }

    resumeAfterVariation = !hideVariations && variations.length > 0;
    if (!hideVariations) {
      variations.forEach((variation, index) => {
        const variationPath = [...parent, index + 1];
        items.push(
          <span
            key={`${node.id}-var-${variation.id}`}
            className={
              density === "compact"
                ? "inline items-baseline gap-0 text-dense text-studio-muted before:content-['('] after:content-[')']"
                : "my-0.5 ml-1.5 flex basis-full flex-wrap items-center gap-0.5 border-l-2 border-studio-border-strong pl-2 text-dense text-studio-muted"
            }
          >
            <CommentText text={variation.commentBefore} />
            <span className="px-0.5 text-studio-faint">
              {number}
              {color === "b" ? "..." : "."}
            </span>
            <MoveToken
              san={variation.san}
              color={color}
              nags={variation.nags}
              active={currentPath === pathKey(variationPath)}
              style={style}
              compact={density === "compact"}
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
                density={density}
                goPath={goPath}
                onToggleCollapse={onToggleCollapse}
                onAnnotate={onAnnotate}
                continuation
              />
            ) : null}
          </span>,
        );
      });
    }

    parent = nodePath;
    cursor = node.children;
  }

  return <>{items}</>;
});
