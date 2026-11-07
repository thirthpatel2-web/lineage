// The AG Studio assistant on Gemini's free tier: AG Studio's items in, one Gemini turn out.
import type { Content, FunctionCallingConfigMode, Part } from "@google/genai";
import type { AgAiConversationItem, AgAiOutputItem, AgLlmRequest, AgLlmResponse } from "ag-studio";
import { nanoid } from "nanoid";
import { gemini, withFreeModel } from "@/lib/ai/gemini";

// A model turn that called tools must go back exactly as Gemini sent it (with its thought
// signatures), so each one waits here keyed by its calls. In memory, which suits one instance.
type Remembered = { content: Content; names: Map<string, string> };
const globalForTurns = globalThis as unknown as { lineageGeminiTurns?: Map<string, Remembered> };
const turns = (globalForTurns.lineageGeminiTurns ??= new Map<string, Remembered>());

function toContents(input: AgAiConversationItem[]) {
  const contents: Content[] = [];
  const names = new Map<string, string>();
  const replayed = new Set<Content>();
  const push = (role: "user" | "model", part: Part) => {
    const last = contents.at(-1);
    if (last?.role === role) last.parts!.push(part);
    else contents.push({ role, parts: [part] });
  };
  for (const item of input) {
    if (item.type === "message" && item.kind === "input") {
      const text = item.content.flatMap((c) => (c.type === "text" ? [c.text] : [])).join("\n");
      if (text) push("user", { text: item.role === "system" ? `(Note from the app: ${text})` : text });
    } else if (item.type === "message" && item.kind === "output") {
      const text = item.content.flatMap((c) => (c.type === "text" ? [c.text] : [])).join("\n");
      if (text) push("model", { text });
    } else if (item.type === "function_call") {
      names.set(item.callId, item.name);
      const remembered = turns.get(item.callId);
      if (remembered) {
        if (replayed.has(remembered.content)) continue;
        replayed.add(remembered.content);
        const last = contents.at(-1);
        if (last?.role === "model") contents.pop(); // replaced by the original turn
        contents.push(remembered.content);
        continue;
      }
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(item.arguments || "{}");
      } catch {
        args = {};
      }
      push("model", { functionCall: { name: item.name, args } });
    } else if (item.type === "function_call_output") {
      push("user", { functionResponse: { name: names.get(item.callId) ?? "tool", response: { result: item.output } } });
    }
  }
  if (contents[0]?.role !== "user") contents.unshift({ role: "user", parts: [{ text: "Continue." }] });
  if (contents.at(-1)?.role !== "user") contents.push({ role: "user", parts: [{ text: "Continue." }] });
  return contents;
}

export async function geminiTurn(request: AgLlmRequest): Promise<AgLlmResponse> {
  const contents = toContents(request.input);
  const notes: string[] = [];
  if (request.responseFormat.type === "json") {
    notes.push(`Reply with only a JSON object (no prose, no code fences) named "${request.responseFormat.name}" matching this JSON Schema:\n${JSON.stringify(request.responseFormat.schema)}`);
  }
  if (notes.length) contents.at(-1)!.parts!.push({ text: notes.join("\n\n") });

  const choice = request.toolChoice;
  const declarations = (request.tools ?? []).map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.parameters }));
  const mode = (choice === "none" ? "NONE" : choice === "required" || typeof choice === "object" ? "ANY" : "AUTO") as FunctionCallingConfigMode;

  const response = await withFreeModel((model) =>
    gemini().models.generateContent({
      model,
      contents,
      config: {
        systemInstruction: request.instructions ?? "You are the analytics assistant inside Lineage's AG Studio royalty dashboard.",
        maxOutputTokens: 4000,
        ...(declarations.length > 0 && {
          tools: [{ functionDeclarations: declarations }],
          toolConfig: { functionCallingConfig: { mode, ...(typeof choice === "object" && { allowedFunctionNames: [choice.name] }) } },
        }),
      },
    }),
  );

  const content = response.candidates?.[0]?.content;
  const parts = content?.parts ?? [];
  const output: AgAiOutputItem[] = [];
  const text = parts.flatMap((p) => (p.text && !p.thought ? [p.text] : [])).join("\n").trim();
  if (text) {
    const json = request.responseFormat.type === "json" ? (text.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] ?? text).trim() : text;
    output.push({ id: `msg_${nanoid(8)}`, kind: "output", type: "message", role: "assistant", status: "completed", content: [{ type: "text", text: json, annotations: [] }] });
  }
  const remembered: Remembered = { content: content ?? { role: "model", parts: [] }, names: new Map() };
  for (const part of parts) {
    if (!part.functionCall) continue;
    const callId = part.functionCall.id ?? `gem_${nanoid(10)}`;
    turns.set(callId, remembered);
    output.push({ id: `fc_${callId}`, kind: "output", type: "function_call", callId, name: part.functionCall.name ?? "tool", arguments: JSON.stringify(part.functionCall.args ?? {}), status: "completed" });
  }
  while (turns.size > 500) turns.delete(turns.keys().next().value!);

  const finish = response.candidates?.[0]?.finishReason;
  const usage = response.usageMetadata;
  return {
    id: response.responseId ?? nanoid(),
    createdAt: Date.now(),
    status: finish === "MAX_TOKENS" ? "incomplete" : finish === "SAFETY" ? "failed" : "completed",
    ...(finish === "MAX_TOKENS" && { incompleteDetails: { reason: "max_output_tokens" as const } }),
    ...(finish === "SAFETY" && { error: { code: "refusal", message: "The model declined this request." } }),
    output,
    usage: { inputTokens: usage?.promptTokenCount ?? 0, outputTokens: usage?.candidatesTokenCount ?? 0 },
    model: response.modelVersion,
  };
}
