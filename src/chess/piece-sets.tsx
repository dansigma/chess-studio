"use client";

import { useState, type CSSProperties } from "react";
import { defaultPieces } from "react-chessboard";
import type { PieceRenderObject } from "react-chessboard";

export const PIECE_SET_IDS = [
  "classic",
  "cburnett",
  "merida",
  "alpha",
  "california",
  "cardinal",
  "companion",
  "fantasy",
  "spatial",
  "staunty",
  "letter",
  "shapes",
] as const;

export type PieceSet = (typeof PIECE_SET_IDS)[number];

export const PIECE_SETS: Record<PieceSet, { label: string; folder: string | null }> = {
  classic: { label: "Classic", folder: null },
  cburnett: { label: "Cburnett", folder: "cburnett" },
  merida: { label: "Merida", folder: "merida" },
  alpha: { label: "Alpha", folder: "alpha" },
  california: { label: "California", folder: "california" },
  cardinal: { label: "Cardinal", folder: "cardinal" },
  companion: { label: "Companion", folder: "companion" },
  fantasy: { label: "Fantasy", folder: "fantasy" },
  spatial: { label: "Spatial", folder: "spatial" },
  staunty: { label: "Staunty", folder: "staunty" },
  letter: { label: "Letter", folder: "letter" },
  shapes: { label: "Shapes", folder: "shapes" },
};

const PIECE_CODES = ["wK", "wQ", "wR", "wB", "wN", "wP", "bK", "bQ", "bR", "bB", "bN", "bP"] as const;

const CDN = "https://cdn.jsdelivr.net/gh/lichess-org/lila@master/public/piece";

export function isPieceSet(value: unknown): value is PieceSet {
  return typeof value === "string" && value in PIECE_SETS;
}

function pieceSrc(folder: string, code: string): string {
  return `${CDN}/${folder}/${code}.svg`;
}

function CdnPiece({
  folder,
  code,
  svgStyle,
}: {
  folder: string;
  code: string;
  svgStyle?: CSSProperties;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    const Fallback = defaultPieces[code];
    return Fallback ? <Fallback svgStyle={svgStyle} /> : null;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- piece SVGs stream from an external CDN at runtime; next/image has no optimizer under the vinext static runtime and the onError fallback needs a plain img
    <img
      src={pieceSrc(folder, code)}
      alt=""
      crossOrigin="anonymous"
      draggable={false}
      onError={() => setFailed(true)}
      style={{ width: "100%", height: "100%", objectFit: "contain", ...svgStyle }}
    />
  );
}

const cache = new Map<PieceSet, PieceRenderObject>();

export function piecesForSet(set: PieceSet): PieceRenderObject {
  const hit = cache.get(set);
  if (hit) {
    return hit;
  }
  const folder = PIECE_SETS[set].folder;
  if (!folder) {
    cache.set(set, defaultPieces);
    return defaultPieces;
  }
  const pieces = Object.fromEntries(
    PIECE_CODES.map((code) => [
      code,
      ({ svgStyle }: { svgStyle?: CSSProperties } = {}) => (
        <CdnPiece folder={folder} code={code} svgStyle={svgStyle} />
      ),
    ]),
  ) as PieceRenderObject;
  cache.set(set, pieces);
  return pieces;
}
