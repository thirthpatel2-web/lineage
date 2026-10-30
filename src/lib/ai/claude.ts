import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { env } from "@/lib/env";

export const MODEL = "claude-opus-5-5";

let client: Anthropic | undefined;
export function claude() {
  if (!env.anthropicKey) throw new Error("ANTHROPIC_API_KEY is not set");
  client ??= new Anthropic({ apiKey: env.anthropicKey });
  return client;
}

export class ModelRefusal extends Error {}

type Content = Anthropic.Beta.BetaContentBlockParam[];

/**
 * One Claude call that must return JSON matching `schema`. Uses server-side fallbacks so a
 * classifier decline is retried on Anthropic's recommended fallback model instead of failing.
 */
export async function structured<S extends z.ZodType>(
  schema: S,
  opts: { system: string; content: Content; effort?: "low" | "medium" | "high"; maxTokens?: number },
): Promise<z.infer<S>> {
  const response = await claude().beta.messages.parse({
    model: MODEL,
    max_tokens: opts.maxTokens ?? 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: opts.system,
    output_config: { effort: opts.effort ?? "medium", format: betaZodOutputFormat(schema) },
    messages: [{ role: "user", content: opts.content }],
  });
  if (response.stop_reason === "refusal") {
    throw new ModelRefusal(response.stop_details?.explanation ?? "The model declined this request.");
  }
  if (!response.parsed_output) throw new Error(`Claude returned no parseable output (stop_reason: ${response.stop_reason})`);
  return response.parsed_output as z.infer<S>;
}

export function imageBlock(bytes: Buffer, mime = "image/jpeg"): Anthropic.Beta.BetaImageBlockParam {
  return {
    type: "image",
    source: { type: "base64", media_type: mime as "image/jpeg", data: bytes.toString("base64") },
  };
}
