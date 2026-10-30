import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getChain } from "@/lib/lineage";

export const runtime = "nodejs";

// lineage.json 1.0: a machine-readable finished-item license, so any agent can read the rules.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const chain = await getChain(id).catch(() => null);
  if (!chain) return NextResponse.json({ error: "Pattern not found" }, { status: 404 });
  const [p, parent] = chain;
  return NextResponse.json(
    {
      lineage: "1.0",
      pattern: { id: p.id, title: p.title, designer: p.designer.name, craft: p.craft, url: `${env.appUrl}/patterns/${p.id}` },
      parents: parent ? [{ id: parent.id, title: parent.title, designer: parent.designer.name, share_bp: p.parentShareBp }] : [],
      ancestry: chain.slice(1).map((a) => ({ id: a.id, title: a.title, designer: a.designer.name })),
      finished_items: {
        sales_allowed: p.salesAllowed,
        credit_required: p.creditRequired,
        batch_limit: p.batchLimit,
        license: p.salesAllowed ? { type: "per_item", rate_bp: p.rateBp, min_cents: p.minCents, currency: "USD" } : null,
        terms: p.licenseText,
      },
      payment: { processor: "paypal", license_endpoint: `${env.appUrl}/mcp`, tool: "buy_license" },
      mcp: `${env.appUrl}/mcp`,
    },
    { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=300" } },
  );
}
