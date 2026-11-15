// SIG-1356: pure catalog search + pill filters, and their URL encoding.
import { courseSummaryText } from "./description.ts";
import { COURSE_LEVELS } from "./catalog-fields.ts";
import type { CatalogCourse, CourseColor, CourseLevel, CourseTheme } from "./types.ts";

export type CatalogQuery = {
  q: string;
  colors: CourseColor[];
  levels: CourseLevel[];
  themes: CourseTheme[];
};

export const EMPTY_CATALOG_QUERY: CatalogQuery = { q: "", colors: [], levels: [], themes: [] };

const COLORS: readonly CourseColor[] = ["white", "black"];
const THEMES: readonly CourseTheme[] = ["openings", "strategy", "tactics", "endgames"];

/** Lowercase and strip accents so "tatica" matches "Tática". */
export function normalizeSearch(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export function isCatalogQueryEmpty(query: CatalogQuery): boolean {
  return normalizeSearch(query.q) === "" && !query.colors.length && !query.levels.length && !query.themes.length;
}

export function filterCatalog(courses: CatalogCourse[], query: CatalogQuery): CatalogCourse[] {
  const needle = normalizeSearch(query.q);
  return courses.filter((course) => {
    if (query.colors.length && !query.colors.includes(course.color)) return false;
    if (query.levels.length && !query.levels.includes(course.level)) return false;
    if (query.themes.length && !query.themes.includes(course.theme)) return false;
    if (!needle) return true;
    const haystack = normalizeSearch(
      [course.title, courseSummaryText(course.summary), course.authorName ?? ""].join(" "),
    );
    return haystack.includes(needle);
  });
}

function pick<T extends string>(raw: string | null, allowed: readonly T[]): T[] {
  if (!raw) return [];
  const out: T[] = [];
  for (const part of raw.split(",")) {
    const match = allowed.find((item) => item === part.trim());
    if (match && !out.includes(match)) out.push(match);
  }
  return out;
}

/** Defensive parse: unknown values are dropped. */
export function parseCatalogQuery(params: { get(name: string): string | null }): CatalogQuery {
  return {
    q: (params.get("q") ?? "").slice(0, 200),
    colors: pick(params.get("color"), COLORS),
    levels: pick(params.get("level"), COURSE_LEVELS),
    themes: pick(params.get("theme"), THEMES),
  };
}

/** Query string without the leading "?" (empty when nothing is set). */
export function serializeCatalogQuery(query: CatalogQuery): string {
  const params = new URLSearchParams();
  if (query.q.trim()) params.set("q", query.q);
  if (query.colors.length) params.set("color", query.colors.join(","));
  if (query.levels.length) params.set("level", query.levels.join(","));
  if (query.themes.length) params.set("theme", query.themes.join(","));
  return params.toString();
}
