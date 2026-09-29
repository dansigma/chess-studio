import { LessonView } from "@/src/courses/LessonView";

export default async function LessonPage({
  params,
}: {
  params: Promise<{ slug: string; variationId: string }>;
}) {
  const { slug, variationId } = await params;
  return <LessonView slug={slug} variationId={variationId} />;
}
