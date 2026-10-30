// SIG-1115: informational access-tier badge for catalog cards and the
// course header. Presentational: the label comes from tierLabel (already
// localized), so this component reads no locale itself.
export function TierBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-studio-border bg-studio-chrome px-2 py-0.5 text-caption text-studio-muted">
      {label}
    </span>
  );
}
