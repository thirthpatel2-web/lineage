import { NextResponse } from "next/server";
import { markOfferPaid } from "@/lib/commerce";
import { env, mode } from "@/lib/env";

export const runtime = "nodejs";

// Offline mode only: stands in for PayPal's INVOICING.INVOICE.PAID webhook.
export async function POST(req: Request) {
  if (mode.paypal) return NextResponse.json({ error: "Simulation is off: real PayPal keys are configured." }, { status: 404 });
  const invoiceId = String((await req.formData()).get("invoiceId") ?? "");
  await markOfferPaid(invoiceId);
  return NextResponse.redirect(`${env.appUrl}/sim/invoice/${encodeURIComponent(invoiceId)}`, 303);
}
