import { NextResponse } from "next/server";
import { route } from "@/lib/http";
import { reconcile } from "@/lib/commerce";

export const runtime = "nodejs";

export const POST = route(async () => NextResponse.json(await reconcile()));
