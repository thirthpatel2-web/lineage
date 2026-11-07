import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { getDb, schema } from "@/lib/db";
import { route } from "@/lib/http";
import { checkAiBudget } from "@/lib/rate-limit";
import { readUpload, storeImage } from "@/lib/images";
import { runLens } from "@/lib/ai/lens";
import { getChain } from "@/lib/lineage";
import { firstImageIds } from "@/lib/queries";

export const runtime = "nodejs";
export const maxDuration = 120;

// A maker's photo in, the matched pattern and its lineage out.
export const POST = route(async (req: Request) => {
  checkAiBudget(req);
  const form = await req.formData();
  const file = form.get("photo");
  const sample = form.get("sample");
  let bytes: Buffer;
  if (file instanceof File && file.size > 0) bytes = await readUpload(file);
  else if (typeof sample === "string" && /^\/api\/demo-art\/[\w-]+\/\d+$/.test(sample)) {
    const [, , , design, seed] = sample.split("/");
    const { renderJpeg } = await import("@/lib/demo-art");
    bytes = await renderJpeg(design as Parameters<typeof renderJpeg>[0], Number(seed));
  } else return NextResponse.json({ error: "Add a photo of the finished item." }, { status: 400 });

  const image = await storeImage(bytes, "match");
  const result = await runLens(image);
  const id = `mat_${nanoid(10)}`;
  const top = result.candidates[0];
  const db = await getDb();
  await db.insert(schema.matches).values({
    id,
    imageId: image.id,
    band: result.band,
    topPatternId: top?.patternId ?? null,
    candidates: result.candidates,
    traditionalReason: result.traditionalReason,
    verifiedBy: result.verifiedBy,
  });

  const lineage = top && (result.band === "strong" || result.band === "possible") ? await getChain(top.patternId) : [];
  const thumbs = await firstImageIds(lineage.map((p) => p.id));
  return NextResponse.json({
    id,
    imageId: image.id,
    ...result,
    lineage: lineage.map((p) => ({
      id: p.id,
      title: p.title,
      designer: p.designer.name,
      parentShareBp: p.parentShareBp,
      rateBp: p.rateBp,
      minCents: p.minCents,
      salesAllowed: p.salesAllowed,
      creditRequired: p.creditRequired,
      batchLimit: p.batchLimit,
      licenseText: p.licenseText,
      imageId: thumbs.get(p.id) ?? null,
    })),
  });
});
