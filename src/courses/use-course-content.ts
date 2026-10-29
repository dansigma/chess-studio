"use client";

// SIG-1119: reads the gated lesson content for a course whose public row
// only carries the outline (contentLoaded: false). The database decides:
// a query that succeeds with no row means locked (access refused).
import { useEffect, useState } from "react";
import { createBrowserSupabase } from "@/src/lib/supabase/client";
import { parseContentChapters } from "./store";
import type { Course, CourseChapter } from "./types";

export type ContentStatus = "loading" | "ready" | "locked" | "error";

export type ContentState = {
  status: ContentStatus;
  chapters: CourseChapter[];
};

/** Pure reducer: transitions for the course-content fetch. Unit-tested. */
export function contentState(
  state: ContentState,
  event:
    | { type: "start" }
    | { type: "resolve"; chapters: CourseChapter[] }
    | { type: "deny" }
    | { type: "fail" },
): ContentState {
  switch (event.type) {
    case "start":
      return { status: "loading", chapters: [] };
    case "resolve":
      return { status: "ready", chapters: event.chapters };
    case "deny":
      return { status: "locked", chapters: [] };
    case "fail":
      return { status: "error", chapters: state.chapters };
  }
}

export function useCourseContent(course: Course): ContentState {
  const needsFetch = course.contentLoaded === false;
  const courseId = course.id;
  const courseChapters = course.chapters;
  // Keyed by course: switching courses re-initializes to loading/ready
  // without a sync setState inside the fetch effect below.
  const [state, setState] = useState<ContentState>(() =>
    needsFetch ? { status: "loading", chapters: [] } : { status: "ready", chapters: courseChapters },
  );
  const [key, setKey] = useState(courseId);
  if (key !== courseId) {
    setKey(courseId);
    setState(needsFetch ? { status: "loading", chapters: [] } : { status: "ready", chapters: courseChapters });
  }

  useEffect(() => {
    // Seed/local courses always carry full content: nothing to fetch.
    if (!needsFetch) {
      return;
    }
    let cancel = false;
    void (async () => {
      const supabase = createBrowserSupabase();
      if (!supabase) {
        // No Supabase configured: treat the outline as the content (tests /
        // fresh projects render titles; seed courses never reach this).
        if (!cancel) {
          setState({ status: "ready", chapters: courseChapters });
        }
        return;
      }
      // course_content landed with the gate migration and may be absent from
      // generated types: query through an untyped client shape.
      const client = supabase as unknown as {
        from: (table: string) => {
          select: (cols: string) => {
            eq: (col: string, v: string) => {
              maybeSingle: () => Promise<{ data: { chapters?: unknown } | null; error: { code?: string } | null }>;
            };
          };
        };
      };
      const { data, error } = await client.from("course_content").select("chapters").eq("course_id", courseId).maybeSingle();
      if (cancel) {
        return;
      }
      if (error) {
        setState({ status: "error", chapters: [] });
        return;
      }
      if (!data) {
        setState({ status: "locked", chapters: [] });
        return;
      }
      setState({ status: "ready", chapters: parseContentChapters(data.chapters) });
    })();
    return () => {
      cancel = true;
    };
  }, [needsFetch, courseId, courseChapters]);

  return state;
}
