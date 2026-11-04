// SIG-1212: pure parsing/formatting of PGN headers for the notation header.
// No React, no DOM: `gameHeaderInfo(headers, locale)` returns the typed
// structure the header renders. Only values with real content are returned.
import { tPanels } from "../i18n/studio-panel-strings.ts";
import type { SiteLocale } from "../i18n/locale.ts";
import type { ExplorerSpeed } from "../lib/explorer-filters.ts";
import { chesscomOpeningNameFromUrl } from "../lib/players/chesscom-opening.ts";
import { resolveOpeningName } from "../lib/opening-names.ts";

export type GameResult = "1-0" | "0-1" | "½-½";
export type SourceKind = "chesscom" | "lichess" | "otb";

export type GameHeaderInfo = {
  source: { kind: SourceKind; label: string; url?: string } | null;
  event: string | null;
  round: string | null;
  site: string | null;
  date: { text: string } | null;
  eco: string | null;
  openingName: string | null;
  timeControl: { text: string; speed: ExplorerSpeed | null } | null;
  result: GameResult | null;
  whiteTitle: string | null;
  blackTitle: string | null;
};

const FIDE_TITLES = new Set(["GM", "IM", "FM", "CM", "WGM", "WIM", "WFM", "WCM", "NM"]);
const ABSENT = new Set(["", "?", "-", "????.??.??", "????", "n/a", "unknown"]);
const GENERIC_EVENT = /^(live chess|(rated|casual) .* game)$/i;

function real(value: string | undefined): string | null {
  const text = value?.trim();
  return text && !ABSENT.has(text.toLowerCase()) ? text : null;
}

export function fideTitle(value: string | undefined): string | null {
  const text = real(value)?.toUpperCase() ?? null;
  return text && FIDE_TITLES.has(text) ? text : null;
}

export function resultChip(value: string | undefined): GameResult | null {
  switch (value?.trim()) {
    case "1-0":
      return "1-0";
    case "0-1":
      return "0-1";
    case "1/2-1/2":
    case "½-½":
      return "½-½";
    default:
      return null;
  }
}

/** The parsed https URL when it points at chess.com or lichess.org, else null. */
export function safeGameUrl(value: string | undefined): URL | null {
  const text = real(value);
  if (!text) {
    return null;
  }
  try {
    const url = new URL(text);
    const host = url.hostname.toLowerCase();
    const allowed = ["chess.com", "lichess.org"].some((root) => host === root || host.endsWith(`.${root}`));
    return url.protocol === "https:" && allowed && !url.username && !url.password ? url : null;
  } catch {
    return null;
  }
}

function isUrl(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value);
}

function sourceFor(
  headers: Record<string, string>,
  event: string | null,
  site: string | null,
  locale: SiteLocale,
): GameHeaderInfo["source"] {
  const siteText = (site ?? "").toLowerCase();
  const link = real(headers.Link);
  const chesscom = siteText === "chess.com" || siteText.includes("chess.com") || (link?.toLowerCase().includes("chess.com") ?? false);
  if (chesscom) {
    const url = safeGameUrl(headers.Link) ?? (site && /chess\.com/i.test(site) ? safeGameUrl(site) : null);
    return { kind: "chesscom", label: "Chess.com", ...(url ? { url: url.href } : {}) };
  }
  if (siteText.includes("lichess.org")) {
    const url = safeGameUrl(site ?? undefined);
    return { kind: "lichess", label: "Lichess", ...(url ? { url: url.href } : {}) };
  }
  if (event || site) {
    return { kind: "otb", label: tPanels(locale, "notation.header.otb") };
  }
  return null;
}

/** "2005.07.17" -> "17 jul 2005" / "Jul 17, 2005"; partials keep what is known. */
export function formatHeaderDate(value: string | undefined, locale: SiteLocale): string | null {
  const text = real(value);
  if (!text) {
    return null;
  }
  const [y, m, d] = text.split(/[.\-/]/);
  if (!y || !/^\d{4}$/.test(y)) {
    return null;
  }
  const lang = locale === "pt-br" ? "pt-BR" : "en-US";
  const month = m && /^\d{1,2}$/.test(m) ? Number(m) : null;
  const day = d && /^\d{1,2}$/.test(d) ? Number(d) : null;
  if (month === null || month < 1 || month > 12) {
    return y;
  }
  const at = new Date(Date.UTC(Number(y), month - 1, day ?? 1));
  at.setUTCFullYear(Number(y));
  if (day === null || day < 1 || day > 31) {
    return new Intl.DateTimeFormat(lang, { month: "short", year: "numeric", timeZone: "UTC" })
      .format(at)
      .replace(/\sde\s/g, " ")
      .replace(/\./g, "");
  }
  return new Intl.DateTimeFormat(lang, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    .format(at)
    .replace(/\sde\s/g, " ")
    .replace(/\./g, "");
}

/** Speed class from base seconds + increment, using the Lichess/Chess.com estimate (base + 40 x inc). */
export function speedFromTimeControl(base: number, increment: number): ExplorerSpeed {
  const estimate = base + 40 * increment;
  if (estimate < 180) {
    return "bullet";
  }
  if (estimate < 480) {
    return "blitz";
  }
  if (estimate < 1500) {
    return "rapid";
  }
  return "classical";
}

function formatMinutes(seconds: number): string {
  const minutes = seconds / 60;
  return Number.isInteger(minutes) ? String(minutes) : String(Math.round(minutes * 100) / 100);
}

export function formatTimeControl(value: string | undefined, locale: SiteLocale): GameHeaderInfo["timeControl"] {
  const text = real(value);
  if (!text) {
    return null;
  }
  const daily = /^1\/(\d+)$/.exec(text);
  if (daily) {
    return { text: tPanels(locale, "notation.header.daily"), speed: null };
  }
  const match = /^(\d+)(?:\+(\d+))?$/.exec(text);
  if (!match) {
    return null;
  }
  const base = Number(match[1]);
  const inc = Number(match[2] ?? 0);
  if (base <= 0) {
    return null;
  }
  const speed = speedFromTimeControl(base, inc);
  return { text: `${formatMinutes(base)}+${inc} ${tPanels(locale, `notation.header.speed.${speed}`)}`, speed };
}

export function gameHeaderInfo(headers: Record<string, string>, locale: SiteLocale = "en"): GameHeaderInfo {
  const rawEvent = real(headers.Event);
  const rawSite = real(headers.Site);
  const source = sourceFor(headers, rawEvent, rawSite, locale);
  const online = source !== null && source.kind !== "otb";
  const event = rawEvent && !GENERIC_EVENT.test(rawEvent) && !isUrl(rawEvent) ? rawEvent : null;
  const round = real(headers.Round);
  const site = !online && rawSite && !isUrl(rawSite) && rawSite !== event ? rawSite : null;
  const ecoRaw = real(headers.ECO)?.toUpperCase();
  const eco = ecoRaw && /^[A-E]\d{2}$/.test(ecoRaw) ? ecoRaw : null;
  const named = real(headers.Opening) ?? chesscomOpeningNameFromUrl(real(headers.ECOUrl));
  const openingName = eco ? resolveOpeningName(eco, named ?? "", locale) || null : named;
  return {
    source,
    event,
    round: round && /^\d+(\.\d+)*$/.test(round) ? tPanels(locale, "notation.header.round", { n: round }) : null,
    site,
    date: ((text) => (text ? { text } : null))(formatHeaderDate(headers.Date ?? headers.UTCDate, locale) ?? formatHeaderDate(headers.UTCDate, locale)),
    eco,
    openingName,
    timeControl: online ? formatTimeControl(headers.TimeControl, locale) : null,
    result: resultChip(headers.Result),
    whiteTitle: fideTitle(headers.WhiteTitle),
    blackTitle: fideTitle(headers.BlackTitle),
  };
}
