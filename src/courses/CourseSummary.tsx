"use client";

import { sanitizeCourseHtml } from "./description";

export function CourseSummary({ html, className }: { html: string; className?: string }) {
  // Rendered HTML is parser-sanitized at render (and already at publish), so no raw markup reaches the DOM.
  const safe = sanitizeCourseHtml(html);
  if (!safe) {
    return null;
  }
  return <div className={className} dangerouslySetInnerHTML={{ __html: safe }} />;
}
