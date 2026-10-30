import { NextResponse } from "next/server";
import { z } from "zod";
import { route } from "@/lib/http";
import { draftOffer } from "@/lib/agents/watch";

export const runtime = "nodejs";
export const maxDuration = 120;

const Fields = z.object({
  patternId: z.string(),
  listingUrl: z.string().url().optional().or(z.literal("").transform(() => undefined)),
  sellerName: z.string().trim().min(2).max(80),
  sellerEmail: z.string().trim().email(),
  units: z.coerce.number().int().min(1).max(500),
  itemPrice: z.coerce.number().min(1).max(10000),
  sample: z.string().optional(),
});

export const POST = route(async (req: Request) => {
  const form = await req.formData();
  const fields = Fields.parse(Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string")));
  const file = form.get("photo");
  let photo: Buffer;
  if (file instanceof File && file.size > 0) photo = Buffer.from(await file.arrayBuffer());
  else if (fields.sample && /^\/api\/demo-art\/[\w-]+\/\d+$/.test(fields.sample)) {
    const [, , , design, seed] = fields.sample.split("/");
    const { renderJpeg } = await import("@/lib/demo-art");
    photo = await renderJpeg(design as Parameters<typeof renderJpeg>[0], Number(seed));
  } else return NextResponse.json({ error: "Add a photo from the listing." }, { status: 400 });

  const result = await draftOffer({ ...fields, photo, itemPriceCents: Math.round(fields.itemPrice * 100) });
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
});
