import { bindings, defineConfig, defineWorker } from "cf/config";

export default defineConfig({
  worker: defineWorker({
    name: "chess-studio",
    entrypoint: "vinext/server/fetch-handler",
    compatibilityDate: "2026-10-04",
    compatibilityFlags: ["nodejs_compat"],
    assets: {
      notFoundHandling: "none",
      // Os wasm "full" do engine são servidos do R2 pela rota app/engine/[...path]
      // (os arquivos ficam fora de public/ durante o build — ver scripts/vinext-deploy.mjs).
      // Estes paths devem sempre chegar ao worker.
      runWorkerFirst: [
        "/engine/full/stockfish-19.wasm",
        "/engine/stockfish-19-single.wasm",
      ],
    },
    domains: ["xadrez.digital", "www.xadrez.digital"],
    env: {
      ASSETS: bindings.assets(),
      ENGINE: bindings.r2({ name: "chess-studio-engine" }),
      // Data cache do ISR (courses revalidate=60) — ver vite.config.ts.
      VINEXT_KV_CACHE: bindings.kv({ id: "2abf45b38f9943b792848ec48562282d" }),
      // Global edge rate limits (ver src/lib/rate-limit.ts). Namespace IDs must
      // be provisioned in the Cloudflare dashboard before deploy enforces them;
      // until then routes degrade to the per-isolate in-memory fallback.
      // TODO(SIG-927): replace placeholder namespace IDs with provisioned ones.
      RL_60_MIN: bindings.rateLimit({ namespace: "RL_60_MIN", simple: { limit: 60, period: 60 } }),
      RL_30_MIN: bindings.rateLimit({ namespace: "RL_30_MIN", simple: { limit: 30, period: 60 } }),
      RL_AUTH: bindings.rateLimit({ namespace: "RL_AUTH", simple: { limit: 10, period: 60 } }),
    },
  }),
});
