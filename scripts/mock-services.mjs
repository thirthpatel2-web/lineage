// A stand-in for the PayPal sandbox and the Claude API, shaped after their documented responses.
// It lets `npm run e2e` drive the app's LIVE code paths without keys or credit. It proves our code
// handles those shapes; it does NOT prove the real services accept our requests. `npm run
// preflight` does that once real keys are set.
//   node scripts/mock-services.mjs [port]
import http from "node:http";

const port = Number(process.argv[2] ?? 4010);
const orders = new Map();
const batches = new Map();
const invoices = new Map();
const calls = [];
let seq = 0;
const id = (p) => `${p}${(++seq).toString(36).toUpperCase().padStart(8, "0")}`;

function fail(res, status, name, message) {
  res.writeHead(status, { "content-type": "application/json", "paypal-debug-id": "mockdebug" });
  res.end(JSON.stringify({ name, message, debug_id: "mockdebug" }));
}
const json = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json", "request-id": "req_mock" });
  res.end(JSON.stringify(body));
};

function paypal(req, res, url, body, raw) {
  const p = url.pathname;
  if (p === "/v1/oauth2/token") {
    if (!req.headers.authorization?.startsWith("Basic ")) return fail(res, 401, "invalid_client", "Client Authentication failed");
    return json(res, 200, { access_token: "mock-token", token_type: "Bearer", expires_in: 32400 });
  }
  if (req.headers.authorization !== "Bearer mock-token") return fail(res, 401, "AUTHENTICATION_FAILURE", "Invalid token");

  if (p === "/v2/checkout/orders" && req.method === "POST") {
    const key = req.headers["paypal-request-id"];
    const existing = key && [...orders.values()].find((o) => o.key === key);
    if (existing) return json(res, 200, existing.view());
    const unit = body.purchase_units?.[0];
    if (!/^\d+\.\d{2}$/.test(unit?.amount?.value ?? "")) return fail(res, 422, "UNPROCESSABLE_ENTITY", "Bad amount");
    const ctx = body.payment_source?.paypal?.experience_context;
    if (!ctx?.return_url || !ctx?.cancel_url) return fail(res, 422, "UNPROCESSABLE_ENTITY", "Missing return_url");
    const order = {
      id: id("ORD"), key, status: "PAYER_ACTION_REQUIRED", unit, ctx,
      view() {
        return { id: this.id, status: this.status, purchase_units: [{ ...this.unit, ...(this.capture && { payments: { captures: [this.capture] } }) }], links: [{ rel: "self", href: "x" }, { rel: "payer-action", href: `http://localhost:${port}/approve?token=${this.id}` }] };
      },
    };
    orders.set(order.id, order);
    return json(res, 200, order.view());
  }
  let m = p.match(/^\/v2\/checkout\/orders\/([^/]+)(\/capture)?$/);
  if (m) {
    const order = orders.get(m[1]);
    if (!order) return fail(res, 404, "RESOURCE_NOT_FOUND", "No order");
    if (!m[2]) return json(res, 200, order.view());
    if (order.status === "COMPLETED") return fail(res, 422, "UNPROCESSABLE_ENTITY", "ORDER_ALREADY_CAPTURED");
    if (order.status !== "APPROVED") return fail(res, 422, "UNPROCESSABLE_ENTITY", "ORDER_NOT_APPROVED");
    order.status = "COMPLETED";
    order.capture = { id: id("CAP"), status: "COMPLETED", amount: order.unit.amount };
    return json(res, 201, order.view());
  }

  if (p === "/v1/payments/payouts" && req.method === "POST") {
    const header = body.sender_batch_header;
    if ([...batches.values()].some((b) => b.batch_header.sender_batch_header.sender_batch_id === header.sender_batch_id)) return fail(res, 400, "USER_BUSINESS_ERROR", "Batch already completed or in progress");
    const batch = {
      batch_header: { payout_batch_id: id("BATCH"), batch_status: "PENDING", sender_batch_header: header },
      items: body.items.map((item) => ({ payout_item_id: id("ITEM"), transaction_status: item.receiver.includes("unclaimed") ? "UNCLAIMED" : "SUCCESS", payout_item: item })),
    };
    batches.set(batch.batch_header.payout_batch_id, batch);
    return json(res, 201, { batch_header: batch.batch_header, links: [] });
  }
  m = p.match(/^\/v1\/payments\/payouts\/([^/]+)$/);
  if (m) {
    const batch = batches.get(m[1]);
    if (!batch) return fail(res, 404, "RESOURCE_NOT_FOUND", "No batch");
    batch.batch_header.batch_status = "SUCCESS";
    return json(res, 200, batch);
  }

  if (p === "/v2/invoicing/invoices" && req.method === "POST") {
    const inv = { id: `INV2-${id("")}`, status: "DRAFT", detail: { ...body.detail, metadata: {} }, body };
    invoices.set(inv.id, inv);
    return json(res, 201, inv);
  }
  m = p.match(/^\/v2\/invoicing\/invoices\/([^/]+)(\/send)?$/);
  if (m) {
    const inv = invoices.get(m[1]);
    if (!inv) return fail(res, 404, "RESOURCE_NOT_FOUND", "No invoice");
    if (m[2]) {
      inv.status = "SENT";
      inv.detail.metadata.recipient_view_url = `http://localhost:${port}/invoice/${inv.id}`;
      return json(res, 200, { href: "x" });
    }
    return json(res, 200, inv);
  }

  if (p === "/v1/reporting/transactions") {
    const details = [...orders.values()].filter((o) => o.capture).map((o) => ({ transaction_info: { transaction_id: o.capture.id, transaction_event_code: "T0006", transaction_initiation_date: new Date().toISOString(), transaction_amount: { value: o.capture.amount.value, currency_code: "USD" }, transaction_status: "S" } }));
    return json(res, 200, { transaction_details: details });
  }
  if (p === "/v1/notifications/verify-webhook-signature") return json(res, 200, { verification_status: req.headers["x-mock-bad"] ? "FAILURE" : "SUCCESS" });
  return fail(res, 404, "NOT_FOUND", `Mock has no route for ${req.method} ${p}: ${raw?.slice(0, 80)}`);
}

// --- Claude ---------------------------------------------------------------------------------

const message = (content, stop_reason = "end_turn") => ({
  id: id("msg_"), type: "message", role: "assistant", model: "claude-opus-5-5",
  content: [{ type: "thinking", thinking: "", signature: "sig-" + id("") }, ...content],
  stop_reason, stop_sequence: null, usage: { input_tokens: 100, output_tokens: 50 },
});

function textOf(blocks) {
  return (Array.isArray(blocks) ? blocks : [{ type: "text", text: blocks }]).map((b) => (b.type === "text" ? b.text : b.type === "tool_result" ? String(typeof b.content === "string" ? b.content : JSON.stringify(b.content)) : "")).join("\n");
}

let shopper = null; // the stand-in's memory of a Tool Runner thread

function claude(req, res, body) {
  if (!req.headers["x-api-key"] && !req.headers.authorization) return json(res, 401, { type: "error", error: { type: "authentication_error", message: "x-api-key required" } });
  const bad = (msg) => json(res, 400, { type: "error", error: { type: "invalid_request_error", message: msg } });
  if (body.model !== "claude-opus-5-5") return bad("unexpected model");
  if (!String(req.headers["anthropic-beta"] ?? "").includes("server-side-fallback-2026-07-01") || body.fallbacks !== "default") return bad("fallbacks missing");
  if (body.thinking?.type === "disabled" || "temperature" in body) return bad("rejected parameter");
  if (body.tool_choice && ["any", "tool"].includes(body.tool_choice.type)) return bad("tool_choice: type \"tool\" and \"any\" are not supported for this model.");
  if (body.messages[0]?.role !== "user") return bad("first message must be user");
  // A tool round must come back with its thinking blocks, like the real API expects.
  for (let i = 0; i < body.messages.length; i++) {
    const m = body.messages[i];
    if (m.role === "assistant" && Array.isArray(m.content) && m.content.some((b) => b.type === "tool_use") && !m.content.some((b) => b.type === "thinking")) {
      return bad("messages: an assistant turn with tool_use must include its thinking blocks");
    }
  }
  const continuesThread = body.messages[0]?.content?.[0]?.type === "tool_result";
  const system = continuesThread && shopper ? "shopping assistant" : textOf(body.system ?? "");
  const last = body.messages.at(-1);
  const prompt = body.messages.map((m) => textOf(m.content)).join("\n");

  if (system.includes("Lineage Lens")) {
    const content = Array.isArray(last.content) ? last.content : [];
    if (!content.some((b) => b.type === "image" && b.source?.type === "base64" && b.source.data)) return bad("no image");
    const ids = [...prompt.matchAll(/CANDIDATE id="([^"]+)"/g)].map((x) => x[1]);
    const verdict = {
      traditional: { is_traditional: false, reason: "Distinctive design." },
      candidates: ids.map((cid, i) => ({ id: cid, score: i === 0 ? 0.93 : 0.3, features: [{ name: "Silhouette", score: i === 0 ? 0.95 : 0.3 }, { name: "Distinctive parts", score: i === 0 ? 0.9 : 0.2 }], explanation: i === 0 ? "Mock verdict: the construction details agree." : "Mock verdict: same kind of object only." })),
    };
    return json(res, 200, message([{ type: "text", text: JSON.stringify(verdict) }]));
  }
  if (system.includes("read the terms")) return json(res, 200, message([{ type: "text", text: JSON.stringify({ sales_allowed: true, credit_required: true, batch_limit: null, suggested_rate_percent: 8, summary: "Mock: sell with credit for 8%.", notes: [] }) }]));
  if (system.includes("license offers")) return json(res, 200, message([{ type: "text", text: JSON.stringify({ subject: "A license for your listing", message: "Mock offer: lovely work. Here is a simple license through PayPal; no takedown is being requested." }) }]));

  if (system.includes("shopping assistant")) {
    if (!continuesThread) shopper = { rounds: 0, results: [] };
    const rounds = shopper.rounds++;
    const tool = (name, input) => message([{ type: "text", text: `Calling ${name}.` }, { type: "tool_use", id: id("toolu_"), name, input }], "tool_use");
    const results = (shopper.results = [...shopper.results, ...body.messages.flatMap((m) => (Array.isArray(m.content) ? m.content.filter((b) => b.type === "tool_result") : []))]);
    if (rounds === 0) return json(res, 200, tool("find_licensed_items", { query: "astronaut bunny", max_price_usd: 45, include_outside: true }));
    const found = JSON.parse(results[0].content);
    if (rounds === 1 && found.other_marketplaces[0]) return json(res, 200, tool("check_provenance", { image_url: found.other_marketplaces[0].image_url }));
    const listing = found.lineage_market[0].listing_id;
    if (!results.some((r) => String(r.content).includes("approve_url"))) return json(res, 200, tool("buy_item", { listing_id: listing }));
    return json(res, 200, message([{ type: "text", text: "Mock agent: I skipped the unlicensed copy and prepared the licensed bunny. Approve it in PayPal." }]));
  }

  // AG Studio turn: call the first tool once, then answer.
  const usedTool = body.messages.some((m) => Array.isArray(m.content) && m.content.some((b) => b.type === "tool_result"));
  if (body.tools?.length && !usedTool) return json(res, 200, message([{ type: "tool_use", id: id("toolu_"), name: body.tools[0].name, input: {} }], "tool_use"));
  return json(res, 200, message([{ type: "text", text: "Mock assistant: Jun Park earned the most." }]));
}

// --- Server ---------------------------------------------------------------------------------

http
  .createServer((req, res) => {
    let raw = "";
    req.on("data", (d) => (raw += d));
    req.on("end", () => {
      const url = new URL(req.url, `http://localhost:${port}`);
      calls.push(`${req.method} ${url.pathname}`);
      if (url.pathname === "/__calls") return json(res, 200, calls);
      if (url.pathname === "/approve") {
        const order = orders.get(url.searchParams.get("token"));
        if (!order) return fail(res, 404, "NOT_FOUND", "No order");
        order.status = "APPROVED";
        const back = new URL(order.ctx.return_url);
        back.searchParams.set("token", order.id);
        res.writeHead(302, { location: back.href });
        return res.end();
      }
      const inv = url.pathname.match(/^\/invoice\/(.+)$/);
      if (inv) {
        invoices.get(inv[1]).status = "PAID";
        return json(res, 200, { paid: inv[1] });
      }
      let body = {};
      try {
        if ((req.headers["content-type"] ?? "").includes("json") && raw) body = JSON.parse(raw);
      } catch {
        return json(res, 400, { error: "bad json" });
      }
      if (url.pathname === "/v1/messages") return claude(req, res, body);
      return paypal(req, res, url, body, raw);
    });
  })
  .listen(port, () => console.log(`mock services on ${port}`));
