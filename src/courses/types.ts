export type CourseColor = "white" | "black";

export type CourseTheme = "openings" | "strategy" | "tactics" | "endgames";

export const COURSE_THEMES: readonly { id: CourseTheme; label: string }[] = [
  { id: "openings", label: "Openings" },
  { id: "strategy", label: "Strategy" },
  { id: "tactics", label: "Tactics" },
  { id: "endgames", label: "Endgames" },
];

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
