import type { NextConfig } from "next";

const isolation = [
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
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
