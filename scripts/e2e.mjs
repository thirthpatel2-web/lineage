// Drives every flow in a real browser (Edge via playwright-core) against a running server, and
// checks the results. The live-path mode needs scripts/mock-services.mjs and PAYPAL/ANTHROPIC set.
//   node scripts/e2e.mjs [baseUrl]
import { chromium } from "playwright-core";
import sharp from "sharp";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const base = process.argv[2] ?? "http://localhost:3000";
const results = [];
const step = async (name, run) => {
  try {
    results.push(["PASS", name, (await run()) ?? ""]);
  } catch (error) {
    results.push(["FAIL", name, String(error.message ?? error).split("\n")[0]]);
  }
};
const assert = (ok, message) => {
  if (!ok) throw new Error(message);
};

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(`${page.url()}: ${e.message}`));
const go = (p) => page.goto(base + p, { waitUntil: "networkidle", timeout: 120000 });
const api = (p, body) => page.evaluate(async ([p, body]) => {
  const r = await fetch(p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
  return { status: r.status, json: await r.json() };
}, [p, body]);
const live = (await (await page.goto(base + "/")).text()).includes("PayPal sandbox · ");

// Follows PayPal's approval link, whichever PayPal is behind it.
async function approve() {
  if (page.url().includes("/sim/paypal")) await page.getByRole("button", { name: "Pay now" }).click();
  await page.waitForURL(/\/(licenses|orders)\//, { timeout: 60000 });
  await page.waitForLoadState("networkidle");
}

let licenseUrl;
await step("Maker: match a remix, see its lineage and split", async () => {
  await go("/snap");
  await page.getByRole("button", { name: "Astronaut bunny" }).click();
  await page.getByText("License to sell").waitFor({ timeout: 90000 });
  const text = await page.locator("main").innerText();
  assert(text.includes("Astronaut Bunny") && text.includes("Clover Bunny"), "lineage missing");
  assert(text.includes("$25.20") && text.includes("$10.80") && text.includes("$4.00"), "split missing");
});
await step("Maker: pay through PayPal, get a receipt and QR tags", async () => {
  await page.getByRole("button", { name: /with PayPal/ }).click();
  await page.waitForURL(/sim\/paypal|\/licenses\//, { timeout: 60000 });
  await approve();
  licenseUrl = page.url();
  const text = await page.locator("main").innerText();
  assert(text.includes("Paid") && text.includes("Provenance tags"), "not paid");
  assert((await page.locator("main [role=img]").count()) === 10, "expected 10 QR tags");
});
await step("Buyer: scan a tag", async () => {
  await page.goto(licenseUrl.replace(/\?.*/, "").replace("/licenses/", "/t/") + "-3", { waitUntil: "networkidle" });
  assert((await page.locator("main").innerText()).includes("Genuine licensed item"), "tag not genuine");
});
await step("Maker: print tags page", async () => {
  await page.goto(licenseUrl.replace(/\?.*/, "") + "/print", { waitUntil: "networkidle" });
  assert((await page.locator("main [role=img]").count()) === 10, "expected 10 printable tags");
});
await step("Guard: a designer who forbids sales can't be licensed", async () => {
  await go("/snap");
  await page.getByRole("button", { name: "Frog" }).click();
  await page.getByText("Not for sale").waitFor({ timeout: 90000 });
  assert((await page.getByRole("button", { name: /with PayPal/ }).count()) === 0, "pay button shown");
});
await step("Guard: an unregistered item matches nothing", async () => {
  if (live) return "skipped: the stand-in Claude always finds a match";
  await go("/snap");
  await page.getByRole("button", { name: /Cat/ }).click();
  await page.getByText("No registered pattern matches").waitFor({ timeout: 90000 });
});
await step("Designer: read terms and register a remix with a photo upload", async () => {
  const photo = path.join(os.tmpdir(), `lineage-e2e-${Date.now()}.jpg`);
  fs.writeFileSync(photo, await sharp({ create: { width: 640, height: 640, channels: 3, background: "#c8a2c8" } }).composite([{ input: Buffer.from('<svg width="400" height="400"><circle cx="200" cy="200" r="180" fill="#552"/></svg>'), left: 120, top: 120 }]).jpeg().toBuffer());
  await go("/designers/new");
  await page.fill("#designerName", "E2E Designer");
  await page.fill("#paypalEmail", `e2e.${Date.now()}@example.com`);
  await page.fill("#title", `E2E Pattern ${Date.now()}`);
  await page.setInputFiles("#photos", photo);
  await page.selectOption("#parentId", "pat_clover_bunny");
  await page.getByRole("button", { name: /Read my terms/ }).click();
  await page.locator("#ratePercent").waitFor({ timeout: 60000 });
  await page.check('input[name="consent"]');
  await page.getByRole("button", { name: "Register pattern" }).click();
  await page.waitForURL(/\/patterns\/pat_/, { timeout: 90000 });
  assert((await page.locator("main").innerText()).includes("Clover Bunny"), "remix parent missing");
  const json = await (await page.request.get(page.url() + "/lineage.json")).json();
  assert(json.lineage === "1.0" && json.parents[0].id === "pat_clover_bunny", "lineage.json wrong");
  fs.unlinkSync(photo);
});
await step("Buyer: purchase on the Market splits maker and royalty", async () => {
  await go("/market/lst_astro_ana");
  await page.getByRole("button", { name: "Buy with PayPal" }).click();
  await page.waitForURL(/sim\/paypal|\/orders\//, { timeout: 60000 });
  await approve();
  const text = await page.locator("main").innerText();
  assert(text.includes("Thank you") && text.includes("$36.00"), "maker share missing: " + text.slice(0, 200));
});
await step("Agent: skips the unlicensed copy and prepares a checkout", async () => {
  await go("/agent");
  await page.getByRole("button", { name: "Run agent" }).click();
  await page.getByText("Answer", { exact: true }).waitFor({ timeout: 180000 });
  assert((await page.getByText("Unlicensed copy: skipped").count()) >= 1, "no copy flagged");
  assert((await page.getByRole("link", { name: /approve in PayPal/ }).count()) === 1, "no approve link");
});
await step("MCP: initialize, list tools, call one", async () => {
  const rpc = (method, params) => page.evaluate(async ([method, params]) => {
    const r = await fetch("/mcp", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
    return r.json();
  }, [method, params]);
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "e2e", version: "1" } });
  assert((await rpc("tools/list", {})).result.tools.length === 6, "expected 6 tools");
  const terms = await rpc("tools/call", { name: "get_license_terms", arguments: { pattern_id: "pat_astro_bunny" } });
  assert(JSON.parse(terms.result.content[0].text).royalty_percent === 10, "terms wrong");
  const ssrf = await rpc("tools/call", { name: "check_provenance", arguments: { image_url: "https://127.0.0.1/secret.png" } });
  assert(ssrf.result.isError, "private address was fetched");
});
await step("Designer: unsure match is refused, confident one becomes an invoice", async () => {
  await go("/offers");
  if (!live) {
    await page.getByRole("button", { name: /Unrelated cat/ }).click();
    await page.getByRole("button", { name: "Check & draft offer" }).click();
    await page.getByText(/not confident/).waitFor({ timeout: 90000 });
  }
  await page.getByRole("button", { name: /Look-alike/ }).click();
  await page.getByRole("button", { name: "Check & draft offer" }).click();
  await page.getByRole("button", { name: /Approve & send/ }).first().waitFor({ timeout: 90000 });
  await page.getByRole("button", { name: /Approve & send/ }).first().click();
  await page.getByRole("link", { name: /View PayPal invoice/ }).first().waitFor({ timeout: 60000 });
});
await step("Designer: invoice paid at PayPal reaches the ledger", async () => {
  const href = await page.getByRole("link", { name: /View PayPal invoice/ }).first().getAttribute("href");
  if (live) {
    await page.request.get(href);
    const r = await api("/api/payouts/refresh");
    assert(r.json.paidOffers === 1, "invoice not detected as paid: " + JSON.stringify(r.json));
  } else {
    await page.goto(href, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Pay invoice" }).click();
    await page.getByText(/Paid\. Royalties/).waitFor();
  }
});
await step("Console: payouts run once, pay everyone, and can't double pay", async () => {
  await go("/console");
  const first = await api("/api/payouts/run");
  assert(first.status === 200 && first.json.batch?.items >= 2, "first run: " + JSON.stringify(first.json));
  const second = await api("/api/payouts/run");
  assert(second.json.batch === null, "second run paid again: " + JSON.stringify(second.json));
  await api("/api/payouts/refresh");
  await go("/console");
  await page.getByRole("tab", { name: /Royalty ledger/ }).click();
  await page.locator(".ag-row").first().waitFor({ timeout: 30000 });
  const text = await page.locator("main").innerText();
  assert(text.includes("paid") && text.includes("kept"), "ledger statuses wrong");
});
await step("Console: reconcile with PayPal", async () => {
  const r = await api("/api/payouts/reconcile");
  assert(r.status === 200 && r.json.amountMismatches.length === 0, JSON.stringify(r.json));
  if (live) assert(r.json.matched === r.json.captures && r.json.captures >= 2, JSON.stringify(r.json));
  return JSON.stringify({ captures: r.json.captures, matched: r.json.matched });
});
await step("AG Studio: dashboard renders", async () => {
  await go("/console/studio");
  await page.getByText("Royalties to designers").waitFor({ timeout: 60000 });
});
if (live) {
  await step("AG Studio assistant: a tool round keeps thinking blocks", async () => {
    const turn = (input) => api("/api/ai/claude", { input, responseFormat: { type: "text" }, tools: [{ name: "look", description: "Look", parameters: { type: "object", properties: {} } }] });
    const user = { id: "u", kind: "input", type: "message", role: "user", status: "completed", content: [{ type: "text", text: "Who earned most?" }] };
    const first = await turn([user]);
    assert(first.json.status === "completed", "first: " + JSON.stringify(first.json).slice(0, 200));
    const call = first.json.output.find((o) => o.type === "function_call");
    assert(call, "no tool call");
    const second = await turn([user, call, { type: "function_call_output", callId: call.callId, output: "{}", status: "completed" }]);
    assert(second.json.status === "completed", "second: " + JSON.stringify(second.json).slice(0, 200));
    assert(second.json.output[0].content[0].text.includes("Jun Park"), "no answer");
  });
}
await step("No page crashed anywhere", async () => assert(pageErrors.length === 0, pageErrors.join(" | ")));

await browser.close();
console.log(`\nLineage e2e (${live ? "live code paths" : "offline mode"}) against ${base}\n`);
for (const [status, name, note] of results) console.log(`${status}  ${name}${note ? `  [${note}]` : ""}`);
const failed = results.filter((r) => r[0] === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
