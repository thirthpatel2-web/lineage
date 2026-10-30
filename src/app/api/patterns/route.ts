import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { route } from "@/lib/http";
import { storeImage } from "@/lib/images";
import { wouldCycle } from "@/lib/lineage";

export const runtime = "nodejs";
export const maxDuration = 120;

const Fields = z.object({
  designerName: z.string().trim().min(2).max(80),
  paypalEmail: z.string().trim().email(),
  consent: z.literal("on", { message: "Please confirm you designed this pattern and agree to receive royalties." }),
  title: z.string().trim().min(2).max(80),
  description: z.string().trim().max(600).optional(),
  licenseText: z.string().trim().max(6000).optional(),
  salesAllowed: z.enum(["true", "false"]),
  creditRequired: z.enum(["true", "false"]),
  ratePercent: z.coerce.number().min(0).max(50),
  minDollars: z.coerce.number().min(0).max(50).default(1),
  batchLimit: z.coerce.number().int().positive().optional().or(z.literal("").transform(() => undefined)),
  parentId: z.string().optional().or(z.literal("").transform(() => undefined)),
  parentSharePercent: z.coerce.number().min(0).max(100).default(0),
});

// Register a designer (or reuse one by PayPal email) and a pattern with its reference photos.
export const POST = route(async (req: Request) => {
  const form = await req.formData();
  const fields = Fields.parse(Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string")));
  const photos = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  if (photos.length === 0) return NextResponse.json({ error: "Add at least one photo of a finished item made from the pattern." }, { status: 400 });
  if (photos.length > 6) return NextResponse.json({ error: "Up to 6 photos, please." }, { status: 400 });

  const db = await getDb();
  let designer = await db.query.designers.findFirst({ where: eq(schema.designers.paypalEmail, fields.paypalEmail.toLowerCase()) });
  if (!designer) {
    const handleBase = fields.designerName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "designer";
    [designer] = await db
      .insert(schema.designers)
      .values({ id: `des_${nanoid(10)}`, name: fields.designerName, handle: `${handleBase}-${nanoid(4).toLowerCase()}`, paypalEmail: fields.paypalEmail.toLowerCase(), consentAt: new Date() })
      .returning();
  }

  const id = `pat_${nanoid(10)}`;
  if (fields.parentId) {
    const parent = await db.query.patterns.findFirst({ where: eq(schema.patterns.id, fields.parentId) });
    if (!parent) return NextResponse.json({ error: "The pattern you remixed was not found." }, { status: 400 });
    if (await wouldCycle(id, fields.parentId)) return NextResponse.json({ error: "That would create a loop in the lineage." }, { status: 400 });
  }

  await db.insert(schema.patterns).values({
    id,
    designerId: designer.id,
    title: fields.title,
    description: fields.description ?? null,
    licenseText: fields.licenseText ?? null,
    salesAllowed: fields.salesAllowed === "true",
    creditRequired: fields.creditRequired === "true",
    rateBp: Math.round(fields.ratePercent * 100),
    minCents: Math.round(fields.minDollars * 100),
    batchLimit: fields.batchLimit ?? null,
    parentId: fields.parentId ?? null,
    parentShareBp: fields.parentId ? Math.round(fields.parentSharePercent * 100) : 0,
  });
  for (const photo of photos) await storeImage(Buffer.from(await photo.arrayBuffer()), "pattern", id);
  return NextResponse.json({ id, designerId: designer.id });
});
