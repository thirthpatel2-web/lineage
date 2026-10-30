// AG Studio's AI assistant, backed by Claude. Studio calls executeTurn for each model turn; this
// posts the turn to our own /api/ai/claude route (which holds the key) and replays the answer to
// Studio as the event stream it expects.

import type { AgAiEvent, AgLlmAdapter, AgLlmResponse } from "ag-studio";

export function claudeAdapter(endpoint = "/api/ai/claude"): AgLlmAdapter {
  return {
    executeTurn(request, options) {
      const complete: Promise<AgLlmResponse> = fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: options?.signal,
      })
        .then(async (res) => {
          const json = (await res.json()) as AgLlmResponse | { error: string };
          if ("output" in json) return json;
          return { id: "error", createdAt: Date.now(), status: "failed", error: { code: String(res.status), message: (json as { error: string }).error }, output: [] } satisfies AgLlmResponse;
        })
        .catch((error: unknown) => ({
          id: "error",
          createdAt: Date.now(),
          status: options?.signal?.aborted ? ("cancelled" as const) : ("failed" as const),
          error: { code: "network", message: error instanceof Error ? error.message : String(error) },
          output: [],
        }));

      async function* events(): AsyncGenerator<AgAiEvent> {
        const response = await complete;
        for (const item of response.output) {
          if (item.type === "message") {
            yield { type: "TEXT_MESSAGE_START", messageId: item.id, role: "assistant" };
            for (const part of item.content) if (part.type === "text") yield { type: "TEXT_MESSAGE_CONTENT", messageId: item.id, delta: part.text };
            yield { type: "TEXT_MESSAGE_END", messageId: item.id };
          } else if (item.type === "function_call") {
            yield { type: "TOOL_CALL_START", toolCallId: item.callId, toolCallName: item.name };
            yield { type: "TOOL_CALL_ARGS", toolCallId: item.callId, delta: item.arguments };
            yield { type: "TOOL_CALL_END", toolCallId: item.callId };
          }
        }
      }

      return { stream: { [Symbol.asyncIterator]: () => events() }, complete };
    },
  };
}
