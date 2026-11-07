import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getChain } from "@/lib/lineage";
import { firstImageIds } from "@/lib/queries";
import { LineageTree } from "@/components/lineage-tree";

export const metadata: Metadata = { title: "Who made this?" };

// What a buyer sees after scanning the QR tag on a licensed item.
export default async function TagPage({ params }: { params: Promise<{ code: string }> }) {
  await connection();
  const { code } = await params;
  const match = code.match(/^(lic_[\w-]+)-(\d+)$/);
  if (!match) notFound();
  const db = await getDb();
  const license = await db.query.licenses.findFirst({ where: eq(schema.licenses.id, match[1]) });
  const unit = Number(match[2]);
  if (!license || unit < 1 || unit > license.units) notFound();
  const [chain, maker] = await Promise.all([getChain(license.patternId), db.query.makers.findFirst({ where: eq(schema.makers.id, license.makerId) })]);
  const images = await firstImageIds(chain.map((p) => p.id));
  const valid = license.status === "captured";

  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <span className={`pill ${valid ? "pill-good" : "pill-bad"}`}>{valid ? "Genuine licensed item" : "License not paid"}</span>
      <h1 className="mt-4 text-5xl font-extrabold">{chain[0].title}</h1>
      <p className="mt-3 text-lg text-muted">
        Handmade by <strong className="text-ink">{maker?.name}</strong> of {maker?.shopName}, item {unit} of {license.units}.{" "}
        {chain.length > 1
          ? `The pattern is ${chain[0].designer.name}'s remix of ${chain.at(-1)!.designer.name}'s "${chain.at(-1)!.title}". Both designers were paid.`
          : `${chain[0].designer.name} designed the pattern and was paid a royalty.`}
      </p>
      <div className="mt-8">
        <LineageTree chain={chain.map((p) => ({ id: p.id, title: p.title, designer: p.designer.name, parentShareBp: p.parentShareBp, imageId: images.get(p.id) }))} item={{ label: `This item, by ${maker?.name}`, sub: "Verified by Lineage" }} />
      </div>
      <p className="mt-8 text-sm text-muted">Lineage pays pattern designers whenever their work is sold, instead of filing takedowns.</p>
    </div>
  );
}
