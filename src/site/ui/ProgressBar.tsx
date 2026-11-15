export type ProgressSegment = {
  /** Amount this segment fills, in the same unit as `max`. */
  value: number;
  className?: string;
};

/**
 * Accessible progress bar shared by the catalog, course page and lesson.
 * `className` styles the track (height, background); `fillClassName` the fill.
 * With `segments`, each one renders as its own fill, laid out left to right.
 */
export function ProgressBar({
  value,
  max = 100,
  label,
  className = "h-2 bg-studio-track",
  fillClassName = "rounded-full bg-studio-accent",
  segments,
}: {
  value: number;
  max?: number;
  label: string;
  className?: string;
  fillClassName?: string;
  segments?: ProgressSegment[];
}) {
  const pct = (amount: number) => (max > 0 ? Math.min(100, Math.max(0, (amount / max) * 100)) : 0);
  return (
    <div
      className={`overflow-hidden rounded-full ${className}`}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
    >
      {segments ? (
        <div className="flex h-full">
          {segments.map((segment, index) => (
            <div
              key={index}
              data-segment
              className={`h-full ${segment.className ?? "bg-studio-accent"}`}
              style={{ width: `${pct(segment.value)}%` }}
            />
          ))}
        </div>
      ) : (
        <div className={`h-full ${fillClassName}`} style={{ width: `${pct(value)}%` }} />
      )}
    </div>
  );
}
