"use client";

import { Lock, LockOpen } from "lucide-react";
import type { SiteLocale } from "@/src/i18n/locale.ts";
import { tPanels } from "@/src/i18n/studio-panel-strings.ts";
import { IconButton } from "./ui/Button";
import type { LockablePosition } from "./use-lockable-position";

/** SIG-1455: toolbar toggle that keeps a panel on its current position. */
export function PositionLockButton({ position, locale }: { position: LockablePosition; locale: SiteLocale }) {
  const { locked, lockedLabel } = position;
  const label = !locked
    ? tPanels(locale, "position.lock")
    : lockedLabel
      ? tPanels(locale, "position.lockedAt", { move: lockedLabel })
      : tPanels(locale, "position.lockedAtStart");
  return (
    <IconButton
      label={label}
      size="sm"
      active={locked}
      onClick={locked ? position.unlock : position.lock}
      className={locked ? "text-studio-accent-text" : ""}
    >
      {locked ? <Lock size={14} /> : <LockOpen size={14} />}
    </IconButton>
  );
}
