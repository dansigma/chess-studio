"use client";

import { useId, useState } from "react";
import { tLibrary } from "@/src/i18n/library-strings";
import { tStudioChrome } from "@/src/i18n/studio-chrome-strings";
import { fileSourceId } from "@/src/lib/library/file-source";
import { MAX_DATABASES } from "@/src/lib/user-files";
import { useStudioStore } from "@/src/store/studio-store";
import { buildFolderTree } from "../files-tree";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { useSelectedFolderId } from "./LibraryFolders";
import { LibraryLoadingStatus } from "./LibraryLoadingStatus";
import { registerLibraryAdapters } from "./library-sources";
import { useLibraryStore } from "./library-store";

const FIELD_CLASS =
  "h-8 min-w-0 w-full rounded-md border border-studio-border-strong bg-studio-panel px-2 text-body text-studio-fg outline-none focus:border-studio-accent";

export function NewDatabaseDialog({ onClose }: { onClose: () => void }) {
  const formId = useId();
  const locale = useStudioStore((state) => state.settings.locale);
  const filesHydrated = useStudioStore((state) => state.filesHydrated);
  const folders = useStudioStore((state) => state.files.folders);
  const count = useStudioStore((state) => state.files.databases.length);
  const selectedFolderId = useSelectedFolderId();
  const [name, setName] = useState("");
  const [folderId, setFolderId] = useState(selectedFolderId ?? "");
  const [error, setError] = useState<string | null>(null);
  const options = buildFolderTree(folders, [], "").folderOptions;
  const destination = options.some((option) => option.id === folderId) ? folderId : "";
  const atLimit = count >= MAX_DATABASES;
  const canCreate = filesHydrated && !atLimit && Boolean(name.trim());

  function createDatabase() {
    if (!canCreate) return;
    const id = useStudioStore.getState().createFileDatabase(name, destination || null);
    if (!id) {
      // The store reports why (e.g. the quota was reached since the dialog opened).
      setError(useStudioStore.getState().statusMessage);
      return;
    }

    // Register the file source before selecting it so it can be resolved immediately.
    registerLibraryAdapters(useStudioStore.getState().files.databases);
    const library = useLibraryStore.getState();
    library.setFolderId(destination || null);
    library.setSources([fileSourceId(id)]);
    library.selectGame(null);
    if (destination) {
      const path: string[] = [];
      for (
        let folder = folders.find((item) => item.id === destination);
        folder && !path.includes(folder.id);
        folder = folders.find((item) => item.id === folder?.parentId)
      ) {
        path.push(folder.id);
      }
      library.revealFolders(path);
    }
    onClose();
  }

  return (
    <Dialog
      title={tLibrary(locale, "library.newDatabase.title")}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {tStudioChrome(locale, "chrome.saveAs.cancel")}
          </Button>
          <Button type="submit" variant="primary" form={formId} disabled={!canCreate}>
            {tLibrary(locale, "library.folders.create")}
          </Button>
        </>
      }
    >
      {!filesHydrated ? <LibraryLoadingStatus /> : (
        <form
          id={formId}
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            createDatabase();
          }}
        >
          <label className="flex flex-col gap-1 text-caption text-studio-muted">
            {tLibrary(locale, "library.newDatabase.name")}
            <input required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} className={FIELD_CLASS} />
          </label>
          <label className="flex flex-col gap-1 text-caption text-studio-muted">
            {tLibrary(locale, "library.folders.destination")}
            <select value={destination} onChange={(event) => setFolderId(event.target.value)} className={FIELD_CLASS}>
              <option value="">{tLibrary(locale, "library.folders.none")}</option>
              {options.map((option) => (
                <option key={option.id} value={option.id}>{"\u00a0\u00a0".repeat(option.depth)}{option.name}</option>
              ))}
            </select>
          </label>
          <p>{tLibrary(locale, "library.newDatabase.quota", { count, limit: MAX_DATABASES })}</p>
          {atLimit ? <p role="alert">{tLibrary(locale, "library.quota.databases")}</p> : error ? <p role="alert">{error}</p> : null}
        </form>
      )}
    </Dialog>
  );
}
