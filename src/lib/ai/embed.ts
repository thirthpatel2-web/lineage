// Stage 1 of matching: CLIP image embeddings, computed locally (no API key, ~1.5s per image on CPU).
import path from "node:path";
import type { ImageFeatureExtractionPipeline } from "@huggingface/transformers";

export const EMBEDDING_MODEL = "Xenova/clip-vit-base-patch32";

const globalForClip = globalThis as unknown as { clip?: Promise<ImageFeatureExtractionPipeline> };

async function extractor() {
  globalForClip.clip ??= (async () => {
    const { pipeline, env } = await import("@huggingface/transformers");
    env.cacheDir = path.join(process.cwd(), ".cache", "models");
    return (await pipeline("image-feature-extraction", EMBEDDING_MODEL, { dtype: "q8" })) as ImageFeatureExtractionPipeline;
  })();
  return globalForClip.clip;
}

export async function embedImage(jpeg: Buffer): Promise<number[]> {
  const { RawImage } = await import("@huggingface/transformers");
  const image = await RawImage.fromBlob(new Blob([new Uint8Array(jpeg)], { type: "image/jpeg" }));
  const output = await (await extractor())(image);
  return normalise(Array.from(output.data as Float32Array));
}

function normalise(vector: number[]) {
  const length = Math.hypot(...vector) || 1;
  return vector.map((v) => v / length);
}

/** Cosine similarity of two unit vectors. */
export function cosine(a: number[], b: number[]) {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}
