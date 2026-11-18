"use client";

import Link from "next/link";
import { useState } from "react";
import { Dumbbell, X } from "lucide-react";
import type { SiteLocale } from "@/src/i18n/locale";
import { tMistakes } from "@/src/i18n/mistakes-strings";
import {
  MISTAKES_TRAINER_HREF,
  trainBannerText,
  type TrainBanner,
} from "./train-mistakes";

// SIG-1206: quiet one-line prompt after a review turned mistakes into
// exercises. Rendered outside the report-card export ref. Dismissal is local
// state keyed by the reviewed line, so a new line shows its own banner.
export function TrainMistakesBanner({
  banner,
  locale,
  onStartRetry,
}: {
  banner: TrainBanner & { lineId: string };
  locale: SiteLocale;
  onStartRetry?: () => void;
}) {
  const [dismissedLine, setDismissedLine] = useState<string | null>(null);
  if (dismissedLine === banner.lineId) {
    return null;
  }
  return (
    <div
      data-testid="train-mistakes-banner"
      className="mx-3 mt-2 flex items-center gap-2 rounded-md bg-studio-accent-soft px-2 py-1 text-caption text-studio-fg"
    >
      <Dumbbell aria-hidden className="size-3.5 shrink-0 text-studio-accent-text" />
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className="min-w-0">{trainBannerText(locale, banner)}</span>
        <span className="flex shrink-0 flex-wrap items-center gap-2">
          {onStartRetry ? (
            <button
              type="button"
              onClick={onStartRetry}
              className="font-semibold text-studio-accent-text underline-offset-2 hover:underline"
            >
              {tMistakes(locale, "mistakes.banner.retryBoard")}
            </button>
          ) : null}
          <Link
            href={MISTAKES_TRAINER_HREF}
            className="font-semibold text-studio-accent-text underline-offset-2 hover:underline"
          >
            {tMistakes(locale, "mistakes.banner.action")}
          </Link>
        </span>
      </div>
      <button
        type="button"
        aria-label={tMistakes(locale, "mistakes.banner.dismiss")}
        onClick={() => setDismissedLine(banner.lineId)}
        className="shrink-0 rounded p-0.5 text-studio-muted hover:text-studio-fg"
      >
        <X aria-hidden className="size-3.5" />
      </button>
    </div>
  );
}
