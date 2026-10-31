// SIG-1101: "Opponent prep" dock panel (Insights 4/4). Source select
// (Lichess / Chess.com) + username field + Load button calling
// `GET /api/prep/opponent` (SIG-1100 contract), with loading and error states
// (404 "no public games", 429, 502/upstream) and the result: two tabs
// ("As White" / "As Black") with the `mostPlayed` summary and the expandable
// tree (SAN with move numbers, games, score % from the opponent's side,
// share of the parent's games). Each node has "Prepare against": opens a new
// board with the node's SAN path, oriented to the user's side (opposite of
// the tree color), and reveals an Explorer panel on that board's position
// (same grain as the SIG-1099 open-line flow in MyStatsPanel).
"use client";

import { useEffect, useMemo, useState } from "react";
import { formatInteger } from "@/src/i18n/format";
import type { SiteLocale } from "@/src/i18n/locale";
import { tPrep } from "@/src/i18n/prep-strings";
import {
  prepareAgainstLine,
  prepRows,
  type OpponentPrepSource,
  type OpponentProfile,
  type PrepColor,
} from "@/src/lib/prep/prep-rows";
import { selectActiveBoard, useStudioStore } from "@/src/store/studio-store";
import { openBoardPanel, openExplorerPanel, openStudioPanel } from "./dock-api";

type LoadStatus = "idle" | "loading" | "ready" | "error";

type ErrorKind = "notFound" | "rateLimited" | "upstream";

const ERROR_KEYS = {
  notFound: "prep.error.notFound",
  rateLimited: "prep.error.rateLimited",
  upstream: "prep.error.upstream",
} as const;

// One-shot initial values from the PlayerGamesPanel "Prepare against"
// launch button. The panel owns its fields after pre-fill (no live binding).
// Stored on globalThis so lint's `react-hooks/globals` rule accepts the
// cross-render handoff (module-level `let` reassignment is the flagged shape).
const PENDING_KEY = "__opponentPrepInitial";
const PENDING_EVENT = "opponent-prep-request";

type PrepInitial = { source: OpponentPrepSource; username: string };

function takePendingInitial(): PrepInitial | null {
  const holder = globalThis as Record<string, unknown>;
  const value = holder[PENDING_KEY];
  holder[PENDING_KEY] = null;
  if (
    typeof value === "object" &&
    value !== null &&
    (value as PrepInitial).source !== undefined &&
    typeof (value as PrepInitial).username === "string"
  ) {
    return value as PrepInitial;
  }
  return null;
}

export function setOpponentPrepInitial(value: PrepInitial | null): void {
  (globalThis as Record<string, unknown>)[PENDING_KEY] = value;
  if (value && typeof window !== "undefined") {
    // The panel consumes the value on mount; when it is already open, this
    // event lets the mounted panel apply the request instead of dropping it.
    window.dispatchEvent(new window.CustomEvent<PrepInitial>(PENDING_EVENT, { detail: value }));
  }
}

export function openOpponentPrepPanel(initial?: PrepInitial): void {
  if (initial) {
    setOpponentPrepInitial(initial);
  }
  openStudioPanel("opponentPrep");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function errorKindForStatus(status: number): ErrorKind {
  if (status === 404) {
    return "notFound";
  }
  if (status === 429) {
    return "rateLimited";
  }
  return "upstream";
}

function TreeSection({
  locale,
  treeColor,
  profile,
  onPrepare,
}: {
  locale: SiteLocale;
  treeColor: PrepColor;
  profile: OpponentProfile;
  onPrepare: (path: string[]) => void;
}) {
  const root = treeColor === "white" ? profile.white : profile.black;
  const mostPlayed = treeColor === "white" ? profile.mostPlayed.white : profile.mostPlayed.black;
  const [expandedKeys, setExpandedKeys] = useState<ReadonlySet<string>>(new Set());
  // Tab switches reset expansion (same grain as the MyStats Openings tab
  // filter reset — a stale key from the other color makes no sense here).
  // Adjust-state-during-render: resetting here re-renders before commit, so
  // no stale-list frame is painted (same pattern as PlayerCombobox).
  const [lastColor, setLastColor] = useState(treeColor);
  if (lastColor !== treeColor) {
    setLastColor(treeColor);
    setExpandedKeys(new Set());
  }
  const rows = useMemo(() => prepRows(root, expandedKeys), [root, expandedKeys]);
  return (
    <div className="flex flex-col gap-2">
      <section aria-label={tPrep(locale, "prep.mostPlayed")}>
        <h3 className="mb-1 text-caption font-semibold text-studio-muted">{tPrep(locale, "prep.mostPlayed")}</h3>
        {mostPlayed.length === 0 ? (
          <p className="text-caption text-studio-faint">–</p>
        ) : (
          <ul className="flex flex-wrap gap-1">
            {mostPlayed.slice(0, 3).map((entry) => (
              <li
                key={entry.san}
                className="rounded bg-studio-hover px-1.5 py-0.5 text-caption tabular-nums text-studio-fg"
              >
                {entry.san} · {formatInteger(locale, entry.games)}
              </li>
            ))}
          </ul>
        )}
      </section>
      {rows.length === 0 ? (
        <p className="text-dense text-studio-faint">{tPrep(locale, "prep.empty")}</p>
      ) : (
        <ul className="flex flex-col">
          {rows.map((row) => (
            <li key={row.key} className="border-t border-studio-border-subtle py-1" style={{ paddingLeft: row.depth * 12 }}>
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1 truncate text-dense text-studio-fg">
                  {row.hasChildren ? (
                    <button
                      type="button"
                      aria-expanded={row.expanded}
                      aria-label={row.numberedSan}
                      onClick={() => {
                        setExpandedKeys((previous) => {
                          const next = new Set(previous);
                          if (next.has(row.key)) {
                            next.delete(row.key);
                          } else {
                            next.add(row.key);
                          }
                          return next;
                        });
                      }}
                      className="mr-1 text-studio-muted hover:text-studio-fg"
                    >
                      {row.expanded ? "▾" : "▸"}
                    </button>
                  ) : null}
                  {row.numberedSan}
                </span>
                <button
                  type="button"
                  title={tPrep(locale, "prep.prepareAgainstHint")}
                  onClick={() => onPrepare(row.path)}
                  className="shrink-0 text-caption font-medium text-studio-accent-text hover:underline"
                >
                  {tPrep(locale, "prep.prepareAgainst")}
                </button>
              </div>
              <div className="flex items-center gap-2 text-caption tabular-nums text-studio-faint">
                <span>
                  {formatInteger(locale, row.node.games)} · {formatInteger(locale, row.node.scorePct)}% ·{" "}
                  {formatInteger(locale, row.sharePct)}%
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function OpponentPrepPanel() {
  const locale = useStudioStore((state) => state.settings.locale);
  const importPlayerGame = useStudioStore((state) => state.importPlayerGame);
  const flip = useStudioStore((state) => state.flip);
  const [source, setSource] = useState<OpponentPrepSource>("lichess");
  const [username, setUsername] = useState("");
  const [status, setStatus] = useState<LoadStatus>("idle");
  const [profile, setProfile] = useState<OpponentProfile | null>(null);
  const [errorKind, setErrorKind] = useState<ErrorKind | null>(null);
  const [tab, setTab] = useState<PrepColor>("white");

  // One-shot PlayerGamesPanel pre-fill, consumed on first render.
  // Adjust-state-during-render: the pending value is read and cleared before
  // commit, so no stale-field frame is painted (same pattern as
  // PlayerCombobox's render-phase reset).
  const [prefillConsumed, setPrefillConsumed] = useState(false);
  if (!prefillConsumed) {
    setPrefillConsumed(true);
    const initial = takePendingInitial();
    if (initial) {
      setSource(initial.source);
      setUsername(initial.username);
    }
  }

  // A "Prepare against" click while this panel is already mounted must still
  // apply, so the pending request is also delivered as a DOM event.
  useEffect(() => {
    function onRequest(event: Event): void {
      const detail = (event as CustomEvent<PrepInitial>).detail;
      if (!detail) {
        return;
      }
      (globalThis as Record<string, unknown>)[PENDING_KEY] = null;
      setSource(detail.source);
      setUsername(detail.username);
    }
    window.addEventListener(PENDING_EVENT, onRequest);
    return () => window.removeEventListener(PENDING_EVENT, onRequest);
  }, []);

  function load(): void {
    const name = username.trim();
    if (!name) {
      return;
    }
    const controller = new AbortController();
    setStatus("loading");
    setErrorKind(null);
    const params = new URLSearchParams({ source, username: name });
    void fetch(`/api/prep/opponent?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          setProfile(null);
          setErrorKind(errorKindForStatus(response.status));
          setStatus("error");
          return;
        }
        const payload = (await response.json()) as unknown;
        if (!isRecord(payload)) {
          throw new Error("bad profile payload");
        }
        setProfile(payload as unknown as OpponentProfile);
        setErrorKind(null);
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setProfile(null);
        setErrorKind("upstream");
        setStatus("error");
      });
  }

  function prepareAgainst(path: string[], treeColor: PrepColor): void {
    const { game, orientation } = prepareAgainstLine(path, treeColor);
    importPlayerGame(game, { openInNewBoard: true });
    // A fresh import is white-oriented (`emptyBoard`); flip when the user's
    // side is black (same grain as the SIG-1099 open-line flow).
    if (orientation === "black" && selectActiveBoard(useStudioStore.getState()).orientation !== "black") {
      flip();
    }
    const active = selectActiveBoard(useStudioStore.getState());
    openBoardPanel(active.id, active.title);
    openExplorerPanel();
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-auto bg-studio-panel p-3 text-dense text-studio-fg">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-caption text-studio-muted">
          {tPrep(locale, "prep.source")}
          <select
            aria-label={tPrep(locale, "prep.source")}
            value={source}
            onChange={(event) => setSource(event.target.value as OpponentPrepSource)}
            className="rounded bg-studio-hover px-1.5 py-1 text-dense text-studio-fg"
          >
            <option value="lichess">{tPrep(locale, "prep.sourceLichess")}</option>
            <option value="chesscom">{tPrep(locale, "prep.sourceChesscom")}</option>
          </select>
        </label>
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-caption text-studio-muted">
          {tPrep(locale, "prep.username")}
          <input
            aria-label={tPrep(locale, "prep.username")}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                load();
              }
            }}
            placeholder={tPrep(locale, "prep.usernamePlaceholder")}
            autoComplete="off"
            className="rounded bg-studio-hover px-1.5 py-1 text-dense text-studio-fg"
          />
        </label>
        <button
          type="button"
          onClick={load}
          disabled={status === "loading" || username.trim().length === 0}
          className="rounded bg-studio-accent px-2.5 py-1 text-dense font-medium text-white disabled:opacity-50"
        >
          {tPrep(locale, "prep.load")}
        </button>
      </div>
      {status === "loading" ? (
        <p className="text-dense text-studio-faint" role="status">
          {tPrep(locale, "prep.loading")}
        </p>
      ) : null}
      {status === "error" && errorKind ? (
        <div className="flex items-center gap-2" role="alert">
          <p className="text-dense text-studio-warning-fg">{tPrep(locale, ERROR_KEYS[errorKind])}</p>
          <button
            type="button"
            onClick={load}
            className="shrink-0 text-caption font-medium text-studio-accent-text hover:underline"
          >
            {tPrep(locale, "prep.retry")}
          </button>
        </div>
      ) : null}
      {status === "ready" && profile ? (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <p className="text-caption tabular-nums text-studio-faint">
            {tPrep(locale, profile.gamesAnalyzed === 1 ? "prep.gamesAnalyzed.one" : "prep.gamesAnalyzed.other", {
              count: profile.gamesAnalyzed,
            })}
          </p>
          <div role="tablist" aria-label={tPrep(locale, "prep.title")} className="flex gap-1">
            {(["white", "black"] as const).map((color) => (
              <button
                key={color}
                type="button"
                role="tab"
                aria-selected={tab === color}
                onClick={() => setTab(color)}
                className={`rounded px-2 py-0.5 text-caption ${tab === color ? "bg-studio-hover-strong text-studio-fg" : "text-studio-muted hover:bg-studio-hover"}`}
              >
                {tPrep(locale, color === "white" ? "prep.asWhite" : "prep.asBlack")}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 text-caption tabular-nums text-studio-faint">
            <span>{tPrep(locale, "prep.games")}</span>
            <span>{tPrep(locale, "prep.score")}</span>
            <span>{tPrep(locale, "prep.share")}</span>
          </div>
          <TreeSection locale={locale} treeColor={tab} profile={profile} onPrepare={(path) => prepareAgainst(path, tab)} />
        </div>
      ) : null}
      {status === "idle" ? <p className="text-dense text-studio-faint">{tPrep(locale, "prep.empty")}</p> : null}
    </div>
  );
}
