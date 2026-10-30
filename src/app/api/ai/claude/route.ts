// Server side of the AG Studio AI assistant: one AG Studio turn in, one Claude turn out.
// The browser adapter (src/app/console/studio/claude-adapter.ts) posts AG's request here, so the
// Anthropic key never reaches the browser. Translates between AG Studio's item format and the
// Messages API in both directions.

import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import type { AgAiConversationItem, AgAiOutputItem, AgLlmRequest, AgLlmResponse } from "ag-studio";
import { MODEL, claude } from "@/lib/ai/claude";
import { mode } from "@/lib/env";

export const runtime = "nodejs";
export const maxDuration = 120;

type Msg = Anthropic.Beta.BetaMessageParam;
type Block = Anthropic.Beta.BetaContentBlockParam;

function toMessages(input: AgAiConversationItem[]) {
  const system: string[] = [];
  const messages: Msg[] = [];
  const push = (role: "user" | "assistant", block: Block) => {
    const last = messages.at(-1);
    if (last && last.role === role && Array.isArray(last.content)) last.content.push(block);
    else messages.push({ role, content: [block] });
  };
  for (const item of input) {
    if (item.type === "message" && item.kind === "input") {
      const text = item.content.flatMap((c) => (c.type === "text" ? [c.text] : [])).join("\n");
      if (item.role === "system") system.push(text);
      else if (text) push("user", { type: "text", text });
    } else if (item.type === "message" && item.kind === "output") {
      const text = item.content.flatMap((c) => (c.type === "text" ? [c.text] : [])).join("\n");
      if (text) push("assistant", { type: "text", text });
    } else if (item.type === "function_call") {
      let parsed: unknown = {};
      try {
        parsed = JSON.parse(item.arguments || "{}");
      } catch {
        parsed = {};
      }
      push("assistant", { type: "tool_use", id: item.callId, name: item.name, input: parsed as Record<string, unknown> });
    } else if (item.type === "function_call_output") {
      push("user", { type: "tool_result", tool_use_id: item.callId, content: item.output });
    }
  }
  if (messages[0]?.role !== "user") messages.unshift({ role: "user", content: [{ type: "text", text: "Continue." }] });
  return { system, messages };
}

export async function POST(req: Request) {
  if (!mode.ai) return NextResponse.json({ error: "Set ANTHROPIC_API_KEY to use the AI assistant." }, { status: 503 });
  const request = (await req.json()) as AgLlmRequest;
  const { system, messages } = toMessages(request.input);
  if (request.instructions) system.unshift(request.instructions);

  // Claude Opus 5.5 does not accept forced tool choice, so a required tool becomes an instruction.
  const choice = request.toolChoice;
  if (choice === "required") system.push("You must call one of the available tools in this turn.");
  else if (choice && typeof choice === "object") system.push(`You must call the tool "${choice.name}" in this turn.`);
  if (request.responseFormat.type === "json") {
    system.push(`Reply with only a JSON object (no prose, no code fences) named "${request.responseFormat.name}" matching this JSON Schema:\n${JSON.stringify(request.responseFormat.schema)}`);
  }

  const tools: Anthropic.Beta.BetaToolUnion[] =
    choice === "none"
      ? []
      : (request.tools ?? []).map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters as Anthropic.Beta.BetaTool.InputSchema }));

  try {
    const response = await claude().beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system: system.join("\n\n"),
      messages,
      ...(tools.length > 0 && { tools }),
    });

    const output: AgAiOutputItem[] = [];
    const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim();
    if (text) {
      output.push({ id: `msg_${response.id}`, kind: "output", type: "message", role: "assistant", status: "completed", content: [{ type: "text", text: cleanJson(text, request), annotations: [] }] });
    }
    for (const block of response.content) {
      if (block.type === "tool_use") {
        output.push({ id: `fc_${block.id}`, kind: "output", type: "function_call", callId: block.id, name: block.name, arguments: JSON.stringify(block.input ?? {}), status: "completed" });
      }
    }
    const result: AgLlmResponse = {
      id: response.id,
      createdAt: Date.now(),
      status: response.stop_reason === "max_tokens" ? "incomplete" : response.stop_reason === "refusal" ? "failed" : "completed",
      ...(response.stop_reason === "max_tokens" && { incompleteDetails: { reason: "max_output_tokens" as const } }),
      ...(response.stop_reason === "refusal" && { error: { code: "refusal", message: "The model declined this request." } }),
      output,
      usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens, cachedInputTokens: response.usage.cache_read_input_tokens ?? undefined },
      model: response.model,
    };
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Anthropic.APIError ? `Claude API ${error.status}: ${error.message}` : error instanceof Error ? error.message : String(error);
    return NextResponse.json({ id: "error", createdAt: Date.now(), status: "failed", error: { code: "api_error", message }, output: [] } satisfies AgLlmResponse, { status: 200 });
  }
}

// Without schema-constrained decoding, strip any code fences around a JSON reply.
function cleanJson(text: string, request: AgLlmRequest) {
  if (request.responseFormat.type !== "json") return text;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fenced ? fenced[1] : text).trim();
}
