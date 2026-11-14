"use client";

// SIG-1338: one column of the dossier's bottom half. This is the frame only —
// a later issue replaces this file with the player's game list and preview.
import type { PlayerGame } from "@/src/lib/player-types";
import { tLibrary } from "@/src/i18n/library-strings";
import { useStudioStore } from "@/src/store/studio-store";
import { Panel } from "../../ui/Panel";

export function DossierGames({ games }: { games: PlayerGame[] }) {
  const locale = useStudioStore((state) => state.settings.locale);
  return (
    <Panel
      as="section"
      aria-label={tLibrary(locale, "library.dossier.gamesList")}
      className="flex min-w-0 flex-col gap-2 p-2"
      data-testid="dossier-games"
    >
      <h3 className="text-caption font-semibold text-studio-muted">
        {tLibrary(locale, "library.dossier.gamesList")}
      </h3>
      <div
        className="min-h-24 rounded border border-dashed border-studio-border-subtle"
        data-testid="dossier-games-empty"
        data-games={games.length}
      />
    </Panel>
  );
}
