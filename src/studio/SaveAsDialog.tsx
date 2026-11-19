"use client";

import { useEffect, useRef, useState } from "react";
import { tStudioChrome } from "@/src/i18n/studio-chrome-strings";
import { downloadTextFile } from "@/src/lib/download-file";
import { pgnFilename } from "@/src/lib/pgn-filename";
import { useStudioStore } from "@/src/store/studio-store";
import { suggestedActivePgnFilename } from "./save-board";
import { Button } from "./ui/Button";
import { Dialog } from "./ui/Dialog";

const FIELD_CLASS =
  "h-8 min-w-0 w-full rounded-md border border-studio-border-strong bg-studio-panel px-2 text-body text-studio-fg outline-none focus:border-studio-accent";

export function SaveAsDialog({ onClose }: { onClose: () => void }) {
  const locale = useStudioStore((state) => state.settings.locale);
  const [suggestedName] = useState(() => suggestedActivePgnFilename());
  const [name, setName] = useState(suggestedName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) {
      return;
    }
    input.focus();
    input.select();
    queueMicrotask(() => {
      input.focus();
      input.select();
    });
  }, []);

  function handleSubmit() {
    const filename = pgnFilename(name, suggestedName);
    const state = useStudioStore.getState();
    downloadTextFile(filename, state.exportActivePgn());
    state.setStatus(tStudioChrome(state.settings.locale, "chrome.status.savedAs", { name: filename }));
    onClose();
  }

  return (
    <Dialog
      title={tStudioChrome(locale, "chrome.saveAs.title")}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {tStudioChrome(locale, "chrome.saveAs.cancel")}
          </Button>
          <Button type="submit" variant="primary" form="save-as-form">
            {tStudioChrome(locale, "chrome.saveAs.save")}
          </Button>
        </>
      }
    >
      <form
        id="save-as-form"
        onSubmit={(event) => {
          event.preventDefault();
          handleSubmit();
        }}
      >
        <label className="flex flex-col gap-1 text-caption text-studio-muted">
          {tStudioChrome(locale, "chrome.saveAs.fileName")}
          <input
            ref={inputRef}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={FIELD_CLASS}
          />
        </label>
      </form>
    </Dialog>
  );
}
