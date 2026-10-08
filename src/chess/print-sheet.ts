import type { GameTree, Path, TreeNode } from "./tree";
import { pathsEqual } from "./tree";
import type { MoveNotation } from "./move-notation";
import { formatSanAtPly } from "./move-notation";
import { formatMoveSuffix, formatPositionGlyphs } from "./nags";

export type PrintToken = {
  text: string;
  current: boolean;
};

function moveLabel(node: TreeNode, ply: number, chainStart: number, startFen: string, notation: MoveNotation): string {
  const side = startFen.split(" ")[1] === "b" ? "b" : "w";
  const startFull = Number(startFen.split(" ")[5] ?? "1") || 1;
  const isWhite = (side === "w" && ply % 2 === 1) || (side === "b" && ply % 2 === 0);
  const moveNumber = startFull + Math.floor((ply - 1 + (side === "b" ? 1 : 0)) / 2);
  const san = `${formatSanAtPly(node.san, notation, side, ply - 1)}${formatMoveSuffix(node.nags)}`;
  if (isWhite) {
    return `${moveNumber}. ${san}`;
  }
  if (ply === chainStart + 1) {
    return `${moveNumber}... ${san}`;
  }
  return san;
}

function emitChain(
  nodes: TreeNode[],
  plyFromStart: number,
  parentPath: Path,
  chainStart: number,
  startFen: string,
  currentPath: Path,
  notation: MoveNotation,
  leadIndex = 0,
): PrintToken[] {
  const tokens: PrintToken[] = [];
  let list = nodes;
  let ply = plyFromStart;
  let base = parentPath;
  let first = true;
  while (list[0]) {
    const node = list[0];
    const index = first ? leadIndex : 0;
    first = false;
    ply += 1;
    const nodePath = [...base, index];
    if (node.commentBefore) {
      tokens.push({ text: `{${node.commentBefore}}`, current: false });
    }
    const label = moveLabel(node, ply, chainStart, startFen, notation);
    const current = pathsEqual(nodePath, currentPath);
    if (label.includes(" ")) {
      const [prefix, san] = label.split(/ (?=[^ ]+$)/);
      if (prefix && san) {
        tokens.push({ text: prefix, current: false });
        tokens.push({ text: san, current });
      } else {
        tokens.push({ text: label, current });
      }
    } else {
      tokens.push({ text: label, current });
    }
    const glyphs = formatPositionGlyphs(node.nags);
    if (glyphs) {
      tokens.push({ text: glyphs, current: false });
    }
    if (node.comment) {
      tokens.push({ text: `{${node.comment}}`, current: false });
    }
    for (let sibling = 1; sibling < list.length; sibling += 1) {
      const variation = list[sibling];
      if (!variation) {
        continue;
      }
      tokens.push({ text: "(", current: false });
      tokens.push(
        ...emitChain(
          [variation],
          ply - 1,
          base,
          ply - 1,
          startFen,
          currentPath,
          notation,
          sibling,
        ),
      );
      tokens.push({ text: ")", current: false });
    }
    base = nodePath;
    list = node.children;
  }
  return tokens;
}

export function printTokens(tree: GameTree, path: Path, notation: MoveNotation): PrintToken[] {
  const tokens: PrintToken[] = [];
  if (tree.startComment) {
    tokens.push({ text: `{${tree.startComment}}`, current: false });
  }
  tokens.push(...emitChain(tree.children, 0, [], 0, tree.startFen, path, notation));
  return tokens;
}

export function printNotationText(tokens: PrintToken[]): string {
  let text = "";
  for (const token of tokens) {
    if (text.length === 0 || token.text === ")" || text.endsWith("(")) {
      text += token.text;
    } else {
      text += ` ${token.text}`;
    }
  }
  return text;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function printSheetMarkup(options: {
  title: string;
  tokens: PrintToken[];
  imageDataUrl: string;
}): string {
  const notation =
    options.tokens.length === 0
      ? "No moves yet."
      : printNotationText(
          options.tokens.map((token) => ({
            ...token,
            text: token.current ? `<strong>${escapeHtml(token.text)}</strong>` : escapeHtml(token.text),
          })),
        );
  return `<h1>${escapeHtml(options.title)}</h1>
<img alt="Board" src="${options.imageDataUrl}" />
<p>${notation}</p>`;
}

export function printDocumentHtml(options: {
  title: string;
  tokens: PrintToken[];
  imageDataUrl: string;
}): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(options.title)}</title>
</head>
<body>
  ${printSheetMarkup(options)}
</body>
</html>`;
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Could not read the board image"));
    };
    reader.onerror = () => reject(new Error("Could not read the board image"));
    reader.readAsDataURL(blob);
  });
}

export const PRINT_SHEET_ID = "studio-print";
