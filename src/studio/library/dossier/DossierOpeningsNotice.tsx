"use client";

// SIG-1345: one line above the dossier opening cards explains why the cards
// have no own numbers: the user is signed out, or the user's games failed to
// load. The successful/loading states render nothing.
import { tLibrary } from "@/src/i18n/library-strings";
import { useStudioStore } from "@/src/store/studio-store";
import { useMyGamesForDossier } from "./use-my-games-for-dossier";

// SIG-1345 review: the notice needs no games or colour — it only explains a
// signed-out or failed load, and the cards own the per-line numbers.
export function DossierOpeningsNotice() {
  const locale = useStudioStore((state) => state.settings.locale);
  const myGames = useMyGamesForDossier();

  if (myGames.status === "signedOut") {
    return (
      <p role="status" data-testid="dossier-own-games-signin" className="text-caption text-studio-faint">
        {tLibrary(locale, "library.dossier.ownGamesSignIn")}
      </p>
    );
  }
  if (myGames.status === "error") {
    return (
      <div
        role="alert"
        data-testid="dossier-own-games-error"
        className="flex flex-wrap items-center gap-2 text-caption text-studio-muted"
      >
        <span>{tLibrary(locale, "library.dossier.ownGamesError")}</span>
        <button
          type="button"
          data-testid="dossier-own-games-retry"
          onClick={myGames.retry}
          className="rounded px-1.5 py-0.5 text-caption font-medium text-studio-accent-text hover:bg-studio-hover"
        >
          {tLibrary(locale, "library.dossier.retry")}
        </button>
      </div>
    );
  }
  return null;
}
