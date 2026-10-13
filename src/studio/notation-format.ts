import type { Path } from "@/src/chess/tree";

export function pathKey(path: Path): string {
  return path.join(".");
}

export function displayDate(value: string | undefined): string | null {
  if (!value || value.startsWith("?") || value === "????.??.??") {
    return null;
  }
  const [year, month, day] = value.split(".");
  if (!year || year.includes("?")) {
    return null;
  }
  if (!month || month.includes("?")) {
    return year;
  }
  if (!day || day.includes("?")) {
    return `${year}.${month}`;
  }
  return value;
}

export function displayEvent(value: string | undefined): string | null {
  if (!value || value === "?" || value === "Casual game") {
    return null;
  }
  return value;
}
