import type { ReviewLabel } from "./review.ts";

export type ReviewTier = {
  name: string;
  /** Annotation shown next to a move (move list, key moments). */
  mark: string;
  /** Glyph shown in the report card tier list. */
  icon: string;
  className: string;
};

/** Single source of truth for tier presentation, in display order (best → worst); `forced` is not a tier and sits last. */
export const REVIEW_TIERS: Record<ReviewLabel, ReviewTier> = {
  brilliant: { name: "Genius", mark: "!!", icon: "✦", className: "text-studio-accent" },
  great: { name: "Great", mark: "!", icon: "✓", className: "text-studio-success" },
  best: { name: "Perfect", mark: "★", icon: "★", className: "text-studio-fg" },
  veryGood: { name: "Very good", mark: "+", icon: "●", className: "text-studio-success" },
  decent: { name: "Decent", mark: "=", icon: "○", className: "text-studio-muted" },
  book: { name: "Textbook", mark: "B", icon: "▤", className: "text-studio-comment" },
  inaccuracy: { name: "Imprecise", mark: "?!", icon: "△", className: "text-studio-warning-fg" },
  mistake: { name: "Mistake", mark: "?", icon: "◇", className: "text-studio-warning-fg" },
  miss: { name: "Miss", mark: "✕", icon: "✕", className: "text-studio-warning-fg" },
  blunder: { name: "Blunder", mark: "??", icon: "✖", className: "text-studio-danger" },
  forced: { name: "Forced", mark: "□", icon: "□", className: "text-studio-faint" },
};
