import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { env } from "@/lib/env";
import { getChain, toLinks } from "@/lib/lineage";
import { formatCents, splitSale } from "@/lib/money";
import { firstImageIds } from "@/lib/queries";
import { LineageTree } from "@/components/lineage-tree";
import { BuyButton } from "./buy-button";

export const metadata: Metadata = { title: "Item" };

export default async function ListingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ cancelled?: string }> }) {
  await connection();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const db = await getDb();
  const listing = await db.query.listings.findFirst({ where: eq(schema.listings.id, id) });
  if (!listing) notFound();
  const [chain, maker] = await Promise.all([getChain(listing.patternId), db.query.makers.findFirst({ where: eq(schema.makers.id, listing.makerId) })]);
  const thumbs = await firstImageIds(chain.map((c) => c.id));
  const { credits } = splitSale(listing.priceCents, chain[0].rateBp, chain[0].minCents, listing.makerId, toLinks(chain), env.platformFeeBp);
  const name = (payeeKind: string, payeeId: string) =>
    payeeKind === "maker" ? `${maker?.name} (maker)` : payeeKind === "platform" ? "Lineage fee" : `${chain.find((c) => c.designerId === payeeId)?.designer.name} (designer)`;

  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 lg:grid-cols-2">
      <div>{listing.imageId && <img src={`/api/images/${listing.imageId}`} alt={listing.title} className="w-full rounded-2xl object-cover" />}</div>
      <div className="flex flex-col gap-5">
        {sp.cancelled && <div className="rounded-xl bg-warn-soft p-3 text-warn">You cancelled at PayPal. Nothing was charged.</div>}
        <div>
          <div className="eyebrow">{maker?.shopName}</div>
          <h1 className="mt-2 text-4xl font-extrabold">{listing.title}</h1>
          <div className="mt-2 font-display text-3xl font-extrabold tabular-nums">{formatCents(listing.priceCents)}</div>
        </div>
        <div className="card p-5">
          <h2 className="font-bold">Where your {formatCents(listing.priceCents)} goes</h2>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {credits.map((c) => (
              <li key={`${c.payeeKind}${c.payeeId}${c.patternId}`} className="flex justify-between"><span>{name(c.payeeKind, c.payeeId)}</span><span className="font-mono tabular-nums">{formatCents(c.amountCents)}</span></li>
            ))}
          </ul>
        </div>
        <BuyButton listingId={listing.id} disabled={listing.stock < 1} />
        <div className="card p-5">
          <h2 className="mb-3 font-bold">Lineage</h2>
          <LineageTree chain={chain.map((c) => ({ id: c.id, title: c.title, designer: c.designer.name, parentShareBp: c.parentShareBp, imageId: thumbs.get(c.id) }))} item={{ label: listing.title, sub: `made by ${maker?.name}`, imageId: listing.imageId }} />
        </div>
      </div>
    </div>
  );
}
