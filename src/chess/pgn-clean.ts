const RESULT_TOKEN = /^(1-0|0-1|1\/2-1\/2|\*)$/;
const MOVE_SUFFIX = /[!?]+$/;

export function pgnForImport(pgn: string): string {
  return stripPgnDiagnostics(
    pgn
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)
      .filter((line) => !/^\s*%/.test(line))
      .join("\n")
      .replaceAll("\u2026", "..."),
  );
}

export function pgnGameChunks(pgn: string): string[] {
  const cleaned = pgnForImport(pgn);
  if (!cleaned) {
    return [];
  }
  return cleaned
    .split(/\r?\n(?:\r?\n)+(?=\[)/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
}

export function stripPgnDiagnostics(pgn: string): string {
  return pgn
    .replace(/\{\[%clk[^\]]*\]\}/gi, " ")
    .replace(/\[%clk[^\]]*\]/gi, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function stripPgnNoise(pgn: string): string {
  let text = stripPgnDiagnostics(pgn);
  text = text.replace(/\{[^}]*\}/g, " ");
  text = text.replace(/;.*$/gm, " ");
  text = text.replace(/\$\d+/g, " ");
  let next = text.replace(/\([^()]*\)/g, " ");
  while (next !== text) {
    text = next;
    next = text.replace(/\([^()]*\)/g, " ");
  }
  return text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

export function sanMovesFromPgn(pgn: string): string[] {
  const cleaned = stripPgnNoise(pgn);
  const movetext = cleaned
    .split("\n")
    .filter((line) => !line.startsWith("["))
    .join(" ");
  const sans: string[] = [];
  for (const token of movetext.split(/\s+/).filter(Boolean)) {
    if (/^\d+\.+$/.test(token)) {
      continue;
    }
    const stripped = token.replace(/^\d+\.+/, "").replace(MOVE_SUFFIX, "");
    if (!stripped || RESULT_TOKEN.test(stripped)) {
      continue;
    }
    sans.push(stripped);
  }
  return sans;
}

export function sanLineFromPgn(pgn: string): string {
  return sanMovesFromPgn(pgn).join(" ");
}

export function numberSanLine(sans: string): string {
  const moves = sans.split(/\s+/).filter(Boolean);
  const parts: string[] = [];
  for (let index = 0; index < moves.length; index += 1) {
    const move = moves[index];
    if (!move) {
      continue;
    }
    if (index % 2 === 0) {
      parts.push(`${Math.floor(index / 2) + 1}.`);
    }
    parts.push(move);
  }
  return parts.join(" ");
}

export function buildCompactPgn(headers: Record<string, string>, sans: string): string {
  const tags = Object.entries(headers)
    .filter(([, value]) => Boolean(value))
    .map(([key, value]) => `[${key} "${value.replaceAll('"', '\\"')}"]`);
  const result = headers.Result ?? "*";
  const numbered = numberSanLine(sans);
  return `${tags.join("\n")}\n\n${numbered}${numbered ? " " : ""}${result}\n`;
}
