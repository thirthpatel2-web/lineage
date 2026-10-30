import { NextResponse } from "next/server";
import { route } from "@/lib/http";
import { runPayouts } from "@/lib/commerce";

export const runtime = "nodejs";

export const POST = route(async () => NextResponse.json(await runPayouts()));
