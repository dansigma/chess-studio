"use client";

import { useState } from "react";
import type { SiteLocale } from "@/src/i18n/locale.ts";
import { tPanels } from "@/src/i18n/studio-panel-strings.ts";
import type { GameHeaders } from "@/src/chess/pgn";
import { Button } from "./ui/Button";
import { Dialog } from "./ui/Dialog";
import { PlayerCombobox } from "./ui/PlayerCombobox";

const HEADER_FIELD_KEYS: Array<{ key: keyof GameHeaders | string; labelKey: Parameters<typeof tPanels>[1] }> = [
  { key: "White", labelKey: "dialog.field.white" },
  { key: "WhiteElo", labelKey: "dialog.field.whiteRating" },
  { key: "Black", labelKey: "dialog.field.black" },
  { key: "BlackElo", labelKey: "dialog.field.blackRating" },
  { key: "Event", labelKey: "dialog.field.event" },
  { key: "Site", labelKey: "dialog.field.site" },
  { key: "Date", labelKey: "dialog.field.date" },
  { key: "Round", labelKey: "dialog.field.round" },
];

export function GameInfoDialog({
  headers,
  locale = "en",
  onClose,
  onSave,
}: {
  headers: GameHeaders;
  locale?: SiteLocale;
  onClose: () => void;
  onSave: (headers: GameHeaders) => void;
}) {
  const [draft, setDraft] = useState<GameHeaders>({ ...headers });

  function setField(key: string, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  const fieldClass =
    "h-8 rounded-md border border-studio-border-strong bg-studio-panel px-2 text-body text-studio-fg outline-none focus:border-studio-accent";
  return (
    <Dialog
      title={tPanels(locale, "dialog.title")}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {tPanels(locale, "dialog.cancel")}
          </Button>
          <Button type="submit" variant="primary" form="game-info-form">
            {tPanels(locale, "dialog.save")}
          </Button>
        </>
      }
    >
      <form
        id="game-info-form"
        onSubmit={(event) => {
          event.preventDefault();
          const next: GameHeaders = {};
          for (const [key, value] of Object.entries(draft)) {
            if (value.trim()) {
              next[key] = value.trim();
            }
          }
          onSave(next);
        }}
      >
        <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
          {HEADER_FIELD_KEYS.map((field) =>
            field.key === "White" || field.key === "Black" ? (
              <label
                key={field.key}
                className="flex flex-col gap-1 text-caption text-studio-muted"
              >
                {tPanels(locale, field.labelKey)}
                <PlayerCombobox
                  value={draft[field.key] ?? ""}
                  onChange={(value) => setField(field.key, value)}
                  className={fieldClass}
                />
              </label>
            ) : (
              <label
                key={field.key}
                className="flex flex-col gap-1 text-caption text-studio-muted"
              >
                {tPanels(locale, field.labelKey)}
                <input
                  value={draft[field.key] ?? ""}
                  onChange={(event) => setField(field.key, event.target.value)}
                  className={fieldClass}
                  placeholder={field.key === "Date" ? "YYYY.MM.DD" : undefined}
                />
              </label>
            ),
          )}
          <label className="col-span-2 flex flex-col gap-1 text-caption text-studio-muted">
            {tPanels(locale, "dialog.field.result")}
            <select
              value={draft.Result ?? "*"}
              onChange={(event) => setField("Result", event.target.value)}
              className={fieldClass}
            >
              <option value="*">{tPanels(locale, "dialog.result.ongoing")}</option>
              <option value="1-0">{tPanels(locale, "dialog.result.whiteWins")}</option>
              <option value="0-1">{tPanels(locale, "dialog.result.blackWins")}</option>
              <option value="1/2-1/2">{tPanels(locale, "dialog.result.draw")}</option>
            </select>
          </label>
        </div>
      </form>
    </Dialog>
  );
}
