// SIG-1093: single repertoire-deviation line for the Review panel.
// Presentational; the sentence is built by `deviationReviewText` so this
// component stays a thin typographic wrapper.
export function DeviationLine({ text }: { text: string }) {
  return <p className="px-3 py-1 text-caption text-studio-muted">{text}</p>;
}
