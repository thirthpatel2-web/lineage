// One command to prove the real services work, before you record the video or submit.
//   npm run preflight
// Reads .env.local and talks to the PayPal SANDBOX and the AI provider (Gemini free tier, or Claude) for real. Creates one order,
// one $1.00 payout, one draft invoice; a payout needs funds in the sandbox business account.
// It refuses to run against PayPal live. With Gemini's free tier, the AI check costs nothing.

import "./load-env";
import { z } from "zod";
import { imageBlock, structured } from "@/lib/ai/claude";
import { renderJpeg } from "@/lib/demo-art";
import { aiName, env, mode } from "@/lib/env";
import * as paypal from "@/lib/paypal";

type Result = { name: string; ok: boolean | null; note: string };
const results: Result[] = [];

async function check(name: string, run: () => Promise<string>) {
  try {
    results.push({ name, ok: true, note: await run() });
  } catch (error) {
    const debug = error instanceof paypal.PayPalError ? ` (debug id ${error.debugId ?? "none"}, details ${JSON.stringify(error.details ?? "")})` : "";
    results.push({ name, ok: false, note: `${error instanceof Error ? error.message : String(error)}${debug}` });
  }
}
const skip = (name: string, note: string) => results.push({ name, ok: null, note });
const stamp = Date.now().toString(36);

async function main() {
  if (process.env.PAYPAL_ENV === "live") throw new Error("Preflight only runs against the PayPal sandbox.");
  if (!mode.paypal) skip("PayPal", "No PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET in .env.local");
  else {
    await check("PayPal: create an order", async () => {
      const order = await paypal.createOrder({ referenceId: `preflight-${stamp}`, description: "Lineage preflight", amountCents: 100, returnUrl: `${env.appUrl}/`, cancelUrl: `${env.appUrl}/`, requestId: `preflight-${stamp}` });
      if (!order.approveUrl.includes("paypal.com")) throw new Error(`Unexpected approval link: ${order.approveUrl}`);
      return `order ${order.id}, approval link OK`;
    });
    if (!env.paypal.merchantEmail) skip("PayPal: invoice", "Set PAYPAL_MERCHANT_EMAIL (your sandbox business email)");
    else {
      await check("PayPal: create and send an invoice", async () => {
        const invoice = await paypal.createAndSendInvoice({ recipientEmail: "preflight.buyer@example.com", recipientName: "Preflight Buyer", itemName: "Lineage preflight", itemDescription: "Connection test", units: 1, unitCents: 100, note: "Connection test.", reference: `preflight-${stamp}` });
        const status = await paypal.getInvoiceStatus(invoice.id);
        return `invoice ${invoice.id}, status ${status}`;
      });
    }
    await check("PayPal: payout batch", async () => {
      const batch = await paypal.createPayoutBatch(`preflight-${stamp}`, [{ receiver: process.env.PREFLIGHT_PAYOUT_EMAIL ?? "preflight.designer@example.com", amountCents: 100, note: "Lineage preflight", senderItemId: `preflight-${stamp}-1` }]);
      await new Promise((r) => setTimeout(r, 4000));
      const after = await paypal.getPayoutBatch(batch.batch_header.payout_batch_id);
      return `batch ${batch.batch_header.payout_batch_id}: ${after.batch_header.batch_status}; item ${after.items?.[0]?.transaction_status ?? "pending"}`;
    });
    await check("PayPal: transaction search", async () => `${(await paypal.searchTransactions(7)).length} recent transactions`);
    if (!env.paypal.webhookId) skip("PayPal: webhooks", "Set PAYPAL_WEBHOOK_ID after you deploy (the deployed URL receives them)");
  }

  if (!mode.ai) skip("AI", "No GEMINI_API_KEY (free) or ANTHROPIC_API_KEY in .env.local");
  else {
    await check(`${aiName}: vision with structured output`, async () => {
      const reply = await structured(z.object({ what: z.string(), has_helmet: z.boolean(), confidence: z.number().int().nullable() }), {
        system: "You describe photos of craft items.",
        effort: "low",
        maxTokens: 2000,
        content: [imageBlock(await renderJpeg("astronaut-bunny", 4242)), { type: "text", text: "What is this, and is it wearing a helmet?" }],
      });
      if (!reply.has_helmet) throw new Error(`Model answered, but missed the helmet: ${JSON.stringify(reply)}`);
      return `"${reply.what}", helmet seen`;
    });
  }

  console.log("\nLineage preflight\n");
  for (const r of results) console.log(`${r.ok === true ? "PASS" : r.ok === false ? "FAIL" : "SKIP"}  ${r.name}\n      ${r.note}`);
  const failed = results.filter((r) => r.ok === false).length;
  const skipped = results.filter((r) => r.ok === null).length;
  console.log(`\n${failed ? `${failed} failed.` : skipped ? `Nothing failed, but ${skipped} skipped: not ready yet.` : "All live checks passed."}`);
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
