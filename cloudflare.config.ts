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
      // (não são versionados em public/engine/ para respeitar o limite de 25MiB de asset).
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
      // Edge-enforced rate limits (ver src/lib/rate-limit.ts): per-location
      // edge enforcement replacing per-isolate-only. Namespace IDs are unique
      // integer strings per binding (Cloudflare `ratelimits[].namespace_id`).
      RL_60_MIN: bindings.rateLimit({ namespace: "1001", simple: { limit: 60, period: 60 } }),
      RL_30_MIN: bindings.rateLimit({ namespace: "1002", simple: { limit: 30, period: 60 } }),
      RL_AUTH: bindings.rateLimit({ namespace: "1003", simple: { limit: 10, period: 60 } }),
    },
  }),
});
