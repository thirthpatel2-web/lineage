// Checks the Claude request wiring without a key: the SDK's HTTP call is intercepted, so we can
// assert exactly what would be sent and that a well-formed reply is parsed.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

let sent: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[] = [];

function reply(text: string) {
  return new Response(
    JSON.stringify({
      id: "msg_test",
      type: "message",
      role: "assistant",
      model: "claude-opus-5-5",
      content: [{ type: "text", text }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 10 },
    }),
    { status: 200, headers: { "content-type": "application/json", "request-id": "req_test" } },
  );
}

beforeAll(() => {
  process.env.ANTHROPIC_API_KEY = "test-key";
});

afterEach(() => {
  sent = [];
  vi.unstubAllGlobals();
  vi.resetModules();
});

function stubFetch(text: string) {
  vi.stubGlobal("fetch", async (url: string | URL, init: RequestInit) => {
    const headers: Record<string, string> = {};
    new Headers(init.headers).forEach((v, k) => (headers[k] = v));
    sent.push({ url: String(url), headers, body: JSON.parse(String(init.body)) });
    return reply(text);
  });
}

describe("Claude wiring", () => {
  it("reads license terms with structured output, fallbacks and the right model", async () => {
    stubFetch(JSON.stringify({ sales_allowed: true, credit_required: true, batch_limit: 50, suggested_rate_percent: 7, summary: "Sell up to 50 with credit.", notes: [] }));
    const { readLicense } = await import("./license");
    const terms = await readLicense("Sell what you make, credit me, up to 50 items, 7%.");

    expect(terms).toMatchObject({ sales_allowed: true, batch_limit: 50, suggested_rate_percent: 7, source: "ai" });
    const req = sent[0];
    expect(req.url).toContain("/v1/messages");
    expect(req.headers["anthropic-beta"]).toContain("server-side-fallback-2026-07-01");
    expect(req.body.model).toBe("claude-opus-5-5");
    expect(req.body.fallbacks).toBe("default");
    const output = req.body.output_config as { effort: string; format: { type: string; schema: { properties: Record<string, unknown> } } };
    expect(output.effort).toBe("low");
    expect(output.format.type).toBe("json_schema");
    expect(Object.keys(output.format.schema.properties)).toEqual(["sales_allowed", "credit_required", "batch_limit", "suggested_rate_percent", "summary", "notes"]);
    expect(req.body).not.toHaveProperty("thinking");
    expect(req.body).not.toHaveProperty("temperature");
  });

  it("rejects a reply that doesn't match the schema", async () => {
    stubFetch(JSON.stringify({ sales_allowed: "maybe" }));
    const { readLicense } = await import("./license");
    await expect(readLicense("Sell freely.")).rejects.toThrow();
  });
});
