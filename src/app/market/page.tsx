import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { formatCents } from "@/lib/money";

export const metadata: Metadata = { title: "Market" };

export default async function MarketPage() {
  await connection();
  const db = await getDb();
  const rows = await db
    .select({ listing: schema.listings, pattern: schema.patterns, designer: schema.designers, maker: schema.makers })
    .from(schema.listings)
    .innerJoin(schema.patterns, eq(schema.patterns.id, schema.listings.patternId))
    .innerJoin(schema.designers, eq(schema.designers.id, schema.patterns.designerId))
    .innerJoin(schema.makers, eq(schema.makers.id, schema.listings.makerId));
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="eyebrow">Lineage Market</div>
      <h1 className="mt-3 text-5xl font-extrabold">Handmade, with credit</h1>
      <p className="mt-2 max-w-2xl text-muted">Every item here pays its pattern&apos;s designers automatically: Lineage Checkout splits the royalty out of each PayPal payment.</p>
      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {rows.map(({ listing, pattern, designer, maker }) => (
          <Link key={listing.id} href={`/market/${listing.id}`} className="card group overflow-hidden transition hover:border-accent">
            {listing.imageId && <img src={`/api/images/${listing.imageId}`} alt="" className="aspect-square w-full object-cover transition group-hover:scale-[1.02]" />}
            <div className="flex flex-col gap-1 p-4">
              <div className="font-display text-lg font-bold">{listing.title}</div>
              <div className="text-sm text-muted">{maker.shopName}</div>
              <div className="text-xs text-muted">Pattern: {pattern.title} by {designer.name}</div>
              <div className="mt-2 flex items-center justify-between">
                <span className="font-display text-xl font-extrabold tabular-nums">{formatCents(listing.priceCents)}</span>
                {listing.stock > 0 ? <span className="pill pill-good">{listing.stock} left</span> : <span className="pill pill-plain">Sold out</span>}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
