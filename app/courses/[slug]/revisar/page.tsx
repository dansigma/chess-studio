import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CHAPTER_PARAM } from "@/src/courses/chapter-param";
import { ReviewSession } from "@/src/courses/lesson/ReviewSession";
import { loadCourse } from "@/src/courses/load-course";
import { SITE_NAME } from "@/src/site/sections";
import type { Course } from "@/src/courses/types";

// SIG-1375: `/courses/[slug]/revisar` is a static segment and wins over
// `[variationId]`; no seed line uses the id "revisar". The chapter filter is a
// search param, so the page renders per request and the session (progress) is
// client-side anyway.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  let course: Course | null = null;
  try {
    ({ course } = await loadCourse(slug));
  } catch {
    course = null;
  }
  if (!course) {
    return { title: `Review not found · ${SITE_NAME}` };
  }
  return { title: `Review · ${course.title} · ${SITE_NAME}` };
}

export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const rawChapter = query[CHAPTER_PARAM];
  const chapterParam =
    typeof rawChapter === "string" ? rawChapter : undefined;
  const { course, notice } = await loadCourse(slug);
  if (!course) {
    notFound();
  }
  return (
    <>
      {notice ? (
        <p className="border-b border-studio-border bg-studio-chrome px-6 py-2 text-center text-caption text-studio-warning-fg">
          {notice}
        </p>
      ) : null}
      <ReviewSession course={course} chapterParam={chapterParam} />
    </>
  );
}
