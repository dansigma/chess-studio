"use client";

import { useState } from "react";
import { useStudioStore } from "@/src/store/studio-store";
import { MAX_LAYOUT_NAME_LENGTH, MAX_SAVED_LAYOUTS, savedLayoutKey } from "./dock-layouts";
import { Button } from "./ui/Button";
import { Dialog } from "./ui/Dialog";
import { tStudioChrome } from "@/src/i18n/studio-chrome-strings";

const FIELD_CLASS =
  "h-8 min-w-0 flex-1 rounded-md border border-studio-border-strong bg-studio-panel px-2 text-body text-studio-fg outline-none focus:border-studio-accent";

function SaveLayoutDialog() {
  const locale = useStudioStore((state) => state.settings.locale);
  const count = useStudioStore((state) => state.savedLayouts.length);
  const close = () => useStudioStore.getState().setLayoutDialog(null);
  const [name, setName] = useState("");
  const full = count >= MAX_SAVED_LAYOUTS;
  return (
    <Dialog
      title={tStudioChrome(locale, "chrome.layouts.saveTitle")}
      onClose={close}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {tStudioChrome(locale, "chrome.layouts.cancel")}
          </Button>
          <Button type="submit" variant="primary" form="save-layout-form" disabled={full || name.trim() === ""}>
            {tStudioChrome(locale, "chrome.layouts.saveConfirm")}
          </Button>
        </>
      }
    >
      <form
        id="save-layout-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!full && useStudioStore.getState().saveCurrentLayout(name)) {
            close();
          }
        }}
      >
        <label className="flex flex-col gap-1 text-caption text-studio-muted">
          {tStudioChrome(locale, "chrome.layouts.nameLabel")}
          <input
            autoFocus
            value={name}
            maxLength={MAX_LAYOUT_NAME_LENGTH}
            placeholder={tStudioChrome(locale, "chrome.layouts.namePlaceholder")}
            onChange={(event) => setName(event.target.value)}
            className={FIELD_CLASS}
          />
        </label>
        {full ? (
          <p className="mt-2 text-caption text-studio-danger">
            {tStudioChrome(locale, "chrome.layouts.limit", { max: MAX_SAVED_LAYOUTS })}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}

function LayoutRow({ id, name }: { id: string; name: string }) {
  const locale = useStudioStore((state) => state.settings.locale);
  const isCurrent = useStudioStore((state) => state.currentLayoutKey === savedLayoutKey(id));
  const [draft, setDraft] = useState<string | null>(null);
  const store = useStudioStore.getState;
  if (draft !== null) {
    return (
      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (store().renameSavedLayout(id, draft)) {
            setDraft(null);
          }
        }}
      >
        <input
          autoFocus
          aria-label={tStudioChrome(locale, "chrome.layouts.nameLabel")}
          value={draft}
          maxLength={MAX_LAYOUT_NAME_LENGTH}
          onChange={(event) => setDraft(event.target.value)}
          className={FIELD_CLASS}
        />
        <Button type="submit" size="sm" variant="primary" disabled={draft.trim() === ""}>
          {tStudioChrome(locale, "chrome.layouts.renameConfirm")}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
          {tStudioChrome(locale, "chrome.layouts.cancel")}
        </Button>
      </form>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <span className="min-w-0 flex-1 truncate text-studio-fg">
        {name}
        {isCurrent ? (
          <span className="ml-2 text-caption text-studio-accent-text">
            {tStudioChrome(locale, "chrome.layouts.current")}
          </span>
        ) : null}
      </span>
      <Button size="sm" variant="secondary" onClick={() => store().applySavedLayout(id)}>
        {tStudioChrome(locale, "chrome.layouts.apply")}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setDraft(name)}>
        {tStudioChrome(locale, "chrome.layouts.rename")}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => store().updateSavedLayout(id)}>
        {tStudioChrome(locale, "chrome.layouts.update")}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => store().deleteSavedLayout(id)}>
        {tStudioChrome(locale, "chrome.layouts.delete")}
      </Button>
    </div>
  );
}

function ManageLayoutsDialog() {
  const locale = useStudioStore((state) => state.settings.locale);
  const layouts = useStudioStore((state) => state.savedLayouts);
  const close = () => useStudioStore.getState().setLayoutDialog(null);
  return (
    <Dialog
      width="w-[40rem]"
      title={tStudioChrome(locale, "chrome.layouts.manageTitle")}
      onClose={close}
      footer={
        <Button variant="primary" onClick={close}>
          {tStudioChrome(locale, "chrome.layouts.done")}
        </Button>
      }
    >
      {layouts.length === 0 ? (
        <p>{tStudioChrome(locale, "chrome.layouts.empty")}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {layouts.map((layout) => (
            <LayoutRow key={layout.id} id={layout.id} name={layout.name} />
          ))}
        </div>
      )}
    </Dialog>
  );
}

// SIG-1316: hosts the Save / Manage layouts dialogs opened from the View
// menu and the board context menu (store flag `layoutDialog`).
export function LayoutDialogs() {
  const dialog = useStudioStore((state) => state.layoutDialog);
  if (dialog === "save") {
    return <SaveLayoutDialog />;
  }
  if (dialog === "manage") {
    return <ManageLayoutsDialog />;
  }
  return null;
}
