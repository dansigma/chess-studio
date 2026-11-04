import type { ReviewLabel } from "./review.ts";

export type ReviewTier = {
  name: string;
  /** Annotation shown next to a move (move list, key moments). */
  mark: string;
  /** Glyph shown in the report card tier list. */
  icon: string;
  /** Text colour class (key-moment marks, chart). Derived from the badge fill, except Forced which stays muted. */
  className: string;
  /** SIG-1219: CSS custom property holding the badge fill; the mark colour is `${badgeVar}-fg`. Values live in app/globals.css. */
  badgeVar: string;
};

/** Single source of truth for tier presentation, in display order (best → worst); `forced` is not a tier and sits last. */
export const REVIEW_TIERS: Record<ReviewLabel, ReviewTier> = {
  brilliant: { name: "Genius", mark: "!!", icon: "✦", className: "text-studio-tier-brilliant", badgeVar: "--studio-tier-brilliant" },
  great: { name: "Great", mark: "!", icon: "✓", className: "text-studio-tier-great", badgeVar: "--studio-tier-great" },
  best: { name: "Perfect", mark: "★", icon: "★", className: "text-studio-tier-best", badgeVar: "--studio-tier-best" },
  veryGood: { name: "Very good", mark: "+", icon: "●", className: "text-studio-tier-very-good", badgeVar: "--studio-tier-very-good" },
  decent: { name: "Decent", mark: "=", icon: "○", className: "text-studio-tier-decent", badgeVar: "--studio-tier-decent" },
  book: { name: "Textbook", mark: "B", icon: "▤", className: "text-studio-tier-book", badgeVar: "--studio-tier-book" },
  inaccuracy: { name: "Imprecise", mark: "?!", icon: "△", className: "text-studio-tier-inaccuracy", badgeVar: "--studio-tier-inaccuracy" },
  mistake: { name: "Mistake", mark: "?", icon: "◇", className: "text-studio-tier-mistake", badgeVar: "--studio-tier-mistake" },
  miss: { name: "Miss", mark: "✕", icon: "✕", className: "text-studio-tier-miss", badgeVar: "--studio-tier-miss" },
  blunder: { name: "Blunder", mark: "??", icon: "✖", className: "text-studio-tier-blunder", badgeVar: "--studio-tier-blunder" },
  forced: { name: "Forced", mark: "□", icon: "□", className: "text-studio-faint", badgeVar: "--studio-tier-forced" },
};
