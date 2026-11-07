import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getChain } from "@/lib/lineage";
import { formatCents } from "@/lib/money";

export const metadata: Metadata = { title: "Order" };

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  await connection();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const db = await getDb();
  const sale = await db.query.sales.findFirst({ where: eq(schema.sales.id, id) });
  if (!sale) notFound();
  const listing = (await db.query.listings.findFirst({ where: eq(schema.listings.id, sale.listingId) }))!;
  const [chain, maker, credits] = await Promise.all([
    getChain(listing.patternId),
    db.query.makers.findFirst({ where: eq(schema.makers.id, listing.makerId) }),
    db.select().from(schema.credits).where(and(eq(schema.credits.sourceKind, "sale"), eq(schema.credits.sourceId, id))),
  ]);
  const paid = sale.status === "captured";
  const who = (c: (typeof credits)[number]) =>
    c.payeeKind === "maker" ? `${maker?.name} (made it)` : c.payeeKind === "platform" ? "Lineage fee" : `${chain.find((p) => p.designerId === c.payeeId)?.designer.name} (designed ${chain.find((p) => p.id === c.patternId)?.title})`;

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      {sp.error && <div className="mb-4 rounded-xl bg-accent-soft p-4 text-accent">We couldn&apos;t confirm the payment with PayPal. If you approved it, use &ldquo;I&apos;ve paid: check PayPal&rdquo; below, or try again.</div>}
      <span className={`pill ${paid ? "pill-good" : "pill-warn"}`}>{paid ? "Paid" : "Awaiting payment"}</span>
      {sale.source === "agent" && <span className="pill pill-plain ml-2">Bought through an AI agent</span>}
      <h1 className="mt-3 text-4xl font-extrabold">{paid ? "Thank you!" : "Almost there"}</h1>
      <p className="mt-2 text-muted">{listing.title} from {maker?.shopName}, {formatCents(sale.amountCents)}.</p>
      <div className="card mt-6 p-6">
        <h2 className="font-bold">Your payment, split</h2>
        {credits.length === 0 ? (
          <p className="mt-2 text-sm text-muted">The split is recorded once PayPal confirms the payment.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-1.5 text-sm">
            {credits.map((c) => <li key={c.id} className="flex justify-between"><span>{who(c)}</span><span className="font-mono tabular-nums">{formatCents(c.amountCents)}</span></li>)}
          </ul>
        )}
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 text-xs text-muted">
          <dt>PayPal order</dt><dd className="font-mono break-all">{sale.paypalOrderId}</dd>
          <dt>Capture</dt><dd className="font-mono break-all">{sale.captureId ?? "-"}</dd>
        </dl>
      </div>
    </div>
  );
}
