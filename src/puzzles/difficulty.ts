// SIG-1256: difficulty bands for themed training. A session with a difficulty
// only serves puzzles inside the band and never changes the rating. The bands
// are defined here and nowhere else.
export const DIFFICULTIES = ["beginner", "intermediate", "advanced"] as const;

export type Difficulty = (typeof DIFFICULTIES)[number];

/** Inclusive rating range of each band. */
export const DIFFICULTY_BANDS: Record<Difficulty, { minRating: number; maxRating: number }> = {
  beginner: { minRating: 0, maxRating: 1199 },
  intermediate: { minRating: 1200, maxRating: 1799 },
  advanced: { minRating: 1800, maxRating: 3000 },
};

/** Invalid, empty or missing values are null: the normal session. */
export function parseDifficulty(value: string | null | undefined): Difficulty | null {
  return (DIFFICULTIES as readonly string[]).includes(value ?? "") ? (value as Difficulty) : null;
}

/** The rating the picker aims at: the middle of the band. */
export function difficultyTarget(difficulty: Difficulty): number {
  const { minRating, maxRating } = DIFFICULTY_BANDS[difficulty];
  return Math.round((minRating + maxRating) / 2);
}

export function inDifficultyBand(rating: number, difficulty: Difficulty): boolean {
  const { minRating, maxRating } = DIFFICULTY_BANDS[difficulty];
  return rating >= minRating && rating <= maxRating;
}
