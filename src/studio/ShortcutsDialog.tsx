"use client";

import { Fragment } from "react";
import { Dialog } from "./ui/Dialog";
import { Button } from "./ui/Button";
import { Kbd } from "./ui/Controls";
import { SHORTCUT_ENTRIES, SHORTCUT_GROUP_ORDER, type ShortcutEntry } from "./shortcuts-registry";
import { tStudioChrome } from "@/src/i18n/studio-chrome-strings";
import { useStudioStore } from "@/src/store/studio-store";

function ShortcutKeys({ entry }: { entry: ShortcutEntry }) {
  const locale = useStudioStore((state) => state.settings.locale);
  if (entry.gesture) {
    return <span className="shrink-0 text-right text-caption text-studio-faint">{tStudioChrome(locale, entry.gesture)}</span>;
  }
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      {(entry.chords ?? []).map((chord, chordIndex) => (
        <Fragment key={chordIndex}>
          {chordIndex > 0 ? <span className="text-caption text-studio-faint">/</span> : null}
          {chord.map((key, keyIndex) => (
            <Fragment key={key}>
              {keyIndex > 0 ? <span className="text-caption text-studio-faint">+</span> : null}
              <Kbd>{key}</Kbd>
            </Fragment>
          ))}
        </Fragment>
      ))}
    </span>
  );
}

// SIG-1383: Help → "Shortcuts and gestures" reference dialog. Presentational —
// the caller owns open state (StudioShell renders it for both the desktop
// MenuBar and the mobile sheet via the store's `shortcutsOpen` flag).
export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const locale = useStudioStore((state) => state.settings.locale);
  return (
    <Dialog
      width="w-[36rem]"
      title={tStudioChrome(locale, "chrome.shortcuts.title")}
      onClose={onClose}
      footer={
        <Button onClick={onClose}>{tStudioChrome(locale, "chrome.dialog.close")}</Button>
      }
    >
      <div className="flex flex-col gap-4">
        {SHORTCUT_GROUP_ORDER.map((group) => (
          <section key={group}>
            <h3 className="pb-1 text-caption font-semibold uppercase tracking-wider text-studio-faint">
              {tStudioChrome(locale, `chrome.shortcuts.group.${group}`)}
            </h3>
            <ul>
              {SHORTCUT_ENTRIES.filter((entry) => entry.group === group).map((entry, index) => (
                <li key={index} className="flex items-baseline justify-between gap-4 py-1 text-dense">
                  <span className="text-studio-fg">{tStudioChrome(locale, entry.action)}</span>
                  <ShortcutKeys entry={entry} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Dialog>
  );
}
