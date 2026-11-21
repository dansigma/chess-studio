import { Chess, type Color } from "chess.js";
import type { SiteLocale } from "../i18n/locale.ts";
import { localizeOpeningName } from "./opening-names.ts";

export type CatalogLine = Readonly<{ eco: string; name: string; uci: readonly string[] }>;

export type CatalogEntry = CatalogLine & Readonly<{ fen: string; side: Color }>;

export type CatalogNode = Readonly<{
  /** Label for this level of the tree, with the family localized when requested. */
  name: string;
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

function toNode(name: string, group: Group): CatalogNode {
  const children = Array.from(group.children, ([label, child]) => toNode(label, child));
  const candidates = group.entries.length ? group.entries : children.map((child) => child.line);
  const line = candidates.reduce((shortest, entry) => entry.uci.length < shortest.uci.length ? entry : shortest);
  return {
    name,
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
  return Array.from(root.children, ([name, group]) => toNode(localizeOpeningName(name, locale), group));
}

function normalize(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function searchCatalog<T extends CatalogLine>(entries: readonly T[], query: string, locale: SiteLocale): T[] {
  const normalized = normalize(query);
  if (!normalized) return [];
  const terms = normalized.split(" ");
  const ranked: { entry: T; rank: number }[] = [];
  for (const entry of entries) {
    const eco = normalize(entry.eco);
    const english = normalize(entry.name);
    const translated = normalize(localizeOpeningName(entry.name, "pt-br", entry.eco));
    const names = locale === "pt-br" ? [translated, english] : [english, translated];
    if (eco === normalized || names[0] === normalized) {
      ranked.push({ entry, rank: 0 });
    } else if (names[1] === normalized) {
      ranked.push({ entry, rank: 1 });
    } else if (eco.startsWith(normalized) || names.some((name) => name.startsWith(normalized))) {
      ranked.push({ entry, rank: 2 });
    } else if (names.some((name) => {
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
