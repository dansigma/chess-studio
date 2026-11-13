"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fileDatabaseOverview } from "@/src/lib/library/file-source";
import { MASTERS_SOURCE_ID } from "@/src/lib/library/masters-source";
import { emptyOverview, mergeOverviews, type LibraryOverview } from "@/src/lib/library/overview";
import { getLibrarySource } from "@/src/lib/library/sources";
import { useStudioStore } from "@/src/store/studio-store";
import { useLibraryStore } from "./library-store";

export type LibraryOverviewState =
  | { kind: "unavailable" } // only Masters (or nothing summarizable) is selected
  | { kind: "loading" }
  | { kind: "failed" } // only My Games is selected and it failed
  | { kind: "ready"; overview: LibraryOverview; myGamesFailed: boolean };

type MyGames = { status: "idle" } | { status: "ready"; overview: LibraryOverview } | { status: "error" };

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

/**
 * SIG-1327: summary of the selected sources as a whole (filters are ignored).
 * File databases are summarized in memory and cached per database object, so a
 * change to `files.databases` (import, rename, merge, delete) invalidates them.
 * My Games is fetched once per mount.
 */
export function useLibraryOverview(): LibraryOverviewState {
  const selected = useLibraryStore((s) => s.filters.sources);
  const databases = useStudioStore((s) => s.files.databases);
  const wantMyGames = selected.includes("my-games");
  const hasAdapter = typeof getLibrarySource("my-games")?.overview === "function";
  // The fetch is keyed on the signed-in user: signing in, out or switching
  // account refetches instead of keeping a stale result or failure.
  const userKey = useStudioStore((s) => s.user?.id ?? "");
  const [myGames, setMyGames] = useState<MyGames & { userKey?: string }>({ status: "idle" });
  const fetchedFor = useRef<string | null>(null);

  useEffect(() => {
    const adapter = getLibrarySource("my-games");
    if (!wantMyGames || !adapter?.overview || fetchedFor.current === userKey) {
      return;
    }
    fetchedFor.current = userKey;
    const controller = new AbortController();
    let settled = false;
    adapter
      .overview(controller.signal)
      .then((overview) => {
        settled = true;
        if (!controller.signal.aborted) {
          setMyGames({ status: "ready", overview, userKey });
        }
      })
      .catch((cause: unknown) => {
        settled = true;
        if (!controller.signal.aborted && !isAbort(cause)) {
          setMyGames({ status: "error", userKey });
        }
      });
    return () => {
      controller.abort();
      if (!settled) {
        fetchedFor.current = null; // restart on the next run (e.g. Strict Mode)
      }
    };
  }, [wantMyGames, hasAdapter, userKey]);

  const fileOverviews = useMemo(() => {
    const list: LibraryOverview[] = [];
    for (const id of selected) {
      if (id.startsWith("file:")) {
        const db = databases.find((database) => `file:${database.id}` === id);
        if (db) {
          list.push(fileDatabaseOverview(db));
        }
      }
    }
    return list;
  }, [selected, databases]);

  return useMemo((): LibraryOverviewState => {
    const summarizable = selected.filter((id) => id !== MASTERS_SOURCE_ID);
    if (summarizable.length === 0) {
      return { kind: "unavailable" };
    }
    const myGamesCurrent = myGames.status !== "idle" && myGames.userKey === userKey;
    if (wantMyGames && !myGamesCurrent) {
      return { kind: "loading" };
    }
    const parts = [...fileOverviews];
    let myGamesFailed = false;
    if (wantMyGames) {
      if (myGames.status === "ready") {
        parts.push(myGames.overview);
      } else {
        myGamesFailed = true;
      }
    }
    if (parts.length === 0) {
      // Only My Games is summarizable: its failure leaves just the note. When
      // PGN files are selected too (even unknown or empty ones), keep the file
      // numbers (possibly zero) next to the note.
      const fileSelected = summarizable.some((id) => id.startsWith("file:"));
      if (myGamesFailed && !fileSelected) {
        return { kind: "failed" };
      }
      if (!myGamesFailed) {
        return { kind: "unavailable" };
      }
      return { kind: "ready", overview: emptyOverview(), myGamesFailed };
    }
    return { kind: "ready", overview: mergeOverviews(parts), myGamesFailed };
  }, [selected, wantMyGames, myGames, userKey, fileOverviews]);
}
