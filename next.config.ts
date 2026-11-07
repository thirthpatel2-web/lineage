import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native and WASM packages run from node_modules instead of being bundled.
  serverExternalPackages: [
    "@electric-sql/pglite",
    "@huggingface/transformers",
    "onnxruntime-node",
    "sharp",
    "postgres",
  ],
  // Migrations are read from disk at runtime.
  outputFileTracingIncludes: { "/**": ["./drizzle/**/*"] },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "geolocation=(), microphone=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
