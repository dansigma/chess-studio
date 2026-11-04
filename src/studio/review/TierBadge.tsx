import type { CSSProperties } from "react";
import { REVIEW_TIERS } from "@/src/chess/review-tiers";
import type { ReviewLabel } from "@/src/chess/review";

/** "fill" badges sit in a box that is 34% of a container-query square (the board); font sizes follow that. */
export const BOARD_BADGE_FRACTION = 0.34;
const BOARD_FILL_FONT = `${Math.round(BOARD_BADGE_FRACTION * 62)}cqw`;
const BOARD_FILL_LONG_FONT = `${Math.round(BOARD_BADGE_FRACTION * 50)}cqw`;

type Props = {
  label: ReviewLabel;
  /** Diameter in px, or "fill" to take the whole (container-query) box of the parent, e.g. on a board square. */
  size?: number | "fill";
  className?: string;
};

/**
 * SIG-1219: the one badge per review tier — a filled circle with the tier mark.
 * Colours come from the `--studio-tier-*` tokens (contrast checked in
 * review-tier-contrast.test.ts). Decorative: callers carry the accessible name.
 */
export function TierBadge({ label, size = 16, className = "" }: Props) {
  const tier = REVIEW_TIERS[label];
  const long = Array.from(tier.mark).length > 1;
  const style: CSSProperties =
    size === "fill"
      ? { width: "100%", height: "100%", fontSize: long ? BOARD_FILL_LONG_FONT : BOARD_FILL_FONT }
      : { width: size, height: size, fontSize: Math.round(size * (long ? 0.5 : 0.62) * 10) / 10 };
  return (
    <span
      aria-hidden
      data-tier-badge={label}
      className={`inline-grid shrink-0 select-none place-items-center rounded-full font-bold leading-none ${className}`}
      style={{
        ...style,
        background: `var(${tier.badgeVar})`,
        color: `var(${tier.badgeVar}-fg)`,
        boxShadow: "0 0 0 1px rgb(0 0 0 / 0.35)",
        letterSpacing: long ? "-0.06em" : undefined,
      }}
    >
      {tier.mark}
    </span>
  );
}
