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
    env: {
      ASSETS: bindings.assets(),
      ENGINE: bindings.r2({ name: "chess-studio-engine" }),
    },
  }),
});
