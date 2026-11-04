import type { CSSProperties, ReactNode } from "react";
import { REVIEW_TIERS } from "@/src/chess/review-tiers";
import type { ReviewLabel } from "@/src/chess/review";

/** "fill" badges sit in a box that is 34% of the board square; kept for BoardPanel's sizing. */
export const BOARD_BADGE_FRACTION = 0.34;

type Shape = "circle" | "square" | "hex";

/** Family of each tier: good moves are circles, reference tiers rounded squares, errors hexagons. */
export const TIER_SHAPES: Record<ReviewLabel, Shape> = {
  brilliant: "circle",
  great: "circle",
  best: "circle",
  veryGood: "circle",
  decent: "circle",
  book: "square",
  forced: "square",
  inaccuracy: "hex",
  mistake: "hex",
  miss: "hex",
  blunder: "hex",
};

// All glyphs are drawn in one 24x24 box with the same 2.6 stroke weight and a
// glyph height of about 12 units, in `currentColor` (the mark token). No text
// or fonts, so they look the same everywhere, including the PNG export.
const STROKE = { stroke: "currentColor", strokeWidth: 2.6, strokeLinecap: "round", strokeLinejoin: "round", fill: "none" } as const;
const SOLID = { fill: "currentColor" } as const;

/** The `?` of the error tiers, centred on x = 12. */
const QUESTION = (
  <>
    <path d="M8.9 9.2C8.9 7.2 10.2 6 12 6C13.8 6 15.1 7.1 15.1 8.9C15.1 11.9 12 11.7 12 14.3" />
    <circle cx="12" cy="18.1" r="1.45" stroke="none" {...SOLID} />
  </>
);

function bang(x: number): ReactNode {
  return (
    <>
      <path d={`M${x} 6.2V13.2`} />
      <circle cx={x} cy="17.9" r="1.45" stroke="none" {...SOLID} />
    </>
  );
}

/** A scaled `?` whose centre sits at x, with the stroke compensated to stay 2.6 wide. */
function question(x: number, scale: number): ReactNode {
  return (
    <g transform={`translate(${x} 12) scale(${scale}) translate(-12 -12)`} strokeWidth={2.6 / scale}>
      {QUESTION}
    </g>
  );
}

export const TIER_ICONS: Record<ReviewLabel, ReactNode> = {
  // !!
  brilliant: (
    <g {...STROKE}>
      {bang(8.2)}
      {bang(15.8)}
    </g>
  ),
  // !
  great: <g {...STROKE}>{bang(12)}</g>,
  // 5-point star
  best: <polygon points="12,5.2 13.82,10.09 19.04,10.31 14.95,13.56 16.35,18.59 12,15.7 7.65,18.59 9.05,13.56 4.96,10.31 10.18,10.09" {...SOLID} stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />,
  // thick plus
  veryGood: <path {...STROKE} strokeWidth={3} d="M12 6.4V17.6M6.4 12H17.6" />,
  // equals
  decent: <path {...STROKE} strokeWidth={2.8} d="M6.6 9.6H17.4M6.6 14.4H17.4" />,
  // open book: outline + spine
  book: (
    <g {...STROKE} strokeWidth={2.1}>
      <path d="M12 8.4C10.1 7 7.8 6.7 5.6 7.2V16.6C7.8 16.1 10.1 16.4 12 17.8C13.9 16.4 16.2 16.1 18.4 16.6V7.2C16.2 6.7 13.9 7 12 8.4Z" />
      <path d="M12 8.6V17.6" />
    </g>
  ),
  // right arrow
  forced: <path {...STROKE} d="M6 12H17.6M12.6 6.9L17.8 12L12.6 17.1" />,
  // ?!
  inaccuracy: (
    <g {...STROKE}>
      {question(8.3, 0.84)}
      {bang(17)}
    </g>
  ),
  // ?
  mistake: <g {...STROKE}>{QUESTION}</g>,
  // target: two rings and the centre
  miss: (
    <g {...STROKE} strokeWidth={2}>
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="3.2" />
    </g>
  ),
  // ??
  blunder: (
    <g {...STROKE}>
      {question(7.9, 0.82)}
      {question(16.1, 0.82)}
    </g>
  ),
};

const HEX_POINTS = "12,1.2 21.4,6.6 21.4,17.4 12,22.8 2.6,17.4 2.6,6.6";

function ShapeBody({ shape }: { shape: Shape }): ReactNode {
  if (shape === "circle") {
    return <circle cx="12" cy="12" r="12" />;
  }
  if (shape === "square") {
    return <rect x="0.5" y="0.5" width="23" height="23" rx="6" />;
  }
  // Hexagon, pointy-top; the same-colour stroke rounds its corners.
  return <polygon points={HEX_POINTS} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />;
}

type Props = {
  label: ReviewLabel;
  /** Diameter in px, or "fill" to take the whole box of the parent (the board square badge). */
  size?: number | "fill";
  className?: string;
};

/**
 * SIG-1219: the one badge per review tier, hand-drawn as inline SVG: a circle
 * (good moves), rounded square (Textbook, Forced) or hexagon (errors) in the
 * tier's `--studio-tier-*` fill with the glyph in its `-fg` mark colour.
 * Decorative: callers carry the accessible name.
 */
export function TierBadge({ label, size = 16, className = "" }: Props) {
  const tier = REVIEW_TIERS[label];
  const dimension = size === "fill" ? "100%" : size;
  const style: CSSProperties = {
    width: dimension,
    height: dimension,
    color: `var(${tier.badgeVar}-fg)`,
    overflow: "visible",
    display: size === "fill" ? "block" : undefined,
  };
  return (
    <svg
      aria-hidden
      focusable="false"
      data-tier-badge={label}
      viewBox="0 0 24 24"
      className={`inline-block shrink-0 select-none ${className}`}
      style={style}
    >
      {/* Shape colour; the glyph below inherits `color` from the svg. */}
      <g style={{ fill: `var(${tier.badgeVar})`, color: `var(${tier.badgeVar})` }}>
        <ShapeBody shape={TIER_SHAPES[label]} />
      </g>
      {TIER_ICONS[label]}
    </svg>
  );
}
