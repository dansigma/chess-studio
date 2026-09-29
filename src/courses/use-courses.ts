"use client";

import { useEffect, useState } from "react";
import { createBrowserSupabase } from "@/src/lib/supabase/client";
import { currentUserCanPublish } from "./publish";
import { fetchCourses, hydrateProgress, progressSource } from "./store";
import type { Course, VariationProgress } from "./types";

export function useCourseData() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [progress, setProgress] = useState<Record<string, VariationProgress>>({});
  const [admin, setAdmin] = useState(false);
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [source, setSource] = useState<"account" | "browser">("browser");

  useEffect(() => {
    let cancel = false;
    void (async () => {
      const supabase = createBrowserSupabase();
      const user = supabase ? (await supabase.auth.getUser()).data.user : null;
      const [library, nextProgress, canPublish] = await Promise.all([
        fetchCourses(),
        hydrateProgress(user?.id ?? null),
        user ? currentUserCanPublish() : Promise.resolve(false),
      ]);
      if (cancel) {
        return;
      }
      setCourses(library.courses);
      setProgress(nextProgress);
      setLoadError(library.error ?? "");
      setSignedIn(Boolean(user));
      setAdmin(canPublish);
      setSource(progressSource());
      setReady(true);
    })();
    return () => {
      cancel = true;
    };
  }, []);

  return { courses, progress, admin, ready, signedIn, loadError, source, setProgress };
}
