export function formatYearMonth(
  year: number | null | undefined,
  month: number | null | undefined,
): string {
  if (typeof year !== "number" || !Number.isInteger(year)) {
    return "";
  }
  if (typeof month !== "number" || !Number.isInteger(month) || month < 1 || month > 12) {
    return String(year);
  }
  return `${year}.${String(month).padStart(2, "0")}`;
}
