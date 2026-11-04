import { NextResponse } from "next/server";
import { z } from "zod";
import { route } from "@/lib/http";
import { checkAiBudget } from "@/lib/rate-limit";
import { runShopper } from "@/lib/agents/shopper";

export const runtime = "nodejs";
export const maxDuration = 300;

export const POST = route(async (req: Request) => {
  checkAiBudget(req);
  const { prompt } = z.object({ prompt: z.string().trim().min(3).max(600) }).parse(await req.json());
  return NextResponse.json(await runShopper(prompt));
});
