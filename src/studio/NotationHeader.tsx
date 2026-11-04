"use client";

import { ExternalLink, Pencil } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { tPanels } from "@/src/i18n/studio-panel-strings.ts";
import type { SiteLocale } from "@/src/i18n/locale.ts";
import type { GameHeaders } from "@/src/chess/pgn";
import { isPlaceholderPlayer } from "@/src/chess/player-names.ts";
import { gameHeaderInfo, type GameHeaderInfo } from "@/src/chess/game-header-info.ts";
import { IconButton } from "./ui/Button";
import { Badge } from "./ui/Controls";

export { isPlaceholderPlayer };

function PlayerName({
  name,
  elo,
  fallback,
  title,
  inline = false,
}: {
  name?: string;
  elo?: string;
  title?: string | null;
  fallback: string;
  inline?: boolean;
}) {
  const placeholder = isPlaceholderPlayer(name);
  const shown = placeholder ? fallback : name;
  return (
    <span className="inline-flex min-w-0 items-baseline gap-1.5" title={placeholder ? undefined : name}>
      {title && !placeholder ? (
        <span className="shrink-0 text-caption font-semibold tracking-wide text-studio-accent-text">{title}</span>
      ) : null}
      <span className={`${inline ? "truncate text-body" : "text-title"} font-semibold tracking-tight ${placeholder ? "text-studio-faint" : "text-studio-fg"}`}>
        {shown}
      </span>
      {elo ? <span className={`${inline ? "text-caption" : "text-body"} shrink-0 font-medium tabular-nums text-studio-muted`}>{elo}</span> : null}
    </span>
  );
}

function ResultChip({ result, vs }: { result: GameHeaderInfo["result"]; vs: string }) {
  if (!result) {
    return <span className="shrink-0 text-dense text-studio-faint">{vs}</span>;
  }
  return (
    <span className="shrink-0 rounded-[5px] bg-studio-hover-strong px-1.5 text-dense font-semibold tabular-nums text-studio-fg">
      {result}
    </span>
  );
}

function infoItems(info: GameHeaderInfo, locale: SiteLocale): { key: string; text: string; node: ReactNode; shrink?: boolean }[] {
  const items: { key: string; text: string; node: ReactNode; shrink?: boolean }[] = [];
  if (info.source) {
    const { label, url } = info.source;
    items.push({
      key: "source",
      text: label,
      node: url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${tPanels(locale, "notation.header.openGame")} (${label})`}
          className="inline-flex items-center gap-0.5 hover:text-studio-fg hover:underline"
        >
          {label}
          <ExternalLink size={10} aria-hidden />
        </a>
      ) : (
        label
      ),
    });
  }
  if (info.event) {
    const text = info.round ? `${info.event} · ${info.round}` : info.event;
    items.push({ key: "event", text, node: <span className="truncate">{text}</span>, shrink: true });
  }
  if (info.site) {
    items.push({ key: "site", text: info.site, node: <span className="truncate">{info.site}</span>, shrink: true });
  }
  if (info.date) {
    items.push({ key: "date", text: info.date.text, node: <span className="tabular-nums">{info.date.text}</span> });
  }
  if (info.eco || info.openingName) {
    const text = [info.eco, info.openingName].filter(Boolean).join(" ");
    items.push({
      key: "opening",
      text,
      shrink: true,
      node: (
        <span className="inline-flex min-w-0 items-center gap-1">
          {info.eco ? <Badge tone="accent">{info.eco}</Badge> : null}
          {info.openingName ? <span className="truncate">{info.openingName}</span> : null}
        </span>
      ),
    });
  }
  if (info.timeControl) {
    items.push({ key: "time", text: info.timeControl.text, node: info.timeControl.text });
  }
  return items;
}

function InfoLine({ items }: { items: ReturnType<typeof infoItems> }) {
  return (
    <div
      className="mt-0.5 flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap text-caption text-studio-muted"
      data-testid="notation-header-info"
      title={items.map((item) => item.text).join(" · ")}
    >
      {items.map((item, index) => (
        <Fragment key={item.key}>
          {index > 0 ? <span className="shrink-0 text-studio-faint" aria-hidden>·</span> : null}
          <span className={`inline-flex items-center ${item.shrink ? "min-w-0" : "shrink-0"}`}>{item.node}</span>
        </Fragment>
      ))}
    </div>
  );
}

export function NotationHeader({
  headers,
  locale = "en",
  onEdit,
  inline = false,
}: {
  headers: GameHeaders;
  locale?: SiteLocale;
  onEdit: () => void;
  /** SIG-1197: one-line form that shares a row with the toolbar (wide panels). */
  inline?: boolean;
}) {
  const info = gameHeaderInfo(headers, locale);
  const openingTitle = isPlaceholderPlayer(headers.White) && isPlaceholderPlayer(headers.Black) ? headers.Opening : undefined;
  const vs = tPanels(locale, "notation.header.vs");
  const editLabel = tPanels(locale, "notation.header.edit");
  const items = openingTitle ? infoItems({ ...info, eco: null, openingName: null }, locale) : infoItems(info, locale);
  if (inline) {
    // SIG-1213: wide panels share the row with the toolbar, but the game
    // details still get their own caption line under the players.
    return (
      <div className="flex min-w-0 flex-1 items-center gap-1">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1">
            {openingTitle ? (
              <span className="truncate text-body font-semibold text-studio-fg">{openingTitle}</span>
            ) : (
              <span className="flex min-w-0 items-center gap-1.5" data-testid="notation-header-players">
                <PlayerName inline name={headers.White} elo={headers.WhiteElo} title={info.whiteTitle} fallback={tPanels(locale, "notation.header.white")} />
                <ResultChip result={info.result} vs={vs} />
                <PlayerName inline name={headers.Black} elo={headers.BlackElo} title={info.blackTitle} fallback={tPanels(locale, "notation.header.black")} />
              </span>
            )}
            <IconButton label={editLabel} size="sm" className="shrink-0 text-studio-faint hover:text-studio-fg" onClick={onEdit}>
              <Pencil size={12} />
            </IconButton>
          </div>
          {items.length > 0 ? <InfoLine items={items} /> : null}
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start justify-between gap-2 border-b border-studio-border-subtle px-3 py-1.5">
      <div className="min-w-0 flex-1">
        {/* SIG-1193: with no players (an analysis board), the opening is the title. */}
        {openingTitle ? (
          <div className="truncate text-title font-semibold tracking-tight text-studio-fg">{openingTitle}</div>
        ) : (
          <div className="flex min-w-0 items-baseline gap-2" data-testid="notation-header-players">
            <PlayerName name={headers.White} elo={headers.WhiteElo} title={info.whiteTitle} fallback={tPanels(locale, "notation.header.white")} />
            <ResultChip result={info.result} vs={vs} />
            <PlayerName name={headers.Black} elo={headers.BlackElo} title={info.blackTitle} fallback={tPanels(locale, "notation.header.black")} />
          </div>
        )}
        {items.length > 0 ? <InfoLine items={items} /> : null}
      </div>
      <div className="group flex shrink-0 items-center pt-0.5 text-dense text-studio-muted">
        {/* SIG-1193: "No date" only on hover — it is a prompt, not information. */}
        {!info.date ? (
          <span className="mr-1.5 text-studio-faint opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
            {tPanels(locale, "notation.header.noDate")}
          </span>
        ) : null}
        <IconButton label={editLabel} size="sm" className="text-studio-faint hover:text-studio-fg" onClick={onEdit}>
          <Pencil size={13} />
        </IconButton>
      </div>
    </div>
  );
}
