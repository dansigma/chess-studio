import { Chess } from "chess.js";
import { isLegalSetupFen } from "./setup-fen";

export function shareBoardUrl(origin: string, fen: string): string {
  const url = new URL("/studio", origin);
  url.searchParams.set("fen", fen.trim());
  return url.toString();
}

export function fenFromShareSearch(search: string): string | null {
  const raw = new URLSearchParams(search).get("fen");
  if (!raw || !isLegalSetupFen(raw.trim())) {
    return null;
  }
  return new Chess(raw.trim()).fen();
}
