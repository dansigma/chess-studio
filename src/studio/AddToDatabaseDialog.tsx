"use client";

import { useState } from "react";
import { tStudioChrome } from "@/src/i18n/studio-chrome-strings";
import { useStudioStore } from "@/src/store/studio-store";
import { Button } from "./ui/Button";
import { Dialog } from "./ui/Dialog";

const FIELD_CLASS =
  "h-8 min-w-0 w-full rounded-md border border-studio-border-strong bg-studio-panel px-2 text-body text-studio-fg outline-none focus:border-studio-accent";

export function AddToDatabaseDialog({ onClose }: { onClose: () => void }) {
  const locale = useStudioStore((state) => state.settings.locale);
  const databases = useStudioStore((state) => state.files.databases);
  const [id, setId] = useState(() => databases[0]?.id ?? "");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const selected = databases.some((database) => database.id === id) ? id : "";

  return (
    <Dialog
      title={tStudioChrome(locale, "chrome.addToDatabase.title")}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {tStudioChrome(locale, "chrome.saveAs.cancel")}
          </Button>
          <Button type="submit" variant="primary" form="add-to-database-form" disabled={!selected && !name.trim()}>
            {tStudioChrome(locale, "chrome.addToDatabase.add")}
          </Button>
        </>
      }
    >
      <form
        id="add-to-database-form"
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const state = useStudioStore.getState();
          if (state.addActiveGameToDatabase(selected ? { id: selected } : { name })) {
            onClose();
          } else {
            setError(useStudioStore.getState().statusMessage);
          }
        }}
      >
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
            <option value="">{tStudioChrome(locale, "chrome.addToDatabase.create")}</option>
          </select>
        </label>
        {!selected ? (
          <label className="flex flex-col gap-1 text-caption text-studio-muted">
            {tStudioChrome(locale, "chrome.addToDatabase.name")}
            <input required value={name} onChange={(event) => setName(event.target.value)} className={FIELD_CLASS} />
          </label>
        ) : null}
        {error ? <p role="alert">{error}</p> : null}
      </form>
    </Dialog>
  );
}
