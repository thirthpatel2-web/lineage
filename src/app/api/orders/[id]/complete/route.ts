import { NextResponse } from "next/server";
import { route } from "@/lib/http";
import { completeOrder } from "@/lib/commerce";

export const runtime = "nodejs";

export const POST = route(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  return NextResponse.json(await completeOrder(id));
});
