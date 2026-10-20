import type { NextConfig } from "next";

const isolation = [
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  // SIG-1057: English aliases for the (Portuguese) legal routes.
  async redirects() {
    return [
      { source: "/privacy", destination: "/privacidade", permanent: true },
      { source: "/terms", destination: "/termos", permanent: true },
    ];
  },
  async headers() {
    return [
      // NB: vinext's :path* matcher requires >=1 segment (Next.js matches zero+),
      // so the exact /studio path needs its own rule for COOP/COEP to apply.
      {
        source: "/studio",
        headers: isolation,
      },
      {
        source: "/studio/:path*",
        headers: isolation,
      },
      {
        source: "/engine/:path*",
        headers: [
          ...isolation,
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        source: "/engine/:path*.wasm",
        headers: [
          { key: "Content-Type", value: "application/wasm" },
        ],
      },
    ];
  },
};

export default nextConfig;

// Next-build-only alias for the workerd-only `cloudflare:workers` module.
// Active ONLY when NEXT_ALIAS_WORKERD_STUB=1 (set by the `build` script): the
// Next build cannot load the real module, so it resolves a local stub instead.
// vinext honours next.config aliases too (resolveAlias AND resolve.alias), so
// the alias must stay OFF everywhere else — the vinext/vite pipeline (the real
// production path) has to keep resolving the genuine workerd module, including
// its WorkerEntrypoint/DurableObject/WorkflowEntrypoint exports and the real
// `env` with the ENGINE binding. No `webpack` fallback for the same reason.
if (process.env.NEXT_ALIAS_WORKERD_STUB === "1") {
  nextConfig.turbopack = {
    resolveAlias: {
      "cloudflare:workers": "./stubs/cloudflare-workers.ts",
    },
  };
}
