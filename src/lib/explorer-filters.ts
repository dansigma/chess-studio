export const EXPLORER_SPEEDS = ["bullet", "blitz", "rapid", "classical"] as const;

export type ExplorerSpeed = (typeof EXPLORER_SPEEDS)[number];

export const RATING_THRESHOLDS = [0, 1600, 1800, 2000, 2200, 2500] as const;

export type ExplorerFilters = {
  speeds: ExplorerSpeed[];
  minRating: number;
  sinceYear: number | null;
  untilYear: number | null;
};

export const DEFAULT_EXPLORER_FILTERS: ExplorerFilters = {
  speeds: [...EXPLORER_SPEEDS],
  minRating: 0,
  sinceYear: null,
  untilYear: null,
};

const LICHESS_RATING_BANDS = [1600, 1800, 2000, 2200, 2500];

export function isExplorerSpeed(value: string): value is ExplorerSpeed {
  return (EXPLORER_SPEEDS as readonly string[]).includes(value);
}

export function normalizeSpeeds(speeds: readonly string[]): ExplorerSpeed[] {
  const unique = speeds.filter(isExplorerSpeed);
  return unique.length === 0 ? [...EXPLORER_SPEEDS] : [...new Set(unique)];
}

export function filtersAreDefault(filters: ExplorerFilters): boolean {
  return (
    normalizeSpeeds(filters.speeds).length === EXPLORER_SPEEDS.length &&
    filters.minRating === 0 &&
    filters.sinceYear == null &&
    filters.untilYear == null
  );
}

export function toggleExplorerSpeed(filters: ExplorerFilters, speed: ExplorerSpeed): ExplorerFilters {
  const current = normalizeSpeeds(filters.speeds);
  const next = current.includes(speed) ? current.filter((item) => item !== speed) : [...current, speed];
  return { ...filters, speeds: next.length === 0 ? [...EXPLORER_SPEEDS] : next };
}

export function readExplorerFilters(value: unknown): ExplorerFilters {
  if (typeof value !== "object" || value === null) {
    return DEFAULT_EXPLORER_FILTERS;
  }
  const record = value as Record<string, unknown>;
  const minRating = RATING_THRESHOLDS.find((item) => item === record.minRating) ?? 0;
  return {
    speeds: Array.isArray(record.speeds) ? normalizeSpeeds(record.speeds.filter((item) => typeof item === "string")) : [...EXPLORER_SPEEDS],
    minRating,
    sinceYear: readYear(record.sinceYear),
    untilYear: readYear(record.untilYear),
  };
}

function readYear(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return null;
  }
  if (value < 1400 || value > 2100) {
    return null;
  }
  return value;
}

export function speedFromTimeClass(value: string | null | undefined): ExplorerSpeed | null {
  if (value === "bullet" || value === "blitz" || value === "rapid" || value === "classical") {
    return value;
  }
  return null;
}

export function studioFilterQuery(filters: ExplorerFilters): string {
  const params = new URLSearchParams();
  const speeds = normalizeSpeeds(filters.speeds);
  if (speeds.length < EXPLORER_SPEEDS.length) {
    params.set("speeds", speeds.join(","));
  }
  if (filters.minRating > 0) {
    params.set("rating", String(filters.minRating));
  }
  if (filters.sinceYear) {
    params.set("since", String(filters.sinceYear));
  }
  if (filters.untilYear) {
    params.set("until", String(filters.untilYear));
  }
  const query = params.toString();
  return query ? `&${query}` : "";
}

export function lichessFilterQuery(
  source: "masters" | "lichess",
  filters: ExplorerFilters,
): string {
  const params = new URLSearchParams();
  if (filters.sinceYear) {
    params.set("since", source === "masters" ? String(filters.sinceYear) : `${filters.sinceYear}-01`);
  }
  if (filters.untilYear) {
    params.set("until", source === "masters" ? String(filters.untilYear) : `${filters.untilYear}-12`);
  }
  if (source === "lichess") {
    const speeds = normalizeSpeeds(filters.speeds);
    if (speeds.length < EXPLORER_SPEEDS.length) {
      params.set("speeds", speeds.join(","));
    }
    if (filters.minRating > 0) {
      const bands = LICHESS_RATING_BANDS.filter((band) => band >= filters.minRating);
      params.set("ratings", bands.join(","));
    }
  }
  const query = params.toString();
  return query ? `&${query}` : "";
}

export function filtersFromSearchParams(params: URLSearchParams): ExplorerFilters {
  const speeds = params.get("speeds");
  const rating = Number(params.get("rating") ?? params.get("minRating") ?? "");
  return {
    speeds: speeds ? normalizeSpeeds(speeds.split(",")) : [...EXPLORER_SPEEDS],
    minRating: RATING_THRESHOLDS.find((item) => item === rating) ?? 0,
    sinceYear: readYear(numberOrNull(params.get("since"))),
    untilYear: readYear(numberOrNull(params.get("until"))),
  };
}

function numberOrNull(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const year = Number(value.slice(0, 4));
  return Number.isInteger(year) ? year : null;
}

export function gameMatchesFilters(
  game: {
    year: number | null;
    whiteRating: number | null;
    blackRating: number | null;
    speed?: ExplorerSpeed | null;
  },
  filters: ExplorerFilters,
  applySpeed: boolean,
): boolean {
  if (filters.sinceYear != null && (game.year == null || game.year < filters.sinceYear)) {
    return false;
  }
  if (filters.untilYear != null && (game.year == null || game.year > filters.untilYear)) {
    return false;
  }
  if (filters.minRating > 0) {
    const ratings = [game.whiteRating, game.blackRating].filter((rating): rating is number => rating != null && rating > 0);
    if (ratings.length === 0) {
      return false;
    }
    const average = ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length;
    if (average < filters.minRating) {
      return false;
    }
  }
  if (applySpeed) {
    const speeds = normalizeSpeeds(filters.speeds);
    if (speeds.length < EXPLORER_SPEEDS.length && (game.speed == null || !speeds.includes(game.speed))) {
      return false;
    }
  }
  return true;
}
