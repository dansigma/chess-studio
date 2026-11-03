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
export function PlayerCell({
  name,
  rating,
  outcome,
}: {
  name: string;
  rating: number | null;
  outcome: PlayerOutcome;
}) {
  const tone =
    outcome === "won"
      ? "font-semibold text-studio-fg"
      : outcome === "lost"
        ? "text-studio-muted"
        : "text-studio-fg";
  return (
    <span className="flex min-w-0 items-baseline gap-1.5">
      <span className={`truncate ${tone}`} title={name}>
        {name}
      </span>
      {rating != null ? (
        <span className="shrink-0 text-caption tabular-nums text-studio-faint">{rating}</span>
      ) : null}
    </span>
  );
}
