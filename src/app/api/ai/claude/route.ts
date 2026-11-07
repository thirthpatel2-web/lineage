// Server side of the AG Studio AI assistant: one AG Studio turn in, one Claude turn out.
// The browser adapter (src/app/console/studio/claude-adapter.ts) posts AG's request here, so the
// Anthropic key never reaches the browser. Translates between AG Studio's item format and the
// Messages API in both directions.

import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import type { AgAiConversationItem, AgAiOutputItem, AgLlmRequest, AgLlmResponse } from "ag-studio";
import { MODEL, claude } from "@/lib/ai/claude";
import { mode } from "@/lib/env";
import { errorResponse } from "@/lib/http";
import { checkAiBudget } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 120;

type Msg = Anthropic.Beta.BetaMessageParam;
type Block = Anthropic.Beta.BetaContentBlockParam;

const MAX_BODY_BYTES = 200_000;
const MAX_TOKENS = 4000;

// AG Studio's history has nowhere to carry Claude's thinking blocks, but a tool round must go back
// exactly as Claude sent it. So each reply that called a tool waits here, whole, keyed by its tool
// calls, and is replayed verbatim. In memory, which suits one instance.
const globalForReplies = globalThis as unknown as { lineageReplies?: Map<string, Block[]> };
const replies = (globalForReplies.lineageReplies ??= new Map<string, Block[]>());
const MAX_REMEMBERED = 500;

function toMessages(input: AgAiConversationItem[]) {
  const messages: Msg[] = [];
  const replayed = new Set<Block[]>();
  const push = (role: "user" | "assistant", block: Block) => {
    const last = messages.at(-1);
    if (!last || last.role !== role || !Array.isArray(last.content)) {
      messages.push({ role, content: [block] });
      return;
    }
    const content = last.content as Block[];
    // Tool results must open a user turn, ahead of any text.
    if (block.type === "tool_result") content.splice(content.filter((b) => b.type === "tool_result").length, 0, block);
    else content.push(block);
  };
  for (const item of input) {
    if (item.type === "message" && item.kind === "input") {
      const text = item.content.flatMap((c) => (c.type === "text" ? [c.text] : [])).join("\n");
      if (text) push("user", { type: "text", text: item.role === "system" ? `(Note from the app: ${text})` : text });
    } else if (item.type === "message" && item.kind === "output") {
      const text = item.content.flatMap((c) => (c.type === "text" ? [c.text] : [])).join("\n");
      if (text) push("assistant", { type: "text", text });
    } else if (item.type === "function_call") {
      const original = replies.get(item.callId);
      if (original) {
        if (replayed.has(original)) continue; // the whole reply is already in place
        replayed.add(original);
        // Replace this turn's rebuilt text with the reply exactly as Claude sent it.
        const last = messages.at(-1);
        const texts = new Set(original.flatMap((b) => (b.type === "text" ? [b.text.trim()] : [])));
        if (last?.role === "assistant" && Array.isArray(last.content)) {
          last.content = (last.content as Block[]).filter((b) => !(b.type === "text" && texts.has(b.text.trim())));
          if (last.content.length === 0) messages.pop();
        }
        for (const block of original) push("assistant", block);
        continue;
      }
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
  // A history that ends on the assistant would be read as a prefill, which this model rejects.
  if (messages.at(-1)?.role === "assistant") messages.push({ role: "user", content: [{ type: "text", text: "Continue." }] });
  return messages;
}

export async function POST(req: Request) {
  if (!mode.ai) return NextResponse.json({ error: "Set ANTHROPIC_API_KEY to use the AI assistant." }, { status: 503 });
  // This route spends Claude credit, so it only serves Lineage's own pages, within the demo budget.
  const origin = req.headers.get("origin");
  if (!origin || new URL(origin).host !== req.headers.get("host")) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return NextResponse.json({ error: "Request too large" }, { status: 413 });
  try {
    checkAiBudget(req, 30);
  } catch (error) {
    return errorResponse(error);
  }
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return NextResponse.json({ error: "Request too large" }, { status: 413 });
  let request: AgLlmRequest;
  try {
    request = JSON.parse(raw) as AgLlmRequest;
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  if (!Array.isArray(request.input) || !request.responseFormat) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  // The system prompt stays the same every turn so earlier thinking stays valid; per-turn
  // directions go at the end of the conversation instead.
  const system = request.instructions ?? "You are the analytics assistant inside Lineage's AG Studio royalty dashboard.";
  const messages = toMessages(request.input);
  const turnNotes: string[] = [];
  // Claude Opus 5.5 does not accept forced tool choice, so a required tool becomes an instruction.
  const choice = request.toolChoice;
  if (choice === "required") turnNotes.push("Call one of the available tools in this turn.");
  else if (choice && typeof choice === "object") turnNotes.push(`Call the tool "${choice.name}" in this turn.`);
  if (request.responseFormat.type === "json") {
    turnNotes.push(`Reply with only a JSON object (no prose, no code fences) named "${request.responseFormat.name}" matching this JSON Schema:\n${JSON.stringify(request.responseFormat.schema)}`);
  }
  if (turnNotes.length) messages.push({ role: "system", content: turnNotes.join("\n\n") } as Msg);

  const tools: Anthropic.Beta.BetaToolUnion[] = (request.tools ?? []).map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters as Anthropic.Beta.BetaTool.InputSchema }));

  try {
    const send = (history: Msg[]) =>
      claude().beta.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low" },
        system,
        messages: history,
        // Tools stay declared even when none may be called, because the history may contain tool calls.
        ...(tools.length > 0 && { tools, ...(choice === "none" && { tool_choice: { type: "none" as const } }) }),
      });
    // If earlier thinking can no longer be checked (say, the server restarted), the documented
    // recovery is to strip it all and retry once.
    const response = await send(messages).catch((error: unknown) => {
      if (error instanceof Anthropic.BadRequestError && /thinking/i.test(error.message)) return send(withoutThinking(messages));
      throw error;
    });

    const content = response.content as unknown as Block[];
    for (const block of response.content) if (block.type === "tool_use") replies.set(block.id, content);
    while (replies.size > MAX_REMEMBERED) replies.delete(replies.keys().next().value!);

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
    console.error("[ai/claude]", error);
    const message = error instanceof Anthropic.RateLimitError ? "The AI is busy. Try again in a moment." : "The AI assistant couldn't answer. Try again.";
    return NextResponse.json({ id: "error", createdAt: Date.now(), status: "failed", error: { code: "api_error", message }, output: [] } satisfies AgLlmResponse, { status: 200 });
  }
}

function withoutThinking(messages: Msg[]): Msg[] {
  return messages.map((m) => (m.role !== "system" && Array.isArray(m.content) ? ({ ...m, content: (m.content as Block[]).filter((b) => b.type !== "thinking" && b.type !== "redacted_thinking") } as Msg) : m));
}

// Without schema-constrained decoding, strip any code fences around a JSON reply.
function cleanJson(text: string, request: AgLlmRequest) {
  if (request.responseFormat.type !== "json") return text;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fenced ? fenced[1] : text).trim();
}
