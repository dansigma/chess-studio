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

export function formatTimeClass(timeClass: string | null | undefined): string {
  if (!timeClass) {
    return "";
  }
  if (timeClass === "daily") {
    return "Daily";
  }
  return timeClass.charAt(0).toUpperCase() + timeClass.slice(1);
}
