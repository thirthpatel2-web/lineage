import { NextResponse } from "next/server";
import { route } from "@/lib/http";
import { checkPaymentRate } from "@/lib/rate-limit";
import { reconcile } from "@/lib/commerce";

export const runtime = "nodejs";

export const POST = route(async (req: Request) => {
  checkPaymentRate(req);
  return NextResponse.json(await reconcile());
});
