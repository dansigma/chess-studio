/** SIG-1364: pure helpers for the Informações inputs (hours + minutes, Elo text). */

/** Keeps only digits (the inputs are numeric text fields). */
export function digitsOnly(text: string): string {
  return text.replace(/\D/g, "");
}

/** Parses an Elo text input: empty is null, digits become an integer. */
export function parseEloInput(text: string): number | null {
  const digits = digitsOnly(text);
  if (digits === "") {
    return null;
  }
  const value = Number(digits);
  return Number.isSafeInteger(value) ? value : Number.MAX_SAFE_INTEGER;
}

/** Text shown in an Elo input for a stored value. */
export function eloInputText(value: number | null): string {
  return value === null ? "" : String(value);
}

/** Total minutes from the hours and minutes texts; both empty is null. */
export function minutesFromHm(hours: string, minutes: string): number | null {
  const h = digitsOnly(hours);
  const m = digitsOnly(minutes);
  if (h === "" && m === "") {
    return null;
  }
  const total = Number(h || "0") * 60 + Number(m || "0");
  return Number.isSafeInteger(total) ? total : Number.MAX_SAFE_INTEGER;
}

/** Splits stored minutes into the hours and minutes texts. */
export function hmFromMinutes(total: number | null): { hours: string; minutes: string } {
  if (total === null || !Number.isFinite(total) || total < 0) {
    return { hours: "", minutes: "" };
  }
  const whole = Math.floor(total);
  return { hours: String(Math.floor(whole / 60)), minutes: String(whole % 60) };
}
