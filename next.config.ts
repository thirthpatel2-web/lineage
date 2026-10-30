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
};

export default nextConfig;
