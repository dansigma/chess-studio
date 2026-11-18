"use client";

import { useState } from "react";
import type { ReviewQueueRowData } from "@/app/admin/courses/actions";
import { SiteHeader } from "@/src/site/SiteHeader";
import { CourseReviewQueue } from "./CourseReviewQueue";

// SIG-1396: /admin/courses page shell. Holds the undecided-course count so the
// SiteHeader review badge drops as the admin approves or rejects courses,
// instead of keeping the count from the server render.
export function AdminCoursesShell({ initialRows }: { initialRows: ReviewQueueRowData[] }) {
  const [remaining, setRemaining] = useState(initialRows.length);
  return (
    <div className="min-h-full bg-studio-bg text-studio-fg">
      <SiteHeader admin isAdmin reviewCount={remaining} />
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <CourseReviewQueue initialRows={initialRows} onRemainingChange={setRemaining} />
      </main>
    </div>
  );
}
