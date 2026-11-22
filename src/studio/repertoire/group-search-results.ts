import { Chess } from "chess.js";
import type { SiteLocale } from "@/src/i18n/locale";
import { localizeOpeningName } from "@/src/lib/opening-names";
import type { CatalogLine } from "@/src/lib/openings-catalog";

export function lineName(line: CatalogLine, locale: SiteLocale) {
  return localizeOpeningName(line.name, locale, line.eco);
}

export type SearchGroup<T extends CatalogLine> = {
  name: string;
  lines: T[];
  prefixLength: number;
};

export function groupSearchResults<T extends CatalogLine>(results: readonly T[], locale: SiteLocale, startPly?: (line: T) => number): SearchGroup<T>[] {
  const byName = new Map<string, T[]>();
  for (const line of results) {
    const name = lineName(line, locale);
    const lines = byName.get(name);
    if (lines) lines.push(line);
    else byName.set(name, [line]);
  }

  return Array.from(byName, ([name, lines]) => {
    const first = lines[0];
    if (startPly) {
      lines.sort((a, b) => Number(b.uci.length === startPly(b)) - Number(a.uci.length === startPly(a)));
      return { name, lines, prefixLength: 0 };
    }

    let prefixLength = first.uci.length;
    for (const line of lines.slice(1)) {
      let ply = 0;
      while (ply < prefixLength && first.uci[ply] === line.uci[ply]) ply += 1;
      prefixLength = ply;
    }

    // Move lines ending at the shared position first, preserving rank within each set.
    lines.sort((a, b) =>
      Number(b.uci.length === prefixLength) - Number(a.uci.length === prefixLength)
    );

    return { name, lines, prefixLength };
  });
}

export function lineMovesFrom(line: CatalogLine, start = 0, notation?: readonly string[]) {
  const sans = notation ?? (() => {
    const chess = new Chess();
    return line.uci.map((uci) =>
      chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san
    );
  })();
  const moves: string[] = [];
  for (let index = start; index < sans.length; index++) {
    const san = sans[index];

    const number = Math.floor(index / 2) + 1;
    if (index % 2 === 0) moves.push(`${number}. ${san}`);
    else if (index === start) moves.push(`${number}... ${san}`);
    else moves.push(san);
  }
  return moves.join(" ");
}
