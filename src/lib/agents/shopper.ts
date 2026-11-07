// The buyer-side shopping agent: finds a handmade item, checks where outside listings came from,
// skips unlicensed copies, and prepares a PayPal checkout the person approves.

import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { nanoid } from "nanoid";
import { getDb, schema } from "@/lib/db";
import { mode } from "@/lib/env";
import { MODEL, claude } from "@/lib/ai/claude";
import { gemini, jsonSchemaOf, withFreeModel } from "@/lib/ai/gemini";
import type { Content } from "@google/genai";
import { TOOLS, buyItem, checkProvenance, findLicensedItems } from "@/lib/agent-tools";

export type Step = { kind: "thought" | "tool" | "error"; name?: string; input?: unknown; output?: unknown; text?: string };

const SYSTEM = `You are a shopping assistant for handmade gifts, connected to Lineage.
Lineage pays pattern designers a royalty whenever a finished item made from their pattern is sold.

How to work:
1. Search with find_licensed_items.
2. For every item from another marketplace, call check_provenance with its image_url before mentioning it as an option. If it is an unlicensed copy, say so plainly and do not recommend it.
3. Recommend the best licensed match within the person's budget, naming the maker and the pattern's designer(s).
4. If the person asked you to buy, call buy_item and give them the approve_url. Never claim a purchase is complete: they still approve it in PayPal.
Keep the final answer short: what you found, what you skipped and why, and the link.`;

export async function runShopper(prompt: string) {
  const steps: Step[] = [];
  let result: string;
  try {
    result = mode.aiProvider === "claude" ? await withClaude(prompt, steps) : mode.aiProvider === "gemini" ? await withGemini(prompt, steps) : await scripted(prompt, steps);
  } catch (error) {
    steps.push({ kind: "error", text: error instanceof Error ? error.message : String(error) });
    result = "The agent stopped because of an error. See the last step.";
  }
  const db = await getDb();
  const id = `run_${nanoid(10)}`;
  await db.insert(schema.agentRuns).values({ id, agent: mode.aiProvider === "claude" ? "shopper" : mode.aiProvider === "gemini" ? "shopper-gemini" : "shopper-scripted", prompt, steps, result });
  return { id, steps, result, approveUrl: findApproveUrl(steps), scripted: !mode.ai };
}

async function withClaude(prompt: string, steps: Step[]) {
  const tools = TOOLS.map((t) =>
    betaZodTool({
      name: t.name,
      description: t.description,
      inputSchema: t.input,
      run: async (input: unknown) => {
        try {
          const output = await (t.run as (i: unknown) => Promise<unknown>)(input);
          steps.push({ kind: "tool", name: t.name, input, output });
          return JSON.stringify(output);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          steps.push({ kind: "tool", name: t.name, input, output: { error: message } });
          return JSON.stringify({ error: message });
        }
      },
    }),
  );

  const runner = claude().beta.messages.toolRunner({
    model: MODEL,
    max_tokens: 16000,
    max_iterations: 8,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium" },
    system: SYSTEM,
    tools,
    messages: [{ role: "user", content: prompt }],
  });

  let final = "";
  for await (const message of runner) {
    const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim();
    if (message.stop_reason === "refusal") throw new Error("The model declined this request.");
    if (text && message.stop_reason === "tool_use") steps.push({ kind: "thought", text });
    if (text) final = text;
  }
  return final || "Done.";
}

// Gemini (free tier): the same tools through Gemini function calling, in a small loop of our own.
async function withGemini(prompt: string, steps: Step[]) {
  const declarations = TOOLS.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: jsonSchemaOf(t.input) }));
  const contents: Content[] = [{ role: "user", parts: [{ text: prompt }] }];
  for (let turn = 0; turn < 8; turn++) {
    const response = await withFreeModel((model) =>
      gemini().models.generateContent({ model, contents, config: { systemInstruction: SYSTEM, tools: [{ functionDeclarations: declarations }] } }),
    );
    const content = response.candidates?.[0]?.content;
    if (!content?.parts?.length) throw new Error("The AI returned no answer.");
    // The model's turn goes back exactly as it came, including any thought signatures.
    contents.push(content);
    const calls = content.parts.filter((p) => p.functionCall);
    const text = content.parts.flatMap((p) => (p.text && !p.thought ? [p.text] : [])).join("\n").trim();
    if (calls.length === 0) return text || "Done.";
    if (text) steps.push({ kind: "thought", text });
    const results = [];
    for (const { functionCall } of calls) {
      const tool = TOOLS.find((t) => t.name === functionCall!.name);
      let output: unknown;
      try {
        if (!tool) throw new Error(`Unknown tool ${functionCall!.name}`);
        output = await (tool.run as (i: unknown) => Promise<unknown>)(tool.input.parse(functionCall!.args ?? {}));
      } catch (error) {
        output = { error: error instanceof Error ? error.message : String(error) };
      }
      steps.push({ kind: "tool", name: functionCall!.name, input: functionCall!.args, output });
      results.push({ functionResponse: { id: functionCall!.id, name: functionCall!.name, response: { result: output } } });
    }
    contents.push({ role: "user", parts: results });
  }
  return "I stopped after several steps without finishing. Try asking more specifically.";
}

// Offline stand-in (no AI key): the same tool calls in a fixed order.
async function scripted(prompt: string, steps: Step[]) {
  const priceMatch = prompt.match(/\$\s?(\d+)/);
  const max = priceMatch ? Number(priceMatch[1]) : undefined;
  const query = prompt
    .toLowerCase()
    .replace(/\$\s?\d+/g, "")
    .replace(/\b(find|me|a|an|the|for|under|buy|it|and|please|licensed|handmade|only|gift|my|niece|nephew|friend|crochet)\b/g, " ")
    .replace(/[^a-z\s]/g, " ")
    .trim();

  const found = await findLicensedItems({ query: query || "bunny", max_price_usd: max, include_outside: true });
  steps.push({ kind: "tool", name: "find_licensed_items", input: { query, max_price_usd: max }, output: found });

  const skipped: string[] = [];
  for (const item of found.other_marketplaces) {
    if (!item.image_url) continue;
    const check = await checkProvenance({ image_url: item.image_url });
    steps.push({ kind: "tool", name: "check_provenance", input: { image_url: item.image_url }, output: check });
    if (check.licensed === false && "advice" in check) skipped.push(`"${item.title}" (${check.advice})`);
  }

  const pick = found.lineage_market[0];
  if (!pick) return `I couldn't find a licensed item matching that${max ? ` under $${max}` : ""}.${skipped.length ? ` I skipped ${skipped.join("; ")}` : ""}`;
  const wantsToBuy = /\b(buy|order|purchase|get it)\b/i.test(prompt);
  let link = "";
  if (wantsToBuy) {
    const checkout = await buyItem({ listing_id: pick.listing_id });
    steps.push({ kind: "tool", name: "buy_item", input: { listing_id: pick.listing_id }, output: checkout });
    link = ` Approve the ${checkout.amount} payment here: ${checkout.approve_url}`;
  }
  return `I recommend "${pick.title}" from ${pick.maker} for ${pick.price}. It's made from ${pick.pattern}, and the designer royalty is paid at checkout.${
    skipped.length ? ` I skipped ${skipped.length} outside listing(s): ${skipped.join("; ")}` : ""
  }${link}`;
}

function findApproveUrl(steps: Step[]) {
  for (const step of [...steps].reverse()) {
    const out = step.output as { approve_url?: string } | undefined;
    if (out?.approve_url) return out.approve_url;
  }
  return undefined;
}
