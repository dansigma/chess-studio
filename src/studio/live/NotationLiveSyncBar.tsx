"use client";

import { useEffect, useState } from "react";
import { Radio, RefreshCw } from "lucide-react";
import type { SiteLocale } from "@/src/i18n/locale.ts";
import { tPanels } from "@/src/i18n/studio-panel-strings.ts";
import { useStudioStore } from "@/src/store/studio-store";
import { Button } from "../ui/Button";
import { useLiveStore } from "./live-store";
import { pullLiveMoves } from "./pull-live-moves";

type Feedback = { tone: "neutral" | "success" | "error"; text: string };

/**
 * SIG-1406: shown in the Notation panel when the active board was opened from a
 * live broadcast game. Lets the user pull newly played mainline moves without
 * clobbering their local variations, or jump back to the Live broadcast view.
 */
export function NotationLiveSyncBar({
  boardId,
  liveSource,
  locale,
}: {
  boardId: string;
  liveSource: { roundId: string; gameId: string };
  locale: SiteLocale;
}) {
  const [pulling, setPulling] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  useEffect(() => {
    setFeedback(null);
  }, [boardId, liveSource.roundId, liveSource.gameId]);

  async function handlePull() {
    if (pulling) {
      return;
    }
    setPulling(true);
    setFeedback(null);
    const result = await pullLiveMoves(boardId);
    setPulling(false);
    if (result.status === "updated") {
      if (result.addedMoves > 0) {
        const key = result.addedMoves === 1 ? "notation.live.pulled.one" : "notation.live.pulled.other";
        setFeedback({ tone: "success", text: tPanels(locale, key, { count: result.addedMoves }) });
      } else {
        setFeedback({ tone: "success", text: tPanels(locale, "notation.live.upToDate") });
      }
    } else if (result.status === "up-to-date") {
      setFeedback({ tone: "neutral", text: tPanels(locale, "notation.live.upToDate") });
    } else if (result.status === "diverged") {
      setFeedback({ tone: "error", text: tPanels(locale, "notation.live.diverged") });
    } else {
      setFeedback({ tone: "error", text: tPanels(locale, "notation.live.error") });
    }
  }

  function handleJumpToLive() {
    const live = useLiveStore.getState();
    if (live.tableRoundId !== liveSource.roundId) {
      live.setTableRound(liveSource.roundId);
    }
    useStudioStore.getState().setWorkspaceView("live");
  }

  const toneClass =
    feedback?.tone === "success"
      ? "text-studio-success"
      : feedback?.tone === "error"
        ? "text-studio-danger"
        : "text-studio-muted";

  return (
    <div
      data-notation-live-sync=""
      className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-studio-border-subtle bg-studio-bg/50 px-2.5 py-1.5"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-caption font-medium text-studio-muted">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-studio-success" aria-hidden="true" />
          <span>{tPanels(locale, "notation.live.badge")}</span>
        </span>
        {feedback ? (
          <span data-live-pull-feedback="" role="status" className={`truncate text-caption font-medium ${toneClass}`}>
            {feedback.text}
          </span>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button
          size="sm"
          variant="ghost"
          data-jump-to-live=""
          onClick={handleJumpToLive}
          className="h-6 px-2 text-caption"
        >
          <Radio size={12} aria-hidden="true" />
          <span>{tPanels(locale, "notation.live.backToLive")}</span>
        </Button>
        <Button
          size="sm"
          variant="secondary"
          data-pull-live-moves=""
          disabled={pulling}
          onClick={() => void handlePull()}
          className="h-6 px-2 text-caption"
        >
          <RefreshCw size={12} className={pulling ? "animate-spin" : ""} aria-hidden="true" />
          <span>{pulling ? tPanels(locale, "notation.live.pulling") : tPanels(locale, "notation.live.pull")}</span>
        </Button>
      </div>
    </div>
  );
}
