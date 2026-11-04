import { NextResponse } from "next/server";
import { z } from "zod";
import { readLicense } from "@/lib/ai/license";
import { route } from "@/lib/http";
import { checkAiBudget } from "@/lib/rate-limit";

export const runtime = "nodejs";

export const POST = route(async (req: Request) => {
  checkAiBudget(req);
  const { text } = z.object({ text: z.string().max(8000) }).parse(await req.json());
  return NextResponse.json(await readLicense(text));
});
