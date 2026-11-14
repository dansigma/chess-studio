// SIG-1347: the Opponent prep panel is retired. The Library player dossier
// supersedes it, so a layout that still contains `opponentPrep` renders a
// short redirect instead of the old Lichess/Chess.com opening tree.
"use client";

import { tPrep } from "@/src/i18n/prep-strings";
import { useStudioStore } from "@/src/store/studio-store";
import { openPlayersLibrary } from "./library/dossier/open-player-dossier";

export function OpponentPrepPanel() {
  const locale = useStudioStore((state) => state.settings.locale);
  return (
    <div className="flex h-full min-h-0 flex-col items-start justify-center gap-3 overflow-auto bg-studio-panel p-4 text-dense text-studio-fg">
      <p className="max-w-sm text-studio-muted">{tPrep(locale, "prep.retired")}</p>
      <button
        type="button"
        onClick={openPlayersLibrary}
        className="rounded bg-studio-accent px-2.5 py-1 text-dense font-medium text-white"
      >
        {tPrep(locale, "prep.openDossier")}
      </button>
    </div>
  );
}
