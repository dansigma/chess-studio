"use client";

import { useEffect, useState } from "react";
import { createBrowserSupabase } from "@/src/lib/supabase/client";
import { currentUserCanPublish } from "./publish";
import { hydrateProgress, progressSource } from "./store";
import type { VariationProgress } from "./types";

/**
 * Client progress only. The course library itself is fetched by the async
 * server components in `app/courses/**` and passed to the views via props —
 * this hook hydrates per-user progress (browser + account) and the publisher
 * flag once on mount. Freshness is split: `AdminView` calls `router.refresh()`
 * after publish/import so the server-rendered catalog re-hydrates for the
 * publisher, while visitors rely on ISR (`revalidate = 60` on the course
 * routes) — not on this hook.
 */
export function useCourseData() {
  const [progress, setProgress] = useState<Record<string, VariationProgress>>({});
  const [admin, setAdmin] = useState(false);
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [source, setSource] = useState<"account" | "browser">("browser");

  useEffect(() => {
    let cancel = false;
    void (async () => {
      const supabase = createBrowserSupabase();
      const user = supabase ? (await supabase.auth.getUser()).data.user : null;
      const [nextProgress, canPublish] = await Promise.all([
        hydrateProgress(user?.id ?? null),
        user ? currentUserCanPublish() : Promise.resolve(false),
      ]);
      if (cancel) {
        return;
      }
      setProgress(nextProgress);
      setSignedIn(Boolean(user));
      setAdmin(canPublish);
      setSource(progressSource());
      setReady(true);
    })();
    return () => {
      cancel = true;
    };
  }, []);

  return { progress, admin, ready, signedIn, source, setProgress };
}
