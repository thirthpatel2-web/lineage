// Google Gemini on its free tier. Lineage uses it when GEMINI_API_KEY is set (and no Claude key),
// so every AI feature can run at no cost. Free-tier models get busy, so each call walks a short list
// of free models and moves on when one answers "busy" (429/503).
import { GoogleGenAI, type Content, type Part } from "@google/genai";
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { env } from "@/lib/env";

let client: GoogleGenAI | undefined;
export function gemini() {
  if (!env.geminiKey) throw new Error("GEMINI_API_KEY is not set");
  client ??= new GoogleGenAI({ apiKey: env.geminiKey, apiVersion: "v1beta" });
  return client;
}

/** Fast free models first; bigger ones only as a fallback. GEMINI_MODEL overrides the first choice. */
export const GEMINI_MODELS = [...new Set([env.geminiModel ?? "gemini-3.5-flash-lite", "gemini-flash-lite-latest", "gemini-3.1-flash-lite", "gemini-flash-latest"])];

const busy = (error: unknown) => /\b(429|503)\b|RESOURCE_EXHAUSTED|UNAVAILABLE|high demand|overloaded/i.test(String((error as Error)?.message ?? error));

/** Run `call` on the first free model that isn't busy. */
export async function withFreeModel<T>(call: (model: string) => Promise<T>): Promise<T> {
  let last: unknown;
  for (const [i, model] of GEMINI_MODELS.entries()) {
    try {
      return await call(model);
    } catch (error) {
      last = error;
      if (!busy(error)) throw error;
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
  throw last;
}

/** Lineage builds prompts as Anthropic-style blocks; Gemini takes parts. */
export function toParts(content: Anthropic.Beta.BetaContentBlockParam[]): Part[] {
  return content.flatMap((block): Part[] => {
    if (block.type === "text") return [{ text: block.text }];
    if (block.type === "image" && block.source.type === "base64") return [{ inlineData: { mimeType: block.source.media_type, data: block.source.data } }];
    return [];
  });
}

/** JSON Schema for a Zod schema, in the subset Gemini accepts. */
export function jsonSchemaOf(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { target: "draft-2020-12", unrepresentable: "any" }) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

export class GeminiRefusal extends Error {}

export async function geminiStructured<S extends z.ZodType>(
  schema: S,
  opts: { system: string; content: Anthropic.Beta.BetaContentBlockParam[]; maxTokens?: number },
): Promise<z.infer<S>> {
  const contents: Content[] = [{ role: "user", parts: toParts(opts.content) }];
  const response = await withFreeModel((model) =>
    gemini().models.generateContent({
      model,
      contents,
      config: {
        systemInstruction: opts.system,
        responseMimeType: "application/json",
        responseJsonSchema: jsonSchemaOf(schema),
        maxOutputTokens: opts.maxTokens ?? 8000,
      },
    }),
  );
  const finish = response.candidates?.[0]?.finishReason;
  if (response.promptFeedback?.blockReason || finish === "SAFETY" || finish === "PROHIBITED_CONTENT") throw new GeminiRefusal("The model declined this request.");
  if (finish === "MAX_TOKENS") throw new Error("The AI's answer was cut off before it finished.");
  if (!response.text) throw new Error(`The AI returned no answer (${finish ?? "no reason given"})`);
  return schema.parse(JSON.parse(response.text));
}
