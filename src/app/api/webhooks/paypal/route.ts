import { NextResponse } from "next/server";
import { getDb, schema } from "@/lib/db";
import { applyPayoutItemStatus, completeOrder, markOfferPaid } from "@/lib/commerce";
import { verifyWebhook } from "@/lib/paypal";

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

// PayPal webhooks. Unverified events are stored for inspection but never move money.
export async function POST(req: Request) {
  const event = (await req.json()) as Event;
  const verified = await verifyWebhook(req.headers, event).catch(() => false);
  const db = await getDb();
  const inserted = await db
    .insert(schema.webhookEvents)
    .values({ id: event.id, type: event.event_type, payload: event, verified })
    .onConflictDoNothing()
    .returning();
  if (inserted.length === 0) return NextResponse.json({ ok: true, duplicate: true });
  if (!verified) return NextResponse.json({ ok: true, ignored: "signature not verified" });

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
        const invoiceId = r.invoice?.id ?? r.id;
        if (invoiceId) await markOfferPaid(invoiceId);
        break;
      }
      default:
        if (event.event_type.startsWith("PAYMENT.PAYOUTS-ITEM.") && r.payout_item?.sender_item_id && r.payout_item_id && r.transaction_status) {
          await applyPayoutItemStatus(r.payout_item.sender_item_id, r.payout_item_id, r.transaction_status);
        }
    }
  } catch (error) {
    console.error("[webhook]", event.event_type, error);
  }
  return NextResponse.json({ ok: true });
}
