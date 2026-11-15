/** SIG-1258: loading placeholder. One line tall (`1lh` of the parent's text size), so data arriving does not move the layout. */
export function Skeleton({ className = "", lines = 1 }: { className?: string; lines?: number }) {
  return (
    <span
      aria-hidden
      style={{ height: `${lines}lh` }}
      className={`block animate-pulse rounded bg-studio-hover-strong ${className}`}
    />
  );
}
