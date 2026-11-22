import { Chess, type Color } from "chess.js";
import type { SiteLocale } from "../i18n/locale.ts";
import { localizeOpeningName, translateOpeningParts } from "./opening-names.ts";

export type CatalogLine = Readonly<{ eco: string; name: string; uci: readonly string[] }>;

export type CatalogEntry = CatalogLine & Readonly<{ fen: string; side: Color }>;

export type CatalogNode = Readonly<{
  /** Label for this level of the tree, localized when requested. */
  name: string;
  /** Original label for stable identity when localized labels coincide. */
  sourceName: string;
  /** All lines named at this exact level, including alternate move orders. */
  entries: readonly CatalogEntry[];
  /** Shortest exact line, or shortest child representative when this level has no named line. */
  line: CatalogEntry;
  uci: readonly string[];
  fen: string;
  side: Color;
  children: readonly CatalogNode[];
}>;

let catalog: Promise<readonly CatalogEntry[]> | undefined;

export function loadCatalog(): Promise<readonly CatalogEntry[]> {
  return (catalog ??= import("../data/openings-catalog.json", { with: { type: "json" } })
    .then(({ default: lines }) => {
      const positions = new Map<string, string>();
      return lines.map((line) => toEntry(line, positions));
    })
    .catch((error) => {
      catalog = undefined;
      throw error;
    }));
}

function toEntry(line: CatalogLine, positions: Map<string, string>): CatalogEntry {
  let fen: string | undefined;
  return {
    ...line,
    get fen() {
      if (fen === undefined) {
        // Catalog entries share many prefixes. Resume at the longest one
        // already replayed when indexing the catalog by position.
        let length = line.uci.length;
        let prefix = line.uci.join(" ");
        let previousFen = positions.get(prefix);
        while (!previousFen && length > 0) {
          length -= 1;
          prefix = line.uci.slice(0, length).join(" ");
          previousFen = positions.get(prefix);
        }
        if (previousFen && length === line.uci.length) {
          fen = previousFen;
        } else {
          const chess = new Chess(previousFen);
          fen = chess.fen();
          for (const move of line.uci.slice(length)) {
            chess.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] });
            prefix = prefix ? `${prefix} ${move}` : move;
            fen = chess.fen();
            positions.set(prefix, fen);
          }
        }
      }
      return fen;
    },
    get side() {
      return line.uci.length % 2 === 0 ? "w" : "b";
    },
  };
}

type Group = {
  entries: CatalogEntry[];
  children: Map<string, Group>;
};

function toNode(sourceName: string, group: Group, locale: SiteLocale, family = false): CatalogNode {
  const children = Array.from(group.children, ([label, child]) => toNode(label, child, locale));
  const name = family
    ? localizeOpeningName(sourceName, locale)
    : locale === "pt-br" ? translateOpeningParts(sourceName) : sourceName;
  const candidates = group.entries.length ? group.entries : children.map((child) => child.line);
  const line = candidates.reduce((shortest, entry) => entry.uci.length < shortest.uci.length ? entry : shortest);
  return {
    name,
    sourceName,
    entries: group.entries,
    children,
    line,
    uci: line.uci,
    get fen() {
      return line.fen;
    },
    side: line.side,
  };
}

export function catalogTree(entries: readonly CatalogEntry[], locale: SiteLocale = "en"): CatalogNode[] {
  const root: Group = { entries: [], children: new Map() };
  for (const entry of entries) {
    const [family, ...suffix] = entry.name.split(":");
    // Keep further commas in the subvariation label to preserve the dataset's wording.
    const [variation, ...subvariation] = suffix.join(":").split(",");
    const parts = [family];
    if (variation) parts.push(variation.trim());
    if (subvariation.length) parts.push(subvariation.join(",").trim());

    let group = root;
    for (const name of parts) {
      let child = group.children.get(name);
      if (!child) {
        child = { entries: [], children: new Map() };
        group.children.set(name, child);
      }
      group = child;
    }
    group.entries.push(entry);
  }
  return Array.from(root.children, ([name, group]) => toNode(name, group, locale, true));
}

function normalize(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

const SEARCH_STOP_WORDS = new Set([
  "opening", "openings", "abertura", "aberturas",
  "defense", "defenses", "defence", "defences", "defesa", "defesas",
  "gambit", "gambits", "gambito", "gambitos",
  "attack", "attacks", "ataque", "ataques",
  "variation", "variations", "variante", "variantes",
  "game", "games", "jogo", "jogos",
  "system", "systems", "sistema", "sistemas",
  "line", "lines", "linha", "linhas",
  "de", "do", "da", "dos", "das", "the",
]);

function withoutStopWords(normalized: string): string {
  return normalized.split(" ").filter((word) => !SEARCH_STOP_WORDS.has(word)).join(" ");
}

type SearchNames = readonly [english: string, portuguese: string];
type SearchEntry = Readonly<{ eco: string; names: SearchNames; filteredNames: SearchNames }>;

const searchIndex = new WeakMap<readonly CatalogLine[], readonly SearchEntry[]>();

function indexSearchNames(entries: readonly CatalogLine[]): readonly SearchEntry[] {
  let indexed = searchIndex.get(entries);
  if (!indexed) {
    indexed = entries.map(({ eco, name }) => {
      const english = normalize(name);
      const portuguese = normalize(localizeOpeningName(name, "pt-br", eco));
      return {
        eco: normalize(eco),
        names: [english, portuguese],
        filteredNames: [withoutStopWords(english), withoutStopWords(portuguese)],
      };
    });
    searchIndex.set(entries, indexed);
  }
  return indexed;
}

export function searchCatalog<T extends CatalogLine>(entries: readonly T[], query: string, locale: SiteLocale): T[] {
  const normalized = normalize(query);
  if (!normalized) return [];
  const filtered = withoutStopWords(normalized);
  const match = filtered || normalized;
  const terms = match.split(" ");
  const ranked: { entry: T; rank: number }[] = [];
  for (const [index, { eco, names, filteredNames }] of indexSearchNames(entries).entries()) {
    const entry = entries[index];
    const [english, portuguese] = filtered ? filteredNames : names;
    const preferred = locale === "pt-br" ? portuguese : english;
    const other = locale === "pt-br" ? english : portuguese;
    if (eco === match || preferred === match) {
      ranked.push({ entry, rank: 0 });
    } else if (other === match) {
      ranked.push({ entry, rank: 1 });
    } else if (eco.startsWith(match) || preferred.startsWith(match) || other.startsWith(match)) {
      ranked.push({ entry, rank: 2 });
    } else if ([preferred, other].some((name) => {
      const words = `${eco} ${name}`.split(" ");
      return terms.every((term) => words.some((word) => word.startsWith(term)));
    })) {
      ranked.push({ entry, rank: 3 });
    }
  }
  return ranked
    .sort((a, b) => a.rank - b.rank || a.entry.uci.length - b.entry.uci.length)
    .map(({ entry }) => entry);
}
