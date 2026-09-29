import { CourseView } from "@/src/courses/CourseView";

export default async function CoursePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <CourseView slug={slug} />;
}
