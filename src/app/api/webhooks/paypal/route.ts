import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { applyPayoutItemStatus, completeOrder, markOfferPaid } from "@/lib/commerce";
import { getInvoiceStatus, verifyWebhook } from "@/lib/paypal";

export const runtime = "nodejs";

type Event = {
  id: string;
  event_type: string;
  resource: {
    id?: string;
    status?: string;
    transaction_status?: string;
    payout_item_id?: string;
    payout_item?: { sender_item_id?: string };
    supplementary_data?: { related_ids?: { order_id?: string } };
    invoice?: { id?: string };
  };
};

// PayPal webhooks. An event is recorded only after its signature verifies and it has been handled,
// so a failure returns 500 and PayPal's retry gets a fresh chance. Handlers are idempotent.
export async function POST(req: Request) {
  let event: Event;
  try {
    event = (await req.json()) as Event;
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  if (!event?.id || !event.event_type || !event.resource) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  let verified: boolean;
  try {
    verified = await verifyWebhook(req.headers, event);
  } catch (error) {
    console.error("[webhook] verification call failed", error);
    return NextResponse.json({ error: "Try again" }, { status: 503 });
  }
  if (!verified) return NextResponse.json({ error: "Signature not verified" }, { status: 400 });

  const db = await getDb();
  const seen = await db.query.webhookEvents.findFirst({ where: eq(schema.webhookEvents.id, event.id) });
  if (seen) return NextResponse.json({ ok: true, duplicate: true });

  try {
    const r = event.resource;
    switch (event.event_type) {
      case "CHECKOUT.ORDER.APPROVED":
        if (r.id) await completeOrder(r.id);
        break;
      case "PAYMENT.CAPTURE.COMPLETED": {
        const orderId = r.supplementary_data?.related_ids?.order_id;
        if (orderId) await completeOrder(orderId);
        break;
      }
      case "INVOICING.INVOICE.PAID": {
        // This event also fires for partial and pending payments, so confirm the invoice is fully paid.
        const invoiceId = r.invoice?.id ?? r.id;
        if (invoiceId && (await getInvoiceStatus(invoiceId)) === "PAID") await markOfferPaid(invoiceId);
        break;
      }
      default:
        if (event.event_type.startsWith("PAYMENT.PAYOUTS-ITEM.") && r.payout_item?.sender_item_id && r.payout_item_id && r.transaction_status) {
          await applyPayoutItemStatus(r.payout_item.sender_item_id, r.payout_item_id, r.transaction_status);
        }
    }
  } catch (error) {
    console.error("[webhook]", event.event_type, error);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }
  await db.insert(schema.webhookEvents).values({ id: event.id, type: event.event_type, payload: event, verified: true }).onConflictDoNothing();
  return NextResponse.json({ ok: true });
}
