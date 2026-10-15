"use client";

import { Pencil } from "lucide-react";
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
  onEdit,
}: {
  headers: GameHeaders;
  date: string | null;
  event: string | null;
  onEdit: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-studio-border-subtle px-3 py-2.5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <PlayerName name={headers.White} elo={headers.WhiteElo} fallback="White" />
          <span className="text-dense text-studio-faint">vs</span>
          <PlayerName name={headers.Black} elo={headers.BlackElo} fallback="Black" />
        </div>
        {event ? <div className="mt-0.5 truncate text-dense text-studio-muted">{event}</div> : null}
      </div>
      <div className="flex shrink-0 items-center gap-1.5 pt-0.5 text-dense text-studio-muted">
        {date ? <span className="tabular-nums">{date}</span> : <span className="text-studio-faint">No date</span>}
        <IconButton
          label="Edit game information"
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
