import { NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { route } from "@/lib/http";
import { refreshPayoutBatch } from "@/lib/commerce";

export const runtime = "nodejs";

// Re-read every unfinished payout batch from PayPal.
export const POST = route(async () => {
  const db = await getDb();
  const open = await db.select().from(schema.payoutBatches).where(inArray(schema.payoutBatches.status, ["QUEUED", "PENDING", "PROCESSING", "NEW"]));
  for (const batch of open) await refreshPayoutBatch(batch.id);
  return NextResponse.json({ refreshed: open.length });
});
