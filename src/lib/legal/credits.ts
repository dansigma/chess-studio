// SIG-1230: credits and licenses shown in the Studio About dialog and on /termos.
// One source of truth: the book row follows the DEPLOYED manifest, so the credits are never
// ahead of or behind the book users actually get.
import { OPENING_BOOK_MANIFEST } from "@/src/chess/opening-book-manifest";
import type { SiteLocale } from "@/src/i18n/locale";

/** A piece of text, optionally a link. */
export type CreditSegment = string | { text: string; href: string };

export type CreditRow = { id: "engine" | "explorer" | "book" | "puzzles"; label: string; segments: CreditSegment[] };

export const LICENSE_URLS = {
  cc0: "https://creativecommons.org/publicdomain/zero/1.0/",
  ccBySa: "https://creativecommons.org/licenses/by-sa/4.0/",
  /** Served from public/engine; the same text ships next to the WASM build. */
  gpl: "/engine/Copying.txt",
} as const;

export const STOCKFISH_SOURCE_URLS = {
  wasm: "https://github.com/nmrugg/stockfish.js",
  official: "https://github.com/official-stockfish/Stockfish",
} as const;

export type KnownSourceId = "lichess-db" | "lumbra-broadcast" | "ajedrez-data" | "chess-results";

type LicenseKind = "cc0" | "cc-by-sa" | "note";

type SourceInfo = {
  name: string;
  url: string;
  license: LicenseKind;
  /** Plain-text license for `note` kinds. */
  note: { en: string; "pt-br": string };
};

/** Order here is the display order. */
export const SOURCE_MAP: Record<KnownSourceId, SourceInfo> = {
  "lichess-db": {
    name: "Lichess open database",
    url: "https://database.lichess.org",
    license: "cc0",
    note: { en: "", "pt-br": "" },
  },
  "lumbra-broadcast": {
    name: "Lumbra's GigaBase – Lichess Broadcast",
    url: "https://lumbrasgigabase.com",
    license: "cc-by-sa",
    note: { en: "", "pt-br": "" },
  },
  "ajedrez-data": {
    name: "Ajedrez Data",
    url: "https://ajedrezdata.com",
    license: "note",
    note: { en: "games stated as public domain", "pt-br": "partidas declaradas de domínio público" },
  },
  "chess-results": {
    name: "Chess-Results",
    url: "https://chess-results.com",
    license: "note",
    note: { en: "games published by tournament organizers", "pt-br": "partidas publicadas pelos organizadores" },
  },
};

/** The fields of a build/union manifest (SIG-1229, PR #265) that the credits read. */
export type ManifestSourceLike = {
  profile?: string;
  name?: string;
  files?: readonly string[];
  license?: string;
  attribution?: string;
};
export type BookManifestLike = {
  file: string;
  licenses?: readonly string[];
  sources?: readonly ManifestSourceLike[];
  license?: string;
  attribution?: string;
};

export type ResolvedSource = {
  /** Known id, or null for a source the map does not know (shown by its raw name, no link). */
  id: KnownSourceId | null;
  name: string;
  /** Explicit `license` string from the manifest, kept for unknown sources. */
  rawLicense?: string;
};

export type BookCredit = {
  sources: ResolvedSource[];
  /** True when at least one source is share-alike (CC BY-SA): the book is then offered under it. */
  shareAlike: boolean;
  file: string;
};

const SHARE_ALIKE = /\bcc[\s-]*by[\s-]*sa\b/i;

function hints(source: ManifestSourceLike): string {
  return [source.name, ...(source.files ?? []), source.license, source.attribution].filter(Boolean).join(" ").toLowerCase();
}

/** Known ids one manifest source stands for (the explicit fields and file names are the hints). */
function idsOf(source: ManifestSourceLike): KnownSourceId[] {
  const text = hints(source);
  const ids = new Set<KnownSourceId>();
  const profile = source.profile ?? "lichess";
  if (profile === "lichess" || /lichess_db|database\.lichess\.org/.test(text)) {
    ids.add("lichess-db");
  }
  if (/lumbra/.test(text)) {
    ids.add("lumbra-broadcast");
  }
  if (/ajedrez|aj-?otb|aj-?corr/.test(text) || profile === "correspondence") {
    ids.add("ajedrez-data");
  }
  if (/chess-?results/.test(text)) {
    ids.add("chess-results");
  }
  return [...ids];
}

function rawName(source: ManifestSourceLike): string {
  return source.name ?? source.files?.[0] ?? source.profile ?? "unknown";
}

/** v2 manifests have no `sources`: they are the Lichess dumps only (CC0). */
export function resolveBookCredit(manifest: BookManifestLike): BookCredit {
  const sources = manifest.sources && manifest.sources.length > 0 ? manifest.sources : [{ profile: "lichess" }];
  const known = new Set<KnownSourceId>();
  const unknown: ResolvedSource[] = [];
  for (const source of sources) {
    const ids = idsOf(source);
    if (ids.length === 0) {
      unknown.push({ id: null, name: rawName(source), ...(source.license ? { rawLicense: source.license } : {}) });
    }
    for (const id of ids) {
      known.add(id);
    }
  }
  const resolved: ResolvedSource[] = (Object.keys(SOURCE_MAP) as KnownSourceId[])
    .filter((id) => known.has(id))
    .map((id) => ({ id, name: SOURCE_MAP[id].name }));
  resolved.push(...unknown);
  const explicit = [...(manifest.licenses ?? []), manifest.license, ...sources.map((source) => source.license)];
  const shareAlike =
    known.has("lumbra-broadcast") ||
    explicit.some((text) => text !== undefined && SHARE_ALIKE.test(text)) ||
    unknown.some((source) => source.rawLicense !== undefined && SHARE_ALIKE.test(source.rawLicense));
  return { sources: resolved, shareAlike, file: manifest.file };
}

/** `/book/<file>`, with the same override `localBookUrl()` uses. */
export function creditsBookUrl(file: string): string {
  return `/book/${process.env.NEXT_PUBLIC_OPENING_BOOK_FILE || file}`;
}

type Copy = {
  engine: string;
  explorer: string;
  book: string;
  puzzles: string;
  engineBefore: string;
  engineLicense: string;
  engineSource: string;
  and: string;
  explorerBefore: string;
  explorerAfter: string;
  bookBefore: string;
  modified: string;
  offeredBefore: string;
  puzzlesAfter: string;
  /** "{a}, {b} and {c}" */
  lastJoin: string;
};

const COPY: Record<SiteLocale, Copy> = {
  en: {
    engine: "Engine",
    explorer: "Opening explorer",
    book: "Opening book (Game Review)",
    puzzles: "Puzzles",
    engineBefore: "Stockfish 19 lite, runs locally. License ",
    engineLicense: "GPLv3",
    engineSource: ". Source code: ",
    and: " and ",
    explorerBefore: "Public ",
    explorerAfter: " explorer (masters and online database).",
    bookBefore: "Built by Xadrez Digital from ",
    modified: " The material was modified: games were filtered and aggregated into position and move statistics.",
    offeredBefore: " Our book is offered under ",
    puzzlesAfter: " puzzle database (",
    lastJoin: " and ",
  },
  "pt-br": {
    engine: "Engine",
    explorer: "Explorador de aberturas",
    book: "Livro de aberturas (Revisão de partida)",
    puzzles: "Exercícios",
    engineBefore: "Stockfish 19 lite, executado localmente. Licença ",
    engineLicense: "GPLv3",
    engineSource: ". Código-fonte: ",
    and: " e ",
    explorerBefore: "Explorador público do ",
    explorerAfter: " (masters e base online).",
    bookBefore: "Construído pelo Xadrez Digital a partir de ",
    modified: " O material foi modificado: as partidas foram filtradas e agregadas em estatísticas de posições e lances.",
    offeredBefore: " Nosso livro é oferecido sob ",
    puzzlesAfter: " (base de exercícios, ",
    lastJoin: " e ",
  },
};

function licenseSegments(info: SourceInfo, locale: SiteLocale): CreditSegment[] {
  if (info.license === "cc0") {
    return [{ text: "CC0", href: LICENSE_URLS.cc0 }];
  }
  if (info.license === "cc-by-sa") {
    return [{ text: "CC BY-SA 4.0", href: LICENSE_URLS.ccBySa }];
  }
  return [info.note[locale]];
}

function sourceSegments(source: ResolvedSource, locale: SiteLocale): CreditSegment[] {
  if (source.id === null) {
    return [source.name, ...(source.rawLicense ? [` (${source.rawLicense})`] : [])];
  }
  const info = SOURCE_MAP[source.id];
  return [{ text: info.name, href: info.url }, " (", ...licenseSegments(info, locale), ")"];
}

/** The book row; follows `manifest` (the deployed one by default). */
export function bookRow(locale: SiteLocale, manifest: BookManifestLike = OPENING_BOOK_MANIFEST): CreditRow {
  const copy = COPY[locale];
  const credit = resolveBookCredit(manifest);
  const segments: CreditSegment[] = [copy.bookBefore];
  credit.sources.forEach((source, index) => {
    if (index > 0) {
      segments.push(index === credit.sources.length - 1 ? copy.lastJoin : ", ");
    }
    segments.push(...sourceSegments(source, locale));
  });
  segments.push(".");
  if (credit.shareAlike) {
    segments.push(
      copy.modified,
      copy.offeredBefore,
      { text: "CC BY-SA 4.0", href: LICENSE_URLS.ccBySa },
      ": ",
      { text: creditsBookUrl(credit.file), href: creditsBookUrl(credit.file) },
      ".",
    );
  }
  return { id: "book", label: copy.book, segments };
}

/** Engine, explorer, book and puzzles rows, in the order of the About dialog. */
export function creditRows(locale: SiteLocale, manifest: BookManifestLike = OPENING_BOOK_MANIFEST): CreditRow[] {
  const copy = COPY[locale];
  return [
    {
      id: "engine",
      label: copy.engine,
      segments: [
        copy.engineBefore,
        { text: copy.engineLicense, href: LICENSE_URLS.gpl },
        copy.engineSource,
        { text: "stockfish.js", href: STOCKFISH_SOURCE_URLS.wasm },
        copy.and,
        { text: "Stockfish", href: STOCKFISH_SOURCE_URLS.official },
        ".",
      ],
    },
    {
      id: "explorer",
      label: copy.explorer,
      segments: [copy.explorerBefore, { text: "Lichess", href: "https://lichess.org" }, copy.explorerAfter],
    },
    bookRow(locale, manifest),
    {
      id: "puzzles",
      label: copy.puzzles,
      segments: [
        { text: "Lichess", href: "https://database.lichess.org/#puzzles" },
        copy.puzzlesAfter,
        { text: "CC0", href: LICENSE_URLS.cc0 },
        ").",
      ],
    },
  ];
}
