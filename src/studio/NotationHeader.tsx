"use client";

import { Pencil } from "lucide-react";
import { tPanels } from "@/src/i18n/studio-panel-strings.ts";
import type { SiteLocale } from "@/src/i18n/locale.ts";
import type { GameHeaders } from "@/src/chess/pgn";
import { IconButton } from "./ui/Button";

// SIG-1193: PGN placeholders in any UI language. "Black" stayed bright
// before because only the localized fallback ("Pretas") counted as empty.
const PLACEHOLDER_NAMES = new Set(["", "?", "white", "black", "brancas", "pretas"]);

export function isPlaceholderPlayer(name: string | undefined): boolean {
  return PLACEHOLDER_NAMES.has((name ?? "").trim().toLowerCase());
}

function PlayerName({
  name,
  elo,
  fallback,
  inline = false,
}: {
  name?: string;
  elo?: string;
  fallback: string;
  inline?: boolean;
}) {
  const placeholder = isPlaceholderPlayer(name);
  const shown = placeholder ? fallback : name;
  return (
    <span className={`inline-flex min-w-0 items-baseline gap-1.5 ${inline ? "shrink" : ""}`}>
      <span className={`${inline ? "truncate text-body" : "text-title"} font-semibold tracking-tight ${placeholder ? "text-studio-faint" : "text-studio-fg"}`}>
        {shown}
      </span>
      {elo ? <span className={`${inline ? "text-caption" : "text-body"} shrink-0 font-medium tabular-nums text-studio-muted`}>{elo}</span> : null}
    </span>
  );
}

export function NotationHeader({
  headers,
  date,
  event,
  locale = "en",
  onEdit,
  inline = false,
}: {
  headers: GameHeaders;
  date: string | null;
  event: string | null;
  locale?: SiteLocale;
  onEdit: () => void;
  /** SIG-1197: one-line form that shares a row with the toolbar (wide panels). */
  inline?: boolean;
}) {
  const openingTitle = isPlaceholderPlayer(headers.White) && isPlaceholderPlayer(headers.Black) ? headers.Opening : undefined;
  if (inline) {
    const editLabel = tPanels(locale, "notation.header.edit");
    const detail = [event, date].filter(Boolean).join(" · ");
    return (
      <div className="flex min-w-0 flex-1 items-center gap-1" title={detail || undefined}>
        {openingTitle ? (
          <span className="truncate text-body font-semibold text-studio-fg">{openingTitle}</span>
        ) : (
          <span className="flex min-w-0 items-baseline gap-1.5">
            <PlayerName inline name={headers.White} elo={headers.WhiteElo} fallback={tPanels(locale, "notation.header.white")} />
            <span className="shrink-0 text-caption text-studio-faint">{tPanels(locale, "notation.header.vs")}</span>
            <PlayerName inline name={headers.Black} elo={headers.BlackElo} fallback={tPanels(locale, "notation.header.black")} />
          </span>
        )}
        <IconButton label={editLabel} size="sm" className="shrink-0 text-studio-faint hover:text-studio-fg" onClick={onEdit}>
          <Pencil size={12} />
        </IconButton>
      </div>
    );
  }
  return (
    <div className="flex items-start justify-between gap-3 border-b border-studio-border-subtle px-3 py-2.5">
      <div className="min-w-0">
        {/* SIG-1193: with no players (an analysis board), the opening is the title. */}
        {openingTitle ? (
          <div className="truncate text-title font-semibold tracking-tight text-studio-fg">{openingTitle}</div>
        ) : (
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <PlayerName name={headers.White} elo={headers.WhiteElo} fallback={tPanels(locale, "notation.header.white")} />
            <span className="text-dense text-studio-faint">{tPanels(locale, "notation.header.vs")}</span>
            <PlayerName name={headers.Black} elo={headers.BlackElo} fallback={tPanels(locale, "notation.header.black")} />
          </div>
        )}
        {event ? <div className="mt-0.5 truncate text-dense text-studio-muted">{event}</div> : null}
      </div>
      <div className="group flex shrink-0 items-center gap-1.5 pt-0.5 text-dense text-studio-muted">
        {/* SIG-1193: "No date" only on hover — it is a prompt, not information. */}
        {date ? (
          <span className="tabular-nums">{date}</span>
        ) : (
          <span className="text-studio-faint opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
            {tPanels(locale, "notation.header.noDate")}
          </span>
        )}
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
