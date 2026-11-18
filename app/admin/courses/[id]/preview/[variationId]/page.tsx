import { notFound } from "next/navigation";
import { findVariation } from "@/src/courses/store";
import { LessonView } from "@/src/courses/LessonView";
import { loadPreviewCourse } from "../load-preview";

export const metadata = {
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminCourseVariationPreviewPage({
  params,
}: {
  params: Promise<{ id: string; variationId: string }>;
}) {
  const { id, variationId } = await params;
  const course = await loadPreviewCourse(id, `/admin/courses/${id}/preview/${variationId}`);
  if (!findVariation(course, variationId)) {
    notFound();
  }
  return (
    <LessonView
      course={course}
      variationId={variationId}
      previewBasePath={`/admin/courses/${id}/preview`}
      previewQueueHref="/admin/courses"
    />
  );
}
