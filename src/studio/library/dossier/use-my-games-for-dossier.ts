"use client";

// SIG-1345: one load of the signed-in user's games, shared by every dossier
// opening card and by the notice above the list. A module-level session per
// user means N cards joining at mount issue one page loop; the session is
// dropped when the last consumer leaves (or when a load settles with nobody
// listening), so the next dossier session starts fresh.
import { useCallback, useSyncExternalStore } from "react";
import { loadCappedMyGames } from "@/src/lib/my-games/load-games";
import { OPENING_MAX_GAMES } from "@/src/lib/my-games/opening-rows";
import type { PlayerGame } from "@/src/lib/player-types";
import { createBrowserSupabase } from "@/src/lib/supabase/client";
import { useStudioStore } from "@/src/store/studio-store";

export type DossierMyGamesStatus = "signedOut" | "loading" | "ready" | "error";

export type DossierMyGamesState = {
  status: DossierMyGamesStatus;
  games: PlayerGame[];
  /** Set when `status` is "error"; the notice shows the retry action. */
  error: string | null;
};

const NO_GAMES: PlayerGame[] = [];

const SIGNED_OUT: DossierMyGamesState = { status: "signedOut", games: NO_GAMES, error: null };
const LOADING: DossierMyGamesState = { status: "loading", games: NO_GAMES, error: null };
const ERROR: DossierMyGamesState = { status: "error", games: NO_GAMES, error: "unavailable" };

type Session = {
  snapshot: DossierMyGamesState;
  listeners: Set<() => void>;
  refs: number;
  loadToken: number;
  disposeWhenIdle: boolean;
};

const sessions = new Map<string, Session>();

function getSession(userId: string): Session {
  let session = sessions.get(userId);
  if (!session) {
    session = {
      snapshot: LOADING,
      listeners: new Set(),
      refs: 0,
      loadToken: 0,
      disposeWhenIdle: false,
    };
    sessions.set(userId, session);
  }
  return session;
}

function emit(session: Session): void {
  for (const listener of session.listeners) {
    listener();
  }
}

function update(session: Session, snapshot: DossierMyGamesState): void {
  if (session.snapshot === snapshot) {
    return;
  }
  session.snapshot = snapshot;
  emit(session);
}

function deleteIfIdle(userId: string, session: Session): void {
  if (session.refs > 0) {
    return;
  }
  if (session.snapshot.status === "loading") {
    session.disposeWhenIdle = true;
    return;
  }
  if (sessions.get(userId) === session) {
    sessions.delete(userId);
  }
}

function startLoad(userId: string, session: Session): void {
  const token = session.loadToken + 1;
  session.loadToken = token;
  const supabase = createBrowserSupabase();
  if (!supabase) {
    update(session, ERROR);
    deleteIfIdle(userId, session);
    return;
  }
  update(session, LOADING);
  void loadCappedMyGames(supabase, { maxGames: OPENING_MAX_GAMES }).then(
    (result) => {
      if (session.loadToken !== token) {
        return;
      }
      if (!result.ok) {
        update(session, result.error === "signed_out" ? SIGNED_OUT : ERROR);
      } else {
        update(session, { status: "ready", games: result.games, error: null });
      }
      if (session.disposeWhenIdle) {
        deleteIfIdle(userId, session);
      }
    },
    () => {
      if (session.loadToken !== token) {
        return;
      }
      update(session, ERROR);
      if (session.disposeWhenIdle) {
        deleteIfIdle(userId, session);
      }
    },
  );
}

function subscribe(userId: string, listener: () => void): () => void {
  const session = getSession(userId);
  session.listeners.add(listener);
  session.refs += 1;
  // A session that already started is shared; only the first joiner starts
  // the page loop. An error stays until the notice's retry action.
  if (session.loadToken === 0) {
    startLoad(userId, session);
  }
  return () => {
    session.listeners.delete(listener);
    session.refs -= 1;
    deleteIfIdle(userId, session);
  };
}

function getSnapshot(userId: string): DossierMyGamesState {
  return sessions.get(userId)?.snapshot ?? LOADING;
}

export type UseMyGamesForDossierResult = DossierMyGamesState & { retry: () => void };

/**
 * The signed-in user's games for the dossier's own-line comparison. Every
 * card calls this hook; they all share one load per user.
 */
export function useMyGamesForDossier(): UseMyGamesForDossierResult {
  const userId = useStudioStore((state) => state.user?.id ?? null);
  const subscribeTo = useCallback(
    (listener: () => void) => (userId ? subscribe(userId, listener) : () => {}),
    [userId],
  );
  const get = useCallback(() => (userId ? getSnapshot(userId) : SIGNED_OUT), [userId]);
  const snapshot = useSyncExternalStore(subscribeTo, get, get);
  const retry = useCallback(() => {
    if (!userId) {
      return;
    }
    const session = sessions.get(userId);
    if (session) {
      startLoad(userId, session);
    }
  }, [userId]);

  if (!userId) {
    return { ...SIGNED_OUT, retry };
  }
  return { ...snapshot, retry };
}

/** Test seam: forget every cached session (each test process may reuse ids). */
export function resetMyGamesForDossier(): void {
  sessions.clear();
}
