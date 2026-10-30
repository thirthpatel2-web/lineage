import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { env } from "@/lib/env";
import { getChain, getChildren } from "@/lib/lineage";
import { formatCents } from "@/lib/money";
import { firstImageIds } from "@/lib/queries";
import { LineageTree } from "@/components/lineage-tree";
import { Qr } from "@/components/qr";

export const metadata: Metadata = { title: "Pattern" };

export default async function PatternPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const chain = await getChain(id).catch(() => null);
  if (!chain) notFound();
  const p = chain[0];
  const db = await getDb();
  const [images, children, [licensed], [earned]] = await Promise.all([
    db.select({ id: schema.images.id }).from(schema.images).where(and(eq(schema.images.patternId, id), eq(schema.images.kind, "pattern"))),
    getChildren([id]),
    db.select({ licenses: sql<number>`count(*)::int`, units: sql<number>`coalesce(sum(${schema.licenses.units}),0)::int` }).from(schema.licenses).where(and(eq(schema.licenses.patternId, id), eq(schema.licenses.status, "captured"))),
    db.select({ cents: sql<number>`coalesce(sum(${schema.credits.amountCents}),0)::int` }).from(schema.credits).where(and(eq(schema.credits.patternId, id), eq(schema.credits.payeeKind, "designer"))),
  ]);
  const thumbs = await firstImageIds([...chain.map((c) => c.id), ...children.map((c) => c.patterns.id)]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap gap-2">
        {chain.length > 1 ? <span className="pill pill-bad">Remix</span> : <span className="pill pill-plain">Original pattern</span>}
        <span className="pill pill-plain">{p.craft}</span>
        {p.designer.demo && <span className="pill pill-plain">demo designer</span>}
      </div>
      <h1 className="mt-3 text-5xl font-extrabold">{p.title}</h1>
      <p className="mt-2 text-lg text-muted">by {p.designer.name}{p.designer.bio ? ` · ${p.designer.bio}` : ""}</p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="flex min-w-0 flex-col gap-6">
          <div className="grid grid-cols-3 gap-3">
            {images.map((img) => (
              <img key={img.id} src={`/api/images/${img.id}`} alt={`${p.title} reference photo`} className="aspect-square w-full rounded-xl object-cover" />
            ))}
          </div>
          {p.description && <p className="text-lg">{p.description}</p>}
          <div className="card p-6">
            <h2 className="text-xl font-bold">Finished-item license</h2>
            <blockquote className="mt-3 border-l-4 border-accent pl-4 italic text-muted">&ldquo;{p.licenseText ?? "No terms written."}&rdquo;</blockquote>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <Fact k="Selling" v={p.salesAllowed ? "Allowed" : "Not allowed"} />
              <Fact k="Royalty" v={p.salesAllowed ? `${p.rateBp / 100}%` : "-"} />
              <Fact k="Minimum" v={formatCents(p.minCents)} />
              <Fact k="Credit" v={p.creditRequired ? "Required" : "Optional"} />
            </dl>
            {p.batchLimit && <p className="mt-3 text-sm text-muted">Up to {p.batchLimit} items per maker.</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="card p-5"><div className="text-sm text-muted">Licensed items</div><div className="font-display text-3xl font-extrabold tabular-nums">{licensed.units}</div></div>
            <div className="card p-5"><div className="text-sm text-muted">Royalties from this pattern</div><div className="font-display text-3xl font-extrabold tabular-nums">{formatCents(earned.cents)}</div></div>
          </div>
        </div>

        <aside className="flex min-w-0 flex-col gap-6">
          <div className="card p-6">
            <h2 className="mb-4 text-xl font-bold">Lineage</h2>
            <LineageTree chain={chain.map((c) => ({ id: c.id, title: c.title, designer: c.designer.name, parentShareBp: c.parentShareBp, imageId: thumbs.get(c.id) }))} highlight={p.id} />
            {children.length > 0 && (
              <>
                <h3 className="mt-6 font-bold">Remixed into</h3>
                <ul className="mt-2 flex flex-col gap-2">
                  {children.map(({ patterns: c, designers: d }) => (
                    <li key={c.id}>
                      <Link href={`/patterns/${c.id}`} className="flex items-center gap-3 rounded-xl bg-sunk p-2 hover:bg-accent-soft">
                        {thumbs.get(c.id) && <img src={`/api/images/${thumbs.get(c.id)}`} alt="" className="size-10 rounded-lg object-cover" />}
                        <span><strong>{c.title}</strong> <span className="text-muted">by {d.name} · {c.parentShareBp / 100}% flows here</span></span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
          <div className="card flex items-center gap-4 p-6">
            <Qr url={`${env.appUrl}/patterns/${p.id}/lineage.json`} size={96} label="QR code for this pattern's lineage.json" />
            <div className="text-sm">
              <div className="font-bold">Machine-readable license</div>
              <p className="text-muted">AI agents read the rules from</p>
              <Link href={`/patterns/${p.id}/lineage.json`} className="font-mono text-accent underline">lineage.json</Link>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-xl bg-sunk p-3">
      <dt className="text-muted">{k}</dt>
      <dd className="font-bold">{v}</dd>
    </div>
  );
}
