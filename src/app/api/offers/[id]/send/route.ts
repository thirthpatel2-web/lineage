import { NextResponse } from "next/server";
import { route } from "@/lib/http";
import { checkPaymentRate } from "@/lib/rate-limit";
import { sendOffer } from "@/lib/agents/watch";

export const runtime = "nodejs";

// The designer approved the draft: send it as a PayPal invoice.
export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  checkPaymentRate(req);
  const { id } = await params;
  return NextResponse.json(await sendOffer(id));
});
