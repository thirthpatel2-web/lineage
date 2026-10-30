import { NextResponse } from "next/server";
import { route } from "@/lib/http";
import { getChain } from "@/lib/lineage";
import { firstImageIds } from "@/lib/queries";

export const runtime = "nodejs";

// A pattern's lineage, nearest first, for the maker app when they pick a different candidate.
export const GET = route(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const chain = await getChain(id);
  const images = await firstImageIds(chain.map((p) => p.id));
  return NextResponse.json({
    lineage: chain.map((p) => ({
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
      imageId: images.get(p.id) ?? null,
    })),
  });
});
