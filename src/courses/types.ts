export type CourseColor = "white" | "black";

export type CourseTheme = "openings" | "strategy" | "tactics" | "endgames";

export const COURSE_THEMES: readonly { id: CourseTheme; label: string }[] = [
  { id: "openings", label: "Openings" },
  { id: "strategy", label: "Strategy" },
  { id: "tactics", label: "Tactics" },
  { id: "endgames", label: "Endgames" },
];

export type CourseStatus = "draft" | "in_review" | "published" | "rejected" | "archived";

export type CourseAccessTier = "free" | "premium" | "paid";

export type CourseVariation = {
  id: string;
  title: string;
  pgn: string;
};

export type CourseChapter = {
  id: string;
  title: string;
  variations: CourseVariation[];
};

export type Course = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  coverUrl?: string;
  videoUrl?: string;
  theme: CourseTheme;
  color: CourseColor;
  chapters: CourseChapter[];
  builtin?: boolean;
  /**
   * SIG-1119: false when chapters came from the public outline (PGN
   * stripped); true once the gated course_content payload is loaded.
   * Undefined on seed/local courses, which always carry full content.
   */
  contentLoaded?: boolean;
  /**
   * SIG-1050 review workflow. status is the source of truth for visibility
   * (published = visible to anon).
   */
  status: CourseStatus;
  /** SIG-1050 access tier: free by default; paid requires priceCents. */
  accessTier: CourseAccessTier;
  /** SIG-1050 price in cents (BRL); non-null exactly when paid. */
  priceCents: number | null;
  /** SIG-1050 coach display name (nullable). */
  authorName?: string;
  /** SIG-1050 reviewer note (nullable). */
  reviewNote?: string | null;
  /**
   * SIG-861: null = draft (invisible to anon), string = published at.
   * Undefined = pre-published_at row (seed / browser-local draft), treated
   * as always-published by the catalog merge. Kept in sync with status by
   * the courses_sync_published_at trigger; SIG-1050 keeps the column.
   */
  publishedAt?: string | null;
};

export type VariationProgress = {
  step: number;
  learned: boolean;
};

/**
 * Chapters-free catalog card. The server reads the full chapters, computes
 * the counts, and passes this DTO to the client — the chapters JSON never
 * reaches the browser on `/courses`.
 */
export type CatalogCourse = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  coverUrl?: string;
  videoUrl?: string;
  theme: CourseTheme;
  color: CourseColor;
  /** Chapters that contain at least one line. */
  chapterCount: number;
  /** Total lines (variations) across chapters with lines. */
  moveCount: number;
  /** Variation ids, so the client derives progress without chapters. */
  variationIds: string[];
};
