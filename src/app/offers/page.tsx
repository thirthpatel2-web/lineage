import type { Metadata } from "next";
import { connection } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { mode } from "@/lib/env";
import { formatCents } from "@/lib/money";
import { listPatterns } from "@/lib/queries";
import { OfferForm, SendButton } from "./offer-client";

export const metadata: Metadata = { title: "License offers" };

export default async function OffersPage() {
  await connection();
  const db = await getDb();
  const [patterns, offers] = await Promise.all([
    listPatterns(),
    db.select({ offer: schema.offers, pattern: schema.patterns }).from(schema.offers).innerJoin(schema.patterns, eq(schema.patterns.id, schema.offers.patternId)).orderBy(desc(schema.offers.createdAt)),
  ]);
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="eyebrow">For designers</div>
      <h1 className="mt-3 text-5xl font-extrabold">Offer a license, not a takedown</h1>
      <p className="mt-3 max-w-3xl text-muted">
        Found someone selling your design? Paste the listing and its photo. Lineage confirms it really was made from your pattern (and refuses when it
        isn&apos;t sure), drafts a friendly offer, and once you approve, sends it as a PayPal invoice the seller can pay in one click.
      </p>
      <OfferForm patterns={patterns.filter((p) => p.pattern.salesAllowed).map((p) => ({ id: p.pattern.id, title: p.pattern.title, designer: p.designer.name }))} aiOn={mode.ai} />

      {offers.length > 0 && (
        <section className="mt-12">
          <h2 className="text-2xl font-extrabold">Your offers</h2>
          <ul className="mt-4 grid gap-4 md:grid-cols-2">
            {offers.map(({ offer, pattern }) => (
              <li key={offer.id} className="card flex flex-col gap-3 p-5">
                <div className="flex items-center gap-3">
                  {offer.imageId && <img src={`/api/images/${offer.imageId}`} alt="" className="size-14 rounded-lg object-cover" />}
                  <div className="min-w-0 flex-1">
                    <div className="font-bold">{offer.sellerName} · {pattern.title}</div>
                    <div className="text-sm text-muted">{offer.units} items · {formatCents(offer.amountCents)} · match {offer.matchScore?.toFixed(2)}</div>
                  </div>
                  <span className={`pill ${offer.status === "paid" ? "pill-good" : offer.status === "sent" ? "pill-plain" : "pill-warn"}`}>{offer.status === "draft" ? "awaiting your approval" : offer.status}</span>
                </div>
                <p className="whitespace-pre-wrap rounded-xl bg-sunk p-3 text-sm">{offer.message}</p>
                {offer.status === "draft" ? <SendButton id={offer.id} /> : offer.invoiceUrl && <a className="text-sm text-accent underline" href={offer.invoiceUrl} target="_blank" rel="noreferrer">View PayPal invoice {offer.invoiceId}</a>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
