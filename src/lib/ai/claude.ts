import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { env, mode } from "@/lib/env";
import { GeminiRefusal, geminiStructured } from "./gemini";

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
  if (mode.aiProvider === "gemini") {
    try {
      return await geminiStructured(schema, opts);
    } catch (error) {
      if (error instanceof GeminiRefusal) throw new ModelRefusal(error.message);
      throw error;
    }
  }
  const format = betaZodOutputFormat(schema);
  // create() rather than parse(): parse() would throw a generic error on a refusal or a cut-off
  // reply before we could tell which it was.
  const response = await claude().beta.messages.create({
    model: MODEL,
    max_tokens: opts.maxTokens ?? 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: opts.system,
    output_config: { effort: opts.effort ?? "medium", format: { type: "json_schema", schema: format.schema } },
    messages: [{ role: "user", content: opts.content }],
  });
  if (response.stop_reason === "refusal") {
    throw new ModelRefusal(response.stop_details?.explanation ?? "The model declined this request.");
  }
  if (response.stop_reason === "max_tokens") throw new Error("Claude's answer was cut off before it finished.");
  const text = response.content.findLast((b) => b.type === "text");
  if (!text || text.type !== "text") throw new Error(`Claude returned no answer (stop_reason: ${response.stop_reason})`);
  return format.parse(text.text) as z.infer<S>;
}

export function imageBlock(bytes: Buffer, mime = "image/jpeg"): Anthropic.Beta.BetaImageBlockParam {
  return {
    type: "image",
    source: { type: "base64", media_type: mime as "image/jpeg", data: bytes.toString("base64") },
  };
}
