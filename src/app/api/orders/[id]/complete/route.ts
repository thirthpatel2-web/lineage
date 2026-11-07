import { NextResponse } from "next/server";
import { route } from "@/lib/http";
import { checkPaymentRate } from "@/lib/rate-limit";
import { completeOrder } from "@/lib/commerce";

export const runtime = "nodejs";

export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  checkPaymentRate(req);
  const { id } = await params;
  return NextResponse.json(await completeOrder(id));
});
