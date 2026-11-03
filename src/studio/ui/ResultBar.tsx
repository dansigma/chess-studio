// SIG-1192: 12% squeezed labels like "14%" into slivers; below 18% the
// segment stays unlabeled (the aria-label still carries every share).
const MIN_LABEL_PERCENT = 18;

export function ResultBar({
  white,
  draws,
  black,
}: {
  white: number;
  draws: number;
  black: number;
}) {
  const total = Math.max(1, white + draws + black);
  const segments = [
    { key: "white", value: white, className: "bg-studio-win text-studio-loss" },
    { key: "draws", value: draws, className: "bg-studio-draw text-studio-loss" },
    { key: "black", value: black, className: "bg-studio-result-black text-studio-win" },
  ];
  return (
    <span
      className="flex h-[18px] overflow-hidden rounded-[5px] text-[10px] font-semibold leading-[18px] tabular-nums outline outline-1 outline-studio-border-strong"
      aria-label={`White ${Math.round((white / total) * 100)}%, draw ${Math.round((draws / total) * 100)}%, Black ${Math.round((black / total) * 100)}%`}
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
            style={{ width: `${percent}%` }}
          >
            {percent >= MIN_LABEL_PERCENT ? `${Math.round(percent)}%` : ""}
          </span>
        );
      })}
    </span>
  );
}
