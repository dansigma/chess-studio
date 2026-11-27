"use client";

import { useState } from "react";
import { tLibrary } from "@/src/i18n/library-strings";
import { tStudioChrome } from "@/src/i18n/studio-chrome-strings";
import { MAX_DATABASES } from "@/src/lib/user-files";
import { selectActiveBoard, useStudioStore } from "@/src/store/studio-store";
import { buildFolderTree } from "./files-tree";
import { LibraryLoadingStatus } from "./library/LibraryLoadingStatus";
import { Button } from "./ui/Button";
import { Dialog } from "./ui/Dialog";

const FIELD_CLASS =
  "h-8 min-w-0 w-full rounded-md border border-studio-border-strong bg-studio-panel px-2 text-body text-studio-fg outline-none focus:border-studio-accent";

export function AddToDatabaseDialog({ onClose }: { onClose: () => void }) {
  const locale = useStudioStore((state) => state.settings.locale);
  const filesHydrated = useStudioStore((state) => state.filesHydrated);
  const databases = useStudioStore((state) => state.files.databases);
  const folders = useStudioStore((state) => state.files.folders);
  const activeBoard = useStudioStore(selectActiveBoard);
  const addToDatabasePgn = useStudioStore((state) => state.addToDatabasePgn);
  const [saveAsNew, setSaveAsNew] = useState(false);
  const sourceDatabase = addToDatabasePgn === null
    ? databases.find((database) =>
      database.id === activeBoard.sourceDatabaseId && database.games.some((game) => game.id === activeBoard.sourceGameId),
    )
    : undefined;
  const update = !!sourceDatabase && !saveAsNew;
  const [id, setId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [folderId, setFolderId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const selected = id === null ? databases[0]?.id ?? "" : databases.some((database) => database.id === id) ? id : "";
  const atLimit = databases.length >= MAX_DATABASES;
  const folderOptions = !selected ? buildFolderTree(folders, [], "").folderOptions : [];
  const selectedFolder = folders.some((folder) => folder.id === folderId) ? folderId : "";
  const canSubmit = filesHydrated && (update || !!selected || (!atLimit && !!name.trim()));

  return (
    <Dialog
      title={tStudioChrome(locale, "chrome.addToDatabase.title")}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {tStudioChrome(locale, "chrome.saveAs.cancel")}
          </Button>
          <Button type="submit" variant="primary" form="add-to-database-form" disabled={!canSubmit}>
            {tStudioChrome(locale, update ? "chrome.addToDatabase.update" : "chrome.addToDatabase.add")}
          </Button>
        </>
      }
    >
      {!filesHydrated ? <LibraryLoadingStatus /> : (
        <form
          id="add-to-database-form"
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSubmit) return;
            const state = useStudioStore.getState();
            const destination = selected ? { id: selected } : { name, folderId: selectedFolder || null };
            let saved: boolean;
            if (update && activeBoard.sourceGameId) {
              // Compare by id: autosave replaces the board object without changing the game.
              const current = selectActiveBoard(state);
              if (
                current.id !== activeBoard.id ||
                current.sourceGameId !== activeBoard.sourceGameId ||
                state.addToDatabasePgn !== null
              ) {
                setError(tStudioChrome(locale, "chrome.addToDatabase.invalidDestination"));
                return;
              }
              saved = state.updateFileGame(sourceDatabase.id, activeBoard.sourceGameId, state.exportActivePgn());
            } else {
              saved = state.addToDatabasePgn === null
                ? state.addActiveGameToDatabase(destination)
                : state.addPgnGameToDatabase(state.addToDatabasePgn, destination);
            }
            if (saved) {
              onClose();
            } else {
              setError(useStudioStore.getState().statusMessage);
            }
          }}
        >
          {sourceDatabase && (
            <fieldset className="flex flex-col gap-2">
              <label className="flex items-center gap-2">
                <input type="radio" name="database-save-mode" checked={!saveAsNew} onChange={() => {
                  setSaveAsNew(false);
                  setError(null);
                }} />
                {tStudioChrome(locale, "chrome.addToDatabase.updateGame", { name: sourceDatabase.name })}
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="database-save-mode" checked={saveAsNew} onChange={() => {
                  setSaveAsNew(true);
                  setError(null);
                }} />
                {tStudioChrome(locale, "chrome.addToDatabase.saveAsNew")}
              </label>
            </fieldset>
          )}
          {!update && (
            <>
              <label className="flex flex-col gap-1 text-caption text-studio-muted">
                {tStudioChrome(locale, "chrome.addToDatabase.destination")}
                <select
                  value={selected}
                  onChange={(event) => {
                    setId(event.target.value);
                    setError(null);
                  }}
                  className={FIELD_CLASS}
                >
                  {databases.map((database) => (
                    <option key={database.id} value={database.id}>{database.name}</option>
                  ))}
                  <option value="" disabled={atLimit}>{tStudioChrome(locale, "chrome.addToDatabase.create")}</option>
                </select>
              </label>
              <p className="text-caption text-studio-muted">
                {tStudioChrome(locale, "chrome.addToDatabase.quota", {
                  count: String(databases.length),
                  limit: String(MAX_DATABASES),
                })}
              </p>
              {atLimit ? (
                <p className="text-caption text-studio-muted">
                  {tStudioChrome(locale, "chrome.addToDatabase.databaseLimit", { limit: String(MAX_DATABASES) })}
                </p>
              ) : null}
              {!selected && !atLimit ? (
                <>
                  <label className="flex flex-col gap-1 text-caption text-studio-muted">
                    {tStudioChrome(locale, "chrome.addToDatabase.name")}
                    <input
                      required
                      value={name}
                      onChange={(event) => {
                        setName(event.target.value);
                        setError(null);
                      }}
                      className={FIELD_CLASS}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-caption text-studio-muted">
                    {tStudioChrome(locale, "chrome.addToDatabase.folder")}
                    <select value={selectedFolder} onChange={(event) => {
                        setFolderId(event.target.value);
                        setError(null);
                      }} className={FIELD_CLASS}>
                      <option value="">{tLibrary(locale, "library.folders.none")}</option>
                      {folderOptions.map((folder) => (
                        <option key={folder.id} value={folder.id}>
                          {"\u00a0\u00a0".repeat(folder.depth)}{folder.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              ) : null}
            </>
          )}
          {error ? <p role="alert">{error}</p> : null}
        </form>
      )}
    </Dialog>
  );
}
