import type { ResultWinner } from "../ResultMark";

export type PlayerOutcome = "won" | "lost" | "neutral";

export function outcomeFor(winner: ResultWinner, side: "white" | "black"): PlayerOutcome {
  if (winner === side) {
    return "won";
  }
  if (winner === "white" || winner === "black") {
    return "lost";
  }
  return "neutral";
}

// SIG-1192: name truncates, rating never does; the winner is bold and the
// loser muted (ChessBase convention) so results scan without the Res. column.
// SIG-1291 (Live): optional FIDE `title` and federation `fed`, and `emphasis`,
// a separate bold for "followed / open" rows that does not mean "winner".
export function PlayerCell({
  name,
  rating,
  outcome,
  title,
  fed,
  emphasis,
}: {
  name: string;
  rating: number | null;
  outcome: PlayerOutcome;
  title?: string | null;
  fed?: string | null;
  emphasis?: boolean;
}) {
  const tone =
    outcome === "won"
      ? "font-semibold text-studio-fg"
      : outcome === "lost"
        ? "text-studio-muted"
        : "text-studio-fg";
  const bold = emphasis && outcome !== "won" ? "font-semibold" : "";
  return (
    <span className="flex min-w-0 items-baseline gap-1.5">
      {title ? <span className="shrink-0 text-caption font-medium text-studio-muted">{title}</span> : null}
      <span className={`truncate ${tone} ${bold}`} title={name}>
        {name}
      </span>
      {rating != null ? (
        <span className="shrink-0 text-caption tabular-nums text-studio-faint">{rating}</span>
      ) : null}
      {fed ? <span className="shrink-0 text-caption uppercase text-studio-faint">{fed}</span> : null}
    </span>
  );
}
