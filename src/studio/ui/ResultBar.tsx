// SIG-1192: 12% squeezed labels like "14%" into slivers; below 18% the
// segment stays unlabeled (the aria-label still carries every share).
const MIN_LABEL_PERCENT = 18;

export function ResultBar({
  white,
  draws,
  black,
  perspective = "color",
  label,
}: {
  white: number;
  draws: number;
  black: number;
  /**
   * "color" (default): White / Draw / Black, as in the explorer.
   * "player" (SIG-1304): wins / draws / losses for the player — `white` is
   * wins, `black` is losses — in green / grey / red, with no in-bar labels
   * (the caller shows the counts).
   */
  perspective?: "color" | "player";
  label?: string;
}) {
  const total = Math.max(1, white + draws + black);
  const player = perspective === "player";
  const segments = player
    ? [
        { key: "win", value: white, className: "bg-studio-success" },
        { key: "draws", value: draws, className: "bg-studio-draw" },
        { key: "loss", value: black, className: "bg-studio-danger" },
      ]
    : [
    { key: "white", value: white, className: "bg-studio-win text-studio-loss" },
    { key: "draws", value: draws, className: "bg-studio-draw text-studio-loss" },
    { key: "black", value: black, className: "bg-studio-result-black text-studio-win" },
  ];
  return (
    <span
      className="flex h-[18px] overflow-hidden rounded-[5px] text-[10px] font-semibold leading-[18px] tabular-nums outline outline-1 outline-studio-border-strong"
      data-perspective={perspective}
      role={player ? "img" : undefined}
      aria-label={label ?? `White ${Math.round((white / total) * 100)}%, draw ${Math.round((draws / total) * 100)}%, Black ${Math.round((black / total) * 100)}%`}
    >
      {segments.map((segment) => {
        const percent = (segment.value / total) * 100;
        if (percent === 0) {
          return null;
        }
        return (
          <span
            key={segment.key}
            className={`overflow-hidden whitespace-nowrap text-center ${segment.className}`}
            data-segment={segment.key}
            style={{ width: `${percent}%` }}
          >
            {!player && percent >= MIN_LABEL_PERCENT ? `${Math.round(percent)}%` : ""}
          </span>
        );
      })}
    </span>
  );
}
