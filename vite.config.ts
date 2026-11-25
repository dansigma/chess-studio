import { defineConfig } from "vite";
import vinext from "vinext";
import { kvDataAdapter } from "@vinext/cloudflare/cache/kv-data-adapter";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [
    {
      name: "maia-worker-isolation",
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          if (request.url?.split("?")[0].endsWith("/src/engine/maia/maia.worker.ts")) {
            response.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
          }
          next();
        });
      },
    },
    vinext({
      // As páginas com ISR (courses, revalidate = 60) exigem um cache
      // persistente em produção; o KV é o data cache no Workers.
      cache: {
        data: kvDataAdapter(), // binding: VINEXT_KV_CACHE (cloudflare.config.ts)
      },
    }),
    cloudflare({
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    }),
  ],
});
