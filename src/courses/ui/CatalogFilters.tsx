"use client";

import type { ReactNode } from "react";
import { tCourse, type CourseStringKey } from "@/src/i18n/course-strings";
import type { SiteLocale } from "@/src/i18n/locale";
import { Chip, SearchInput } from "@/src/studio/ui/Controls";
import { COURSE_LEVELS } from "../catalog-fields";
import { EMPTY_CATALOG_QUERY, isCatalogQueryEmpty, type CatalogQuery } from "../catalog-filter";
import type { CourseColor, CourseTheme } from "../types";

const COLORS: CourseColor[] = ["white", "black"];
const THEMES: CourseTheme[] = ["openings", "strategy", "tactics", "endgames"];

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

/** SIG-1356: search box + quick filter pills (controlled by the catalog query). */
export function CatalogFilters({
  locale,
  query,
  onChange,
}: {
  locale: SiteLocale;
  query: CatalogQuery;
  onChange: (query: CatalogQuery) => void;
}) {
  const t = (key: string) => tCourse(locale, `course.catalog.${key}` as CourseStringKey);
  const group = (label: string, children: ReactNode) => (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {children}
    </div>
  );
  return (
    <div className="mt-6 space-y-3">
      <SearchInput
        value={query.q}
        onChange={(q) => onChange({ ...query, q })}
        placeholder={t("search.placeholder")}
        clearLabel={t("search.clear")}
        className="max-w-md"
      />
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        <Chip active={isCatalogQueryEmpty(query)} onClick={() => onChange(EMPTY_CATALOG_QUERY)}>
          {t("pill.all")}
        </Chip>
        {group(
          t("group.color"),
          COLORS.map((color) => (
            <Chip
              key={color}
              active={query.colors.includes(color)}
              onClick={() => onChange({ ...query, colors: toggle(query.colors, color) })}
            >
              {t(`pill.${color}`)}
            </Chip>
          )),
        )}
        {group(
          t("group.level"),
          COURSE_LEVELS.map((level) => (
            <Chip
              key={level}
              active={query.levels.includes(level)}
              onClick={() => onChange({ ...query, levels: toggle(query.levels, level) })}
            >
              {t(`pill.${level}`)}
            </Chip>
          )),
        )}
      </div>
      {group(
        t("group.theme"),
        THEMES.map((theme) => (
          <Chip
            key={theme}
            active={query.themes.includes(theme)}
            onClick={() => onChange({ ...query, themes: toggle(query.themes, theme) })}
          >
            {t(`pill.${theme}`)}
          </Chip>
        )),
      )}
    </div>
  );
}
