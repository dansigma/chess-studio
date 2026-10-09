import { defineConfig } from "vite";
import vinext from "vinext";
import { kvDataAdapter } from "@vinext/cloudflare/cache/kv-data-adapter";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [
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
