import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { env } from "@/lib/env";
import { getChain } from "@/lib/lineage";
import { formatCents } from "@/lib/money";
import { firstImageIds } from "@/lib/queries";
import { LineageTree } from "@/components/lineage-tree";
import { Qr } from "@/components/qr";
import { RefreshButton } from "./refresh";

export const metadata: Metadata = { title: "License" };

export default async function LicensePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; cancelled?: string }> }) {
  await connection();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const db = await getDb();
  const license = await db.query.licenses.findFirst({ where: eq(schema.licenses.id, id) });
  if (!license) notFound();
  const [chain, maker, credits] = await Promise.all([
    getChain(license.patternId),
    db.query.makers.findFirst({ where: eq(schema.makers.id, license.makerId) }),
    db.select().from(schema.credits).where(and(eq(schema.credits.sourceKind, "license"), eq(schema.credits.sourceId, id))),
  ]);
  const images = await firstImageIds(chain.map((p) => p.id));
  const paid = license.status === "captured";
  const tags = Array.from({ length: Math.min(license.units, 24) }, (_, i) => `${env.appUrl}/t/${license.id}-${i + 1}`);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="no-print">
        {sp.error && <div className="mb-4 rounded-xl bg-accent-soft p-4 text-accent">Payment problem: {sp.error}</div>}
        {sp.cancelled && <div className="mb-4 rounded-xl bg-warn-soft p-4 text-warn">You cancelled at PayPal. Nothing was charged.</div>}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className={`pill ${paid ? "pill-good" : license.status === "failed" ? "pill-bad" : "pill-warn"}`}>{paid ? "Paid · licensed" : license.status === "created" ? "Awaiting payment" : license.status}</span>
        <span className="pill pill-plain">{license.source === "agent" ? "Prepared by an AI agent" : "Licensed by the maker"}</span>
      </div>
      <h1 className="mt-3 text-5xl font-extrabold">
        {license.units} × {chain[0].title}
      </h1>
      <p className="mt-2 text-muted">
        {maker?.name} ({maker?.shopName}) may sell {license.units} finished items made from &ldquo;{chain[0].title}&rdquo;
        {chain[0].creditRequired ? `, credited to ${chain.map((p) => p.designer.name).join(" and ")}` : ""}.
      </p>

      <div className="mt-8 grid gap-6 md:grid-cols-[1fr_1fr]">
        <div className="card p-6">
          <h2 className="text-xl font-bold">Receipt</h2>
          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-muted">Total</dt>
            <dd className="font-display text-2xl font-extrabold tabular-nums">{formatCents(license.amountCents)}</dd>
            <dt className="text-muted">Rate</dt>
            <dd>{license.rateBp / 100}% of {formatCents(license.itemPriceCents)} per item</dd>
            <dt className="text-muted">PayPal order</dt>
            <dd className="font-mono break-all">{license.paypalOrderId ?? "-"}</dd>
            <dt className="text-muted">PayPal capture</dt>
            <dd className="font-mono break-all">{license.captureId ?? "-"}</dd>
          </dl>
          <h3 className="mt-6 font-bold">Who gets paid</h3>
          {credits.length === 0 ? (
            <p className="mt-2 text-sm text-muted">Royalties are recorded once PayPal confirms the payment.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1.5 text-sm">
              {credits.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3">
                  <span>{c.payeeKind === "platform" ? "Lineage fee" : chain.find((p) => p.designerId === c.payeeId)?.designer.name}</span>
                  <span className="flex items-center gap-2">
                    <span className={`pill ${c.status === "paid" ? "pill-good" : "pill-plain"}`}>{c.payeeKind === "platform" ? "kept" : c.status === "pending" ? "next payout" : c.status.replace("_", " ")}</span>
                    <span className="font-mono tabular-nums">{formatCents(c.amountCents)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {license.status === "created" && license.paypalOrderId && <RefreshButton orderId={license.paypalOrderId} />}
        </div>
        <div className="card p-6">
          <h2 className="mb-4 text-xl font-bold">Lineage</h2>
          <LineageTree chain={chain.map((p) => ({ id: p.id, title: p.title, designer: p.designer.name, parentShareBp: p.parentShareBp, imageId: images.get(p.id) }))} item={{ label: `${maker?.shopName}`, sub: `${license.units} licensed items` }} />
        </div>
      </div>

      {paid && (
        <section className="mt-10">
          <div className="no-print flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-3xl font-extrabold">Provenance tags</h2>
              <p className="text-muted">Print these and attach one to each item. Buyers scan to see who designed it.</p>
            </div>
            <Link href={`/licenses/${license.id}/print`} className="btn">Print tags</Link>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {tags.map((url, i) => (
              <div key={url} className="card flex flex-col items-center gap-1 p-3 text-center">
                <Qr url={url} size={96} />
                <div className="font-display text-sm font-bold">{chain[0].title}</div>
                <div className="text-[0.7rem] text-muted">Licensed · #{i + 1}</div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
