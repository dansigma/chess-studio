import { tLibrary } from "@/src/i18n/library-strings";
import {
  databaseSaveErrorMessage,
  loadRemoteFiles,
  localizedSaveError,
  TOO_MANY_DATABASES_MESSAGE,
  TOO_MANY_GAMES_MESSAGE,
} from "@/src/lib/user-files";
import { useStudioStore } from "@/src/store/studio-store";

export async function syncAccountLibrary(userId: string, isCancelled: () => boolean): Promise<void> {
  const isCurrent = () => !isCancelled() && useStudioStore.getState().user?.id === userId;
  let remote;
  try {
    remote = await loadRemoteFiles(userId);
  } catch (error) {
    if (isCurrent()) {
      const { settings: { locale }, setStatus } = useStudioStore.getState();
      const message = typeof error === "object" && error !== null &&
        "message" in error && typeof error.message === "string" ? error.message.trim() : "";
      const saveError = message && databaseSaveErrorMessage({ message });
      const reason = saveError === TOO_MANY_DATABASES_MESSAGE || saveError === TOO_MANY_GAMES_MESSAGE
        ? localizedSaveError(saveError, locale)
        : locale === "en" ? message : "";
      setStatus(reason
        ? tLibrary(locale, "library.sync.loadFailed", { reason })
        : tLibrary(locale, "library.sync.loadFailedWithoutReason"));
    }
    return;
  }
  if (!isCurrent()) {
    return;
  }
  try {
    await useStudioStore.getState().uploadLocalDatabases(remote);
  } catch {
    if (isCurrent()) {
      const { settings: { locale }, setStatus } = useStudioStore.getState();
      setStatus(tLibrary(locale, "library.sync.uploadFailed"));
    }
  }
}
