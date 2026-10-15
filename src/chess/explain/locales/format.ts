/** Evaluation in pawns with an explicit sign, e.g. `+0.3`, `-1.2`; mate-sized scores read as `mate`. */
export function formatPawns(pawns: number, decimalSeparator = "."): string {
  if (Math.abs(pawns) >= 900) {
    return pawns > 0 ? "+M" : "-M";
  }
  const text = Math.abs(pawns).toFixed(1).replace(".", decimalSeparator);
  return `${pawns < 0 ? "-" : "+"}${text}`;
}

/** Joins items as "a", "a and b", "a, b and c" using the given conjunction. */
export function joinList(items: string[], conjunction: string): string {
  if (items.length <= 1) {
    return items.join("");
  }
  return `${items.slice(0, -1).join(", ")} ${conjunction} ${items[items.length - 1]}`;
}
