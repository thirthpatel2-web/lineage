// Flat, related tables for the royalty console (AG Grid) and the AG Studio dashboard.
import { desc } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

export type ConsoleData = Awaited<ReturnType<typeof getConsoleData>>;

export async function getConsoleData() {
  const db = await getDb();
  const [designers, makers, patterns, licenses, sales, listings, credits, batches, items] = await Promise.all([
    db.select().from(schema.designers),
    db.select().from(schema.makers),
    db.select().from(schema.patterns),
    db.select().from(schema.licenses).orderBy(desc(schema.licenses.createdAt)),
    db.select().from(schema.sales).orderBy(desc(schema.sales.createdAt)),
    db.select().from(schema.listings),
    db.select().from(schema.credits).orderBy(desc(schema.credits.createdAt)),
    db.select().from(schema.payoutBatches).orderBy(desc(schema.payoutBatches.createdAt)),
    db.select().from(schema.payoutItems),
  ]);
  const payeeName = (kind: string, id: string) =>
    kind === "designer" ? designers.find((d) => d.id === id)?.name : kind === "maker" ? makers.find((m) => m.id === id)?.name : "Lineage";
  const patternTitle = (id: string | null) => patterns.find((p) => p.id === id)?.title ?? "";
  const dollars = (cents: number) => cents / 100;
  const day = (d: Date | null) => (d ? new Date(d).toISOString() : null);

  return {
    asOf: new Date().toISOString(),
    designers: designers.map((d) => ({ id: d.id, name: d.name, email: d.paypalEmail, demo: d.demo })),
    makers: makers.map((m) => ({ id: m.id, name: m.name, shop: m.shopName, email: m.paypalEmail })),
    patterns: patterns.map((p) => ({
      id: p.id,
      title: p.title,
      designerId: p.designerId,
      parentId: p.parentId ?? "",
      parentTitle: patternTitle(p.parentId),
      kind: p.parentId ? "Remix" : "Original",
      ratePercent: p.rateBp / 100,
      salesAllowed: p.salesAllowed,
    })),
    licenses: licenses.map((l) => ({
      id: l.id,
      patternId: l.patternId,
      pattern: patternTitle(l.patternId),
      makerId: l.makerId,
      maker: payeeName("maker", l.makerId),
      units: l.units,
      itemPrice: dollars(l.itemPriceCents),
      amount: dollars(l.amountCents),
      source: l.source,
      status: l.status,
      paypalOrderId: l.paypalOrderId,
      captureId: l.captureId,
      date: day(l.capturedAt ?? l.createdAt),
    })),
    sales: sales.map((s) => {
      const listing = listings.find((x) => x.id === s.listingId);
      return {
        id: s.id,
        item: listing?.title ?? s.listingId,
        patternId: listing?.patternId ?? "",
        pattern: patternTitle(listing?.patternId ?? null),
        amount: dollars(s.amountCents),
        source: s.source,
        status: s.status,
        paypalOrderId: s.paypalOrderId,
        captureId: s.captureId,
        date: day(s.capturedAt ?? s.createdAt),
      };
    }),
    credits: credits.map((c) => {
      const item = items.find((i) => i.id === c.payoutItemId);
      return {
        id: c.id,
        date: day(c.createdAt),
        payeeKind: c.payeeKind,
        payee: payeeName(c.payeeKind, c.payeeId) ?? c.payeeId,
        patternId: c.patternId ?? "",
        pattern: patternTitle(c.patternId),
        source: c.sourceKind,
        sourceId: c.sourceId,
        amount: dollars(c.amountCents),
        status: c.status,
        batch: batches.find((b) => b.id === item?.batchId)?.senderBatchId ?? "",
        paypalItemId: item?.paypalItemId ?? "",
      };
    }),
    payouts: items.map((i) => {
      const batch = batches.find((b) => b.id === i.batchId);
      return {
        id: i.id,
        batch: batch?.senderBatchId ?? "",
        paypalBatchId: batch?.paypalBatchId ?? "",
        date: day(batch?.createdAt ?? null),
        payeeKind: i.payeeKind,
        payee: payeeName(i.payeeKind, i.payeeId) ?? i.payeeId,
        receiver: i.receiver,
        amount: dollars(i.amountCents),
        status: i.status,
        paypalItemId: i.paypalItemId ?? "",
      };
    }),
  };
}
