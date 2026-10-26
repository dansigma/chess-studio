// SIG-1093: single repertoire-deviation line for the Review panel.
// Presentational; the sentence is built by `deviationReviewText` so this
// component stays a thin typographic wrapper.
export function DeviationLine({ text }: { text: string }) {
  return <p className="px-3 py-1 text-caption text-studio-muted">{text}</p>;
}

export function DeviationAction({
  label,
  hint,
  disabled,
  onClick,
}: {
  label: string;
  hint?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <div className="px-3 pb-1">
      <button
        type="button"
        title={hint ?? label}
        aria-label={label}
        disabled={disabled ?? false}
        onClick={onClick}
        className="text-caption font-medium text-studio-accent-text hover:underline disabled:cursor-default disabled:text-studio-disabled disabled:hover:no-underline"
      >
        {label}
      </button>
    </div>
  );
}
