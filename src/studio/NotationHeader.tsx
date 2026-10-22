"use client";

import { Pencil } from "lucide-react";
import { tPanels } from "@/src/i18n/studio-panel-strings.ts";
import type { SiteLocale } from "@/src/i18n/locale.ts";
import type { GameHeaders } from "@/src/chess/pgn";
import { IconButton } from "./ui/Button";

function PlayerName({
  name,
  elo,
  fallback,
}: {
  name?: string;
  elo?: string;
  fallback: string;
}) {
  const shown = name && name !== "?" ? name : fallback;
  const muted = !name || name === "?" || name === fallback;
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className={`text-title font-semibold tracking-tight ${muted ? "text-studio-faint" : "text-studio-fg"}`}>
        {shown}
      </span>
      {elo ? <span className="text-body font-medium tabular-nums text-studio-muted">{elo}</span> : null}
    </span>
  );
}

export function NotationHeader({
  headers,
  date,
  event,
  locale = "en",
  onEdit,
}: {
  headers: GameHeaders;
  date: string | null;
  event: string | null;
  locale?: SiteLocale;
  onEdit: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-studio-border-subtle px-3 py-2.5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <PlayerName name={headers.White} elo={headers.WhiteElo} fallback={tPanels(locale, "notation.header.white")} />
          <span className="text-dense text-studio-faint">{tPanels(locale, "notation.header.vs")}</span>
          <PlayerName name={headers.Black} elo={headers.BlackElo} fallback={tPanels(locale, "notation.header.black")} />
        </div>
        {event ? <div className="mt-0.5 truncate text-dense text-studio-muted">{event}</div> : null}
      </div>
      <div className="flex shrink-0 items-center gap-1.5 pt-0.5 text-dense text-studio-muted">
        {date ? <span className="tabular-nums">{date}</span> : <span className="text-studio-faint">{tPanels(locale, "notation.header.noDate")}</span>}
        <IconButton
          label={tPanels(locale, "notation.header.edit")}
          size="sm"
          className="text-studio-faint hover:text-studio-fg"
          onClick={onEdit}
        >
          <Pencil size={13} />
        </IconButton>
      </div>
    </div>
  );
}
