import { NextResponse } from "next/server";
import { completeOrder } from "@/lib/commerce";
import { env } from "@/lib/env";

export const runtime = "nodejs";

// PayPal sends the payer back here after they approve: capture, record, show the receipt.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const orderId = url.searchParams.get("token");
  const ref = /^(lic|sale)_[\w-]+$/.test(url.searchParams.get("ref") ?? "") ? url.searchParams.get("ref")! : "";
  const receipt = (path: string) => NextResponse.redirect(`${env.appUrl}${path}`, 303);
  const fallback = !ref ? "/" : ref.startsWith("sale_") ? `/orders/${ref}` : `/licenses/${ref}`;
  if (!orderId) return receipt(`${fallback}?error=missing-token`);
  try {
    const result = await completeOrder(orderId);
    return receipt(result.kind === "sale" ? `/orders/${result.id}` : `/licenses/${result.id}`);
  } catch (error) {
    console.error("[paypal return]", error);
    return receipt(`${fallback}?error=capture-failed`);
  }
}
