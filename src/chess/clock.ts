// SIG-1218: PGN `[%clk h:mm:ss(.s)]` <-> milliseconds left after a move.

/** Parse a parser `clk` value ("0:09:57", "0:00:09.8", "9:57") into ms. */
export function parseClockMs(value: unknown): number | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const match = value.trim().match(/^(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)$/);
  if (!match) {
    return undefined;
  }
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const ms = Math.round(((hours * 60 + minutes) * 60 + seconds) * 1000);
  return Number.isFinite(ms) && ms >= 0 ? ms : undefined;
}

/** Format ms as `h:mm:ss`, with one decimal only when under whole-second precision. */
export function formatClockMs(ms: number | undefined): string | undefined {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) {
    return undefined;
  }
  const tenths = Math.round(ms / 100);
  const wholeSeconds = Math.floor(tenths / 10);
  const frac = tenths % 10;
  const h = Math.floor(wholeSeconds / 3600);
  const m = Math.floor((wholeSeconds % 3600) / 60);
  const s = wholeSeconds % 60;
  const base = `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return frac ? `${base}.${frac}` : base;
}

/** The `[%clk ...]` token for a node, or undefined when it has no clock. */
export function clockToken(ms: number | undefined): string | undefined {
  const text = formatClockMs(ms);
  return text ? `[%clk ${text}]` : undefined;
}
