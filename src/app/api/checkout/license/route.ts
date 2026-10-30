import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { route } from "@/lib/http";
import { startLicenseCheckout } from "@/lib/commerce";

export const runtime = "nodejs";

const Body = z.object({
  patternId: z.string(),
  matchId: z.string().optional(),
  units: z.number().int().min(1).max(500),
  itemPriceCents: z.number().int().min(100).max(1_000_000),
  maker: z.union([
    z.object({ id: z.string() }),
    z.object({ name: z.string().trim().min(2).max(80), shopName: z.string().trim().min(2).max(80), paypalEmail: z.string().trim().email() }),
  ]),
});

export const POST = route(async (req: Request) => {
  const body = Body.parse(await req.json());
  const db = await getDb();
  let makerId: string;
  if ("id" in body.maker) makerId = body.maker.id;
  else {
    const email = body.maker.paypalEmail.toLowerCase();
    const existing = await db.query.makers.findFirst({ where: eq(schema.makers.paypalEmail, email) });
    makerId = existing?.id ?? `mkr_${nanoid(10)}`;
    if (!existing) await db.insert(schema.makers).values({ id: makerId, name: body.maker.name, shopName: body.maker.shopName, paypalEmail: email });
  }
  const checkout = await startLicenseCheckout({ patternId: body.patternId, makerId, units: body.units, itemPriceCents: body.itemPriceCents, matchId: body.matchId, source: "maker" });
  if (body.matchId) await db.update(schema.matches).set({ confirmedPatternId: body.patternId, makerId }).where(eq(schema.matches.id, body.matchId));
  return NextResponse.json(checkout);
});
