import { NextResponse } from "next/server";
import { isNotNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { route } from "@/lib/http";
import { checkPaymentRate } from "@/lib/rate-limit";
import { refreshOffers, refreshPayoutBatch } from "@/lib/commerce";

export const runtime = "nodejs";

// Re-read payouts and invoices from PayPal. Finished batches are included too, because an
// UNCLAIMED item can still become SUCCESS or RETURNED later.
export const POST = route(async (req: Request) => {
  checkPaymentRate(req);
  const db = await getDb();
  const batches = await db.select({ id: schema.payoutBatches.id }).from(schema.payoutBatches).where(isNotNull(schema.payoutBatches.paypalBatchId));
  let failed = 0;
  for (const batch of batches) {
    await refreshPayoutBatch(batch.id).catch((error: unknown) => {
      failed++;
      console.error("[payouts] could not refresh", batch.id, error);
    });
  }
  const paidOffers = await refreshOffers();
  return NextResponse.json({ refreshed: batches.length - failed, failed, paidOffers });
});
