"use client";

import { useState } from "react";
import type { GameHeaders } from "@/src/chess/pgn";
import { Button } from "./ui/Button";
import { Dialog } from "./ui/Dialog";
import { PlayerCombobox } from "./ui/PlayerCombobox";

const HEADER_FIELDS: Array<{ key: keyof GameHeaders | string; label: string }> = [
  { key: "White", label: "White" },
  { key: "WhiteElo", label: "White rating" },
  { key: "Black", label: "Black" },
  { key: "BlackElo", label: "Black rating" },
  { key: "Event", label: "Event" },
  { key: "Site", label: "Site" },
  { key: "Date", label: "Date" },
  { key: "Round", label: "Round" },
];

export function GameInfoDialog({
  headers,
  onClose,
  onSave,
}: {
  headers: GameHeaders;
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
      title="Game information"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" form="game-info-form">
            Save
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
          {HEADER_FIELDS.map((field) =>
            field.key === "White" || field.key === "Black" ? (
              <label
                key={field.key}
                className="flex flex-col gap-1 text-caption text-studio-muted"
              >
                {field.label}
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
                {field.label}
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
            Result
            <select
              value={draft.Result ?? "*"}
              onChange={(event) => setField("Result", event.target.value)}
              className={fieldClass}
            >
              <option value="*">Ongoing *</option>
              <option value="1-0">White wins 1-0</option>
              <option value="0-1">Black wins 0-1</option>
              <option value="1/2-1/2">Draw 1/2-1/2</option>
            </select>
          </label>
        </div>
      </form>
    </Dialog>
  );
}
