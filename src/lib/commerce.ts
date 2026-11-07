// Money flows. Rules: amounts are integer cents; ledger credits are written only after PayPal
// reports a COMPLETED capture for the exact expected amount; every step is safe to repeat.

import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb, schema } from "@/lib/db";
import { env, mode } from "@/lib/env";
import { getChain, toLinks } from "@/lib/lineage";
import { formatCents, fromPayPalValue, licenseAmount, splitRoyalty, splitSale, type Credit } from "@/lib/money";
import * as paypal from "@/lib/paypal";
import { UserError } from "@/lib/images";

const newId = (prefix: string) => `${prefix}_${nanoid(12)}`;

// --- Checkout -----------------------------------------------------------------------

export async function startLicenseCheckout(input: {
  patternId: string;
  makerId: string;
  units: number;
  itemPriceCents: number;
  matchId?: string | null;
  source: "maker" | "agent";
}) {
  const db = await getDb();
  const [chain, maker] = await Promise.all([getChain(input.patternId), db.query.makers.findFirst({ where: eq(schema.makers.id, input.makerId) })]);
  const pattern = chain[0];
  if (!maker) throw new UserError("Unknown maker");
  if (!pattern.salesAllowed) throw new UserError(`${pattern.designer.name} does not allow selling finished items from "${pattern.title}".`);
  if (pattern.batchLimit && input.units > pattern.batchLimit) throw new UserError(`This license allows at most ${pattern.batchLimit} items.`);

  const amountCents = licenseAmount(input.itemPriceCents, pattern.rateBp, pattern.minCents, input.units);
  const id = newId("lic");
  await db.insert(schema.licenses).values({
    id,
    patternId: pattern.id,
    makerId: maker.id,
    matchId: input.matchId ?? null,
    units: input.units,
    itemPriceCents: input.itemPriceCents,
    rateBp: pattern.rateBp,
    amountCents,
    source: input.source,
  });
  const order = await paypal.createOrder({
    referenceId: id,
    description: `Lineage license: ${input.units} x "${pattern.title}" by ${pattern.designer.name}`,
    amountCents,
    returnUrl: `${env.appUrl}/api/paypal/return?ref=${id}`,
    cancelUrl: `${env.appUrl}/licenses/${id}?cancelled=1`,
    requestId: `order-${id}`,
  });
  await db.update(schema.licenses).set({ paypalOrderId: order.id }).where(eq(schema.licenses.id, id));
  return { licenseId: id, orderId: order.id, approveUrl: order.approveUrl, amountCents };
}

export async function startSaleCheckout(input: { listingId: string; source: "web" | "agent"; note?: string }) {
  const db = await getDb();
  const listing = await db.query.listings.findFirst({ where: eq(schema.listings.id, input.listingId) });
  if (!listing) throw new UserError("Unknown listing");
  if (listing.stock < 1) throw new UserError("This item is sold out.");
  const id = newId("sale");
  await db.insert(schema.sales).values({ id, listingId: listing.id, amountCents: listing.priceCents, source: input.source, buyerNote: input.note ?? null });
  const order = await paypal.createOrder({
    referenceId: id,
    description: `${listing.title} (designer royalty included)`,
    amountCents: listing.priceCents,
    returnUrl: `${env.appUrl}/api/paypal/return?ref=${id}`,
    cancelUrl: `${env.appUrl}/market/${listing.id}?cancelled=1`,
    requestId: `order-${id}`,
  });
  await db.update(schema.sales).set({ paypalOrderId: order.id }).where(eq(schema.sales.id, id));
  return { saleId: id, orderId: order.id, approveUrl: order.approveUrl, amountCents: listing.priceCents };
}

/**
 * Capture an approved order and write the ledger. Safe to call from the return URL, a webhook
 * and a manual refresh at the same time: only the call that flips the row from `created` writes credits.
 */
export async function completeOrder(orderId: string): Promise<{ kind: "license" | "sale"; id: string; status: string }> {
  const db = await getDb();
  const license = await db.query.licenses.findFirst({ where: eq(schema.licenses.paypalOrderId, orderId) });
  const sale = license ? undefined : await db.query.sales.findFirst({ where: eq(schema.sales.paypalOrderId, orderId) });
  const record = license ?? sale;
  if (!record) throw new Error(`No Lineage purchase for PayPal order ${orderId}`);
  const kind: "license" | "sale" = license ? "license" : "sale";
  if (record.status !== "created") return { kind, id: record.id, status: record.status };

  // A capture that is still settling (or was made by another caller) must be read, not captured again.
  let order = await paypal.getOrder(orderId);
  if (order.status !== "COMPLETED") order = await paypal.captureOrder(orderId);
  const capture = paypal.captureOf(order);
  if (order.status !== "COMPLETED" || capture?.status !== "COMPLETED") {
    // PENDING captures (e.g. eCheck) settle later; the PAYMENT.CAPTURE.COMPLETED webhook finishes them.
    return { kind, id: record.id, status: capture?.status?.toLowerCase() ?? order.status.toLowerCase() };
  }
  const paid = fromPayPalValue(capture.amount.value);
  if (capture.amount.currency_code !== "USD" || paid !== record.amountCents) {
    await markFailed(kind, record.id);
    throw new Error(`Captured ${capture.amount.value} ${capture.amount.currency_code}, expected ${formatCents(record.amountCents)}`);
  }

  let credits: Credit[];
  if (license) {
    credits = splitRoyalty(license.amountCents, toLinks(await getChain(license.patternId)), env.platformFeeBp);
  } else {
    const listing = (await db.query.listings.findFirst({ where: eq(schema.listings.id, sale!.listingId) }))!;
    const chain = await getChain(listing.patternId);
    credits = splitSale(sale!.amountCents, chain[0].rateBp, chain[0].minCents, listing.makerId, toLinks(chain), env.platformFeeBp).credits;
  }

  try {
    await db.transaction(async (tx) => {
      const table = license ? schema.licenses : schema.sales;
      const flipped = await tx
        .update(table)
        .set({ status: "captured", captureId: capture.id, capturedAt: new Date() })
        .where(and(eq(table.id, record.id), eq(table.status, "created")))
        .returning({ id: table.id });
      if (flipped.length === 0) return; // another caller already recorded it
      if (sale) {
        const taken = await tx
          .update(schema.listings)
          .set({ stock: sql`${schema.listings.stock} - 1` })
          .where(and(eq(schema.listings.id, sale.listingId), gt(schema.listings.stock, 0)))
          .returning({ id: schema.listings.id });
        if (taken.length === 0) throw new SoldOut();
      }
      await tx.insert(schema.credits).values(
        credits.map((c) => ({ id: newId("cr"), sourceKind: kind, sourceId: record.id, payeeKind: c.payeeKind, payeeId: c.payeeId, patternId: c.patternId, amountCents: c.amountCents, status: c.payeeKind === "platform" ? ("kept" as const) : ("pending" as const) })),
      );
    });
  } catch (error) {
    if (!(error instanceof SoldOut) || !sale) throw error;
    // Two buyers paid for the last item: give this one their money back.
    await paypal.refundCapture(capture.id, `refund-${sale.id}`);
    await db.update(schema.sales).set({ status: "refunded", captureId: capture.id }).where(eq(schema.sales.id, sale.id));
    return { kind, id: record.id, status: "refunded" };
  }
  return { kind, id: record.id, status: "captured" };
}

class SoldOut extends Error {}

async function markFailed(kind: "license" | "sale", id: string) {
  const db = await getDb();
  const table = kind === "license" ? schema.licenses : schema.sales;
  await db.update(table).set({ status: "failed" }).where(eq(table.id, id));
}

// --- Payouts ------------------------------------------------------------------------

export const PAYOUT_MINIMUM_CENTS = 100;

function isoWeek(date: Date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}w${String(week).padStart(2, "0")}`;
}

/** Pay every designer and maker whose pending balance reaches the minimum, in one PayPal Payouts batch. */
export async function runPayouts() {
  const db = await getDb();
  const pending = await db.select().from(schema.credits).where(and(eq(schema.credits.status, "pending"), inArray(schema.credits.payeeKind, ["designer", "maker"])));

  const balances = new Map<string, { kind: "designer" | "maker"; payeeId: string; cents: number; creditIds: string[] }>();
  for (const c of pending) {
    const key = `${c.payeeKind}:${c.payeeId}`;
    const entry = balances.get(key) ?? { kind: c.payeeKind as "designer" | "maker", payeeId: c.payeeId, cents: 0, creditIds: [] };
    entry.cents += c.amountCents;
    entry.creditIds.push(c.id);
    balances.set(key, entry);
  }
  const owed = [...balances.values()].filter((b) => b.cents >= PAYOUT_MINIMUM_CENTS);
  if (owed.length === 0) return { batch: null, skipped: balances.size };

  const [designers, makers] = await Promise.all([
    db.select().from(schema.designers).where(inArray(schema.designers.id, owed.filter((d) => d.kind === "designer").map((d) => d.payeeId).concat(["-"]))),
    db.select().from(schema.makers).where(inArray(schema.makers.id, owed.filter((d) => d.kind === "maker").map((d) => d.payeeId).concat(["-"]))),
  ]);
  const payee = (b: (typeof owed)[number]) =>
    b.kind === "designer" ? designers.find((d) => d.id === b.payeeId) : makers.find((m) => m.id === b.payeeId);
  // A payee whose record is missing keeps their credits pending instead of blocking everyone else.
  const due = owed.filter((b) => payee(b));
  if (due.length === 0) return { batch: null, skipped: balances.size };

  const batchId = newId("pb");
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.payoutBatches);
  // PayPal refuses a sender_batch_id it has seen before, even from a database that was since reset,
  // so the readable week and sequence get a random suffix. Our own reservation stops double payouts.
  const senderBatchId = `lin-${isoWeek(new Date())}-${String(Number(count) + 1).padStart(3, "0")}-${nanoid(6)}`;
  const items = due.map((b) => {
    const p = payee(b)!;
    return {
      id: newId("pi"),
      batchId,
      payeeKind: b.kind,
      payeeId: b.payeeId,
      receiver: p.paypalEmail,
      amountCents: b.cents,
      senderItemId: `${senderBatchId}-${b.payeeId}`,
      status: "QUEUED",
      creditIds: b.creditIds,
      note: b.kind === "designer" ? `Lineage royalties for ${p.name}: makers licensed your patterns.` : `Lineage sales for ${p.name}, after designer royalties.`,
    };
  });
  const total = items.reduce((t, i) => t + i.amountCents, 0);

  // Reserve the credits first so a second run can't include them, then call PayPal.
  await db.transaction(async (tx) => {
    await tx.insert(schema.payoutBatches).values({ id: batchId, senderBatchId, status: "QUEUED", totalCents: total });
    await tx.insert(schema.payoutItems).values(items.map(({ creditIds: _c, note: _n, ...row }) => row));
    for (const item of items) {
      const reserved = await tx
        .update(schema.credits)
        .set({ status: "in_batch", payoutItemId: item.id })
        .where(and(inArray(schema.credits.id, item.creditIds), eq(schema.credits.status, "pending")))
        .returning({ id: schema.credits.id });
      // Another run got some of these credits first: pay nothing from this run.
      if (reserved.length !== item.creditIds.length) throw new UserError("Another payout run is in progress. Try again in a moment.");
    }
  });

  let result: Awaited<ReturnType<typeof paypal.createPayoutBatch>>;
  try {
    result = await paypal.createPayoutBatch(senderBatchId, items.map((i) => ({ receiver: i.receiver, amountCents: i.amountCents, note: i.note, senderItemId: i.senderItemId })));
  } catch (error) {
    if (error instanceof paypal.PayPalError && error.status >= 400 && error.status < 500) {
      // PayPal refused the batch, so nothing was paid: release the credits for the next run.
      await db.update(schema.credits).set({ status: "pending", payoutItemId: null }).where(inArray(schema.credits.payoutItemId, items.map((i) => i.id)));
      await db.update(schema.payoutBatches).set({ status: "FAILED" }).where(eq(schema.payoutBatches.id, batchId));
    } else {
      // A timeout or 5xx may still have been paid. Keep the credits reserved so nobody is paid twice.
      await db.update(schema.payoutBatches).set({ status: "UNCONFIRMED" }).where(eq(schema.payoutBatches.id, batchId));
    }
    throw error;
  }
  await db.update(schema.payoutBatches).set({ paypalBatchId: result.batch_header.payout_batch_id, status: result.batch_header.batch_status }).where(eq(schema.payoutBatches.id, batchId));
  await refreshPayoutBatch(batchId).catch((error: unknown) => console.error("[payouts] status refresh failed; it will be retried", error));
  return { batch: { id: batchId, senderBatchId, totalCents: total, items: items.length }, skipped: balances.size - due.length };
}

const ITEM_STATUS_TO_CREDIT: Record<string, "paid" | "unclaimed" | "pending" | null> = {
  SUCCESS: "paid",
  UNCLAIMED: "unclaimed",
  FAILED: "pending",
  RETURNED: "pending",
  BLOCKED: "pending",
  REFUNDED: "pending",
  REVERSED: "pending",
};

/** Pull item statuses from PayPal (also driven by PAYMENT.PAYOUTS-ITEM.* webhooks). */
export async function refreshPayoutBatch(batchId: string) {
  const db = await getDb();
  const batch = await db.query.payoutBatches.findFirst({ where: eq(schema.payoutBatches.id, batchId) });
  if (!batch?.paypalBatchId) return;
  const result = await paypal.getPayoutBatch(batch.paypalBatchId);
  await db.update(schema.payoutBatches).set({ status: result.batch_header.batch_status }).where(eq(schema.payoutBatches.id, batchId));
  for (const item of result.items ?? []) {
    await applyPayoutItemStatus(item.payout_item.sender_item_id, item.payout_item_id, item.transaction_status);
  }
  // A denied or failed batch pays nobody: release any credits PayPal didn't report on.
  if (["DENIED", "FAILED", "CANCELED"].includes(result.batch_header.batch_status)) {
    const reported = new Set((result.items ?? []).map((i) => i.payout_item.sender_item_id));
    const ours = await db.select().from(schema.payoutItems).where(eq(schema.payoutItems.batchId, batchId));
    for (const item of ours.filter((i) => !reported.has(i.senderItemId))) {
      await db.update(schema.payoutItems).set({ status: result.batch_header.batch_status }).where(eq(schema.payoutItems.id, item.id));
      await db.update(schema.credits).set({ status: "pending", payoutItemId: null }).where(eq(schema.credits.payoutItemId, item.id));
    }
  }
}

export async function applyPayoutItemStatus(senderItemId: string, paypalItemId: string, status: string) {
  const db = await getDb();
  const [row] = await db.update(schema.payoutItems).set({ paypalItemId, status }).where(eq(schema.payoutItems.senderItemId, senderItemId)).returning();
  if (!row) return;
  const next = ITEM_STATUS_TO_CREDIT[status];
  if (next === "pending") {
    await db.update(schema.credits).set({ status: "pending", payoutItemId: null }).where(eq(schema.credits.payoutItemId, row.id));
  } else if (next) {
    await db.update(schema.credits).set({ status: next }).where(eq(schema.credits.payoutItemId, row.id));
  }
}

// --- License offers paid by invoice -------------------------------------------------

export async function markOfferPaid(invoiceId: string) {
  const db = await getDb();
  const offer = await db.query.offers.findFirst({ where: eq(schema.offers.invoiceId, invoiceId) });
  if (!offer || offer.status === "paid") return false;
  const credits = splitRoyalty(offer.amountCents, toLinks(await getChain(offer.patternId)), env.platformFeeBp);
  return db.transaction(async (tx) => {
    const flipped = await tx.update(schema.offers).set({ status: "paid" }).where(and(eq(schema.offers.id, offer.id), eq(schema.offers.status, "sent"))).returning();
    if (flipped.length === 0) return false;
    await tx.insert(schema.credits).values(
      credits.map((c) => ({ id: newId("cr"), sourceKind: "license" as const, sourceId: offer.id, payeeKind: c.payeeKind, payeeId: c.payeeId, patternId: c.patternId, amountCents: c.amountCents, status: c.payeeKind === "platform" ? ("kept" as const) : ("pending" as const) })),
    );
    return true;
  });
}

/** Ask PayPal about every unpaid invoice offer, for setups where webhooks can't reach the app. */
export async function refreshOffers() {
  const db = await getDb();
  const sent = await db.select().from(schema.offers).where(eq(schema.offers.status, "sent"));
  let paid = 0;
  for (const offer of sent) {
    if (!offer.invoiceId) continue;
    const status = await paypal.getInvoiceStatus(offer.invoiceId).catch(() => "UNKNOWN");
    if (status === "PAID" && (await markOfferPaid(offer.invoiceId))) paid++;
  }
  return paid;
}

/** Compare our captured payments with PayPal's own records (Transaction Search). */
export async function reconcile() {
  const db = await getDb();
  const [licenses, sales, transactions] = await Promise.all([
    db.select({ id: schema.licenses.id, captureId: schema.licenses.captureId, cents: schema.licenses.amountCents }).from(schema.licenses).where(eq(schema.licenses.status, "captured")),
    db.select({ id: schema.sales.id, captureId: schema.sales.captureId, cents: schema.sales.amountCents }).from(schema.sales).where(eq(schema.sales.status, "captured")),
    paypal.searchTransactions(30),
  ]);
  const seen = new Map(transactions.map((t) => [t.transaction_info.transaction_id, t.transaction_info]));
  const ours = [...licenses, ...sales];
  const matched = ours.filter((r) => r.captureId && seen.has(r.captureId));
  const mismatched = matched.filter((r) => fromPayPalValue(seen.get(r.captureId!)!.transaction_amount.value.replace(/^-/, "")) !== r.cents);
  return {
    live: mode.paypal,
    captures: ours.length,
    matched: matched.length,
    // Transaction Search can lag PayPal by up to three hours, so "not listed yet" is not an error.
    notListedYet: ours.length - matched.length,
    amountMismatches: mismatched.map((r) => r.id),
  };
}
