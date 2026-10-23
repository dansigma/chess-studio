// Serve os builds "full" do engine a partir do R2.
//
// Contexto: os wasm full têm ~95MB cada (>75MiB, acima do limite de 25MiB por
// asset do Workers/Pages), então NÃO viajam no bundle — vivem no bucket R2
// `chess-studio-engine` (keys espelham os paths do app:
// engine/full/stockfish-19.wasm e engine/stockfish-19-single.wasm) e são
// levantados para lá por scripts/uploads manuais (ver skill do projeto).
//
// IMPORTANTE: os wasm full não são versionados em public/ (são servidos do R2).
// Caso sejam baixados localmente para testes, não devem ser incluídos no build
// de produção — se presentes em public/ no build, o pipeline estático do vinext
// classificaria esses paths como assets e os drenaria para o binding de ASSETS
// (que tem limite de 25MiB) ANTES desta rota rodar — resultado: 404 vazio.
//
// Mantém os headers de isolation (COOP/COEP/CORP) que o worker do engine exige
// sob COEP, com os mesmos paths do app (nenhuma mudança no cliente).
import { env } from "cloudflare:workers";

type R2ObjectLike = {
  body: ReadableStream;
  httpEtag: string;
  size: number;
  writeHttpMetadata(headers: Headers): void;
};

type EngineBucket = {
  get(key: string): Promise<R2ObjectLike | null>;
};

const IMMUTABLE = "public, max-age=31536000, immutable";
const NO_STORE = "no-store";

function errorResponse(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: {
      "Cache-Control": NO_STORE,
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const key = `engine/${path.join("/")}`;
  const bucket = (env as unknown as { ENGINE?: EngineBucket }).ENGINE;
  if (!bucket) {
    return errorResponse("Engine bucket not configured", 503);
  }
  let object: R2ObjectLike | null;
  try {
    object = await bucket.get(key);
  } catch {
    return errorResponse("Engine unavailable", 500);
  }
  if (!object) {
    return errorResponse("Not found", 404);
  }
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set(
    "Content-Type",
    key.endsWith(".wasm")
      ? "application/wasm"
      : headers.get("Content-Type") ?? "application/octet-stream",
  );
  headers.set("Cache-Control", IMMUTABLE);
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Embedder-Policy", "require-corp");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  headers.set("ETag", object.httpEtag);
  headers.set("Content-Length", String(object.size));
  return new Response(object.body, { headers });
}
