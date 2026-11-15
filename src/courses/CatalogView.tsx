"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CatalogFilters } from "./ui/CatalogFilters";
import {
  EMPTY_CATALOG_QUERY,
  filterCatalog,
  parseCatalogQuery,
  serializeCatalogQuery,
  type CatalogQuery,
} from "./catalog-filter";
import { tCourse } from "@/src/i18n/course-strings";
import { SiteFooter } from "@/src/site/SiteFooter";
import { CourseChrome } from "./CourseChrome";
import { useStudioStore } from "@/src/store/studio-store";
import type { CatalogCourse } from "./types";
import { CourseCard } from "./ui/CourseCard";
import { useCourseData } from "./use-courses";

export function CatalogView({ courses }: { courses: CatalogCourse[] }) {
  const locale = useStudioStore((state) => state.settings.locale);
  const { progress, admin, isAdmin, ready, signedIn, source } = useCourseData();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Local state keeps typing responsive; the address is kept in sync (SIG-1356).
  const [query, setQuery] = useState<CatalogQuery>(() => parseCatalogQuery(searchParams));
  const visible = filterCatalog(courses, query);
  const updateQuery = (next: CatalogQuery) => {
    setQuery(next);
    const qs = serializeCatalogQuery(next);
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <div className="min-h-full bg-studio-bg">
      <CourseChrome admin={admin} isAdmin={isAdmin} />
      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-studio-fg">{tCourse(locale, "course.catalog.heading")}</h1>
            <p className="mt-2 max-w-2xl text-body text-studio-muted">
              {tCourse(locale, "course.catalog.intro")}
            </p>
          </div>
        </div>
        <CatalogFilters locale={locale} query={query} onChange={updateQuery} />
        {ready && !signedIn ? (
          <p className="mt-3 text-caption text-studio-muted">
            <Link href="/login" className="text-studio-accent-text">
              {tCourse(locale, "course.common.signIn")}
            </Link>{" "}
            {tCourse(locale, "course.catalog.signinSuffix")}
          </p>
        ) : null}
        {signedIn && source === "browser" ? (
          <p className="mt-3 text-caption text-studio-warning-fg">{tCourse(locale, "course.catalog.browserOnly")}</p>
        ) : null}
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.length === 0 ? (
            <p className="text-body text-studio-muted">{tCourse(locale, "course.catalog.empty")}</p>
          ) : visible.length === 0 ? (
            <div className="sm:col-span-2 lg:col-span-3">
              <p className="text-body text-studio-muted">{tCourse(locale, "course.catalog.noResults")}</p>
              <button
                type="button"
                onClick={() => updateQuery(EMPTY_CATALOG_QUERY)}
                className="mt-3 rounded-lg border border-studio-border bg-studio-chrome px-3 py-2 text-body text-studio-fg hover:border-studio-border-strong"
              >
                {tCourse(locale, "course.catalog.clearFilters")}
              </button>
            </div>
          ) : null}
          {visible.map((course) => (
            <CourseCard key={course.id} course={course} locale={locale} progress={progress} ready={ready} />
          ))}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
