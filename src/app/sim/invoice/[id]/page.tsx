import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { mode } from "@/lib/env";
import { formatCents } from "@/lib/money";

export const metadata: Metadata = { title: "Simulated PayPal invoice" };

// Offline mode only: stands in for the PayPal invoice page a seller receives.
export default async function SimInvoice({ params }: { params: Promise<{ id: string }> }) {
  if (mode.paypal) notFound();
  await connection();
  const { id } = await params;
  const db = await getDb();
  const offer = await db.query.offers.findFirst({ where: eq(schema.offers.invoiceId, id) });
  if (!offer) notFound();
  const pattern = await db.query.patterns.findFirst({ where: eq(schema.patterns.id, offer.patternId) });
  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <div className="card overflow-hidden">
        <div className="bg-[#ffc439] px-6 py-4 font-display text-xl font-extrabold text-[#111]">PayPal invoice · simulated</div>
        <div className="flex flex-col gap-4 p-6">
          <p className="rounded-lg bg-warn-soft p-3 text-sm text-warn">No PayPal keys are configured, so this page stands in for PayPal&apos;s invoice page.</p>
          <div className="text-sm text-muted">Invoice {id} · to {offer.sellerName}</div>
          <div className="font-bold">Finished-item license: {pattern?.title}</div>
          <p className="whitespace-pre-wrap rounded-lg bg-sunk p-3 text-sm">{offer.message}</p>
          <div className="font-display text-4xl font-extrabold tabular-nums">{formatCents(offer.amountCents)}</div>
          {offer.status === "paid" ? (
            <p className="pill pill-good self-start">Paid. Royalties are recorded for the designers.</p>
          ) : (
            <form action="/api/sim/invoice" method="post">
              <input type="hidden" name="invoiceId" value={id} />
              <button className="btn btn-paypal w-full text-base">Pay invoice</button>
            </form>
          )}
          <Link href="/console" className="text-center text-sm text-muted underline">See royalties in the console</Link>
        </div>
      </div>
    </div>
  );
}
