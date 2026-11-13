import type { ReactNode } from "react";
import type { PlayerOutcome } from "../ui/PlayerCell";
import { shortPlayerName } from "./live-games-filter";

/** GM stands out (solid accent); the other high titles get the soft accent; the rest a neutral pill. */
export function titleTone(title: string): "strong" | "accent" | "neutral" {
  const t = title.toUpperCase();
  if (t === "GM") {
    return "strong";
  }
  if (t === "IM" || t === "WGM") {
    return "accent";
  }
  return "neutral";
}

const TITLE_CLASSES: Record<ReturnType<typeof titleTone>, string> = {
  strong: "bg-studio-accent text-studio-accent-fg",
  accent: "bg-studio-accent-soft text-studio-accent-text",
  neutral: "bg-studio-hover-strong text-studio-fg-secondary",
};

export function TitleBadge({ title }: { title: string }) {
  return (
    <span
      className={`inline-flex h-4 shrink-0 items-center rounded px-1 text-[10px] font-bold leading-none tracking-wide ${TITLE_CLASSES[titleTone(title)]}`}
      data-live-title={title}
    >
      {title}
    </span>
  );
}

function FedChip({ fed }: { fed: string }) {
  return (
    <span className="shrink-0 rounded border border-studio-border px-1 text-[10px] font-medium uppercase leading-[14px] tracking-wide text-studio-muted">
      {fed}
    </span>
  );
}

type LivePlayer = { name: string; title: string | null; rating: number | null; fed?: string | null };

/**
 * A player in Live. `stacked` (games table): title + name on the first line, rating, federation and
 * `extra` (the clock on narrow screens) on the second, so the name gets the full cell width.
 * `inline` (board cards): everything on one line, the name truncating first.
 * The winner is bold and the loser muted, as in `PlayerCell`; `emphasis` bolds a followed row.
 */
export function LivePlayerCell({
  player,
  outcome,
  emphasis = false,
  layout = "stacked",
  align = "start",
  extra,
  shortName = false,
}: {
  player: LivePlayer;
  outcome: PlayerOutcome;
  emphasis?: boolean;
  layout?: "stacked" | "inline";
  align?: "start" | "end";
  extra?: ReactNode;
  /** Games table: "Surname, Firstname" as "F. Surname"; the full name stays in the tooltip. */
  shortName?: boolean;
}) {
  const tone =
    outcome === "won" ? "font-semibold text-studio-fg" : outcome === "lost" ? "text-studio-muted" : "text-studio-fg";
  const weight = emphasis || outcome === "won" ? "font-semibold" : "font-medium";
  const justify = align === "end" ? "justify-end" : "";
  const name = (
    <span className={`min-w-0 truncate ${tone} ${weight}`} title={player.name}>
      {shortName ? shortPlayerName(player.name) : player.name}
    </span>
  );
  const rating =
    player.rating != null ? (
      <span className="shrink-0 tabular-nums text-studio-fg-secondary">{player.rating}</span>
    ) : null;

  if (layout === "inline") {
    return (
      <span className="flex min-w-0 items-center gap-1.5 text-dense">
        {player.title ? <TitleBadge title={player.title} /> : null}
        {name}
        {rating ? <span className="shrink-0 text-caption">{rating}</span> : null}
        {player.fed ? <FedChip fed={player.fed} /> : null}
      </span>
    );
  }
  return (
    <span className={`flex min-w-0 flex-col gap-0.5 ${align === "end" ? "items-end text-right" : ""}`}>
      <span className={`flex w-full min-w-0 items-center gap-1.5 text-dense ${justify}`}>
        {player.title ? <TitleBadge title={player.title} /> : null}
        {name}
      </span>
      {rating || player.fed || extra ? (
        <span className={`flex w-full min-w-0 items-center gap-1.5 text-caption leading-none ${justify}`}>
          {rating}
          {player.fed ? <FedChip fed={player.fed} /> : null}
          {extra}
        </span>
      ) : null}
    </span>
  );
}
