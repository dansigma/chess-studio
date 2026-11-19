import { CourseView } from "@/src/courses/CourseView";
import { loadPreviewCourse } from "./load-preview";

export const metadata = {
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminCoursePreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const course = await loadPreviewCourse(id, `/admin/courses/${id}/preview`);
  return (
    <CourseView
      course={course}
      previewBasePath={`/admin/courses/${id}/preview`}
      previewQueueHref="/admin/courses"
    />
  );
}
