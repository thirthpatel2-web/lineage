import { NextResponse } from "next/server";
import { z } from "zod";
import { route } from "@/lib/http";
import { checkPaymentRate } from "@/lib/rate-limit";
import { startSaleCheckout } from "@/lib/commerce";

export const runtime = "nodejs";

export const POST = route(async (req: Request) => {
  checkPaymentRate(req);
  const { listingId, note } = z.object({ listingId: z.string(), note: z.string().max(500).optional() }).parse(await req.json());
  return NextResponse.json(await startSaleCheckout({ listingId, source: "web", note }));
});
