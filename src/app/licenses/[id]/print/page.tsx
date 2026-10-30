import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { env } from "@/lib/env";
import { getChain } from "@/lib/lineage";
import { Qr } from "@/components/qr";
import { PrintNow } from "./print-now";

export const metadata: Metadata = { title: "Print tags" };

export default async function PrintTags({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const db = await getDb();
  const license = await db.query.licenses.findFirst({ where: eq(schema.licenses.id, id) });
  if (!license || license.status !== "captured") notFound();
  const chain = await getChain(license.patternId);
  const credit = chain.map((p) => p.designer.name).join(" & ");
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <PrintNow />
      <div className="grid grid-cols-3 gap-4 sm:grid-cols-4">
        {Array.from({ length: license.units }, (_, i) => (
          <div key={i} className="flex break-inside-avoid flex-col items-center gap-1 rounded-xl border border-dashed border-line p-3 text-center">
            <Qr url={`${env.appUrl}/t/${license.id}-${i + 1}`} size={88} />
            <div className="font-display text-sm font-bold">{chain[0].title}</div>
            <div className="text-[0.65rem] leading-tight text-muted">Pattern by {credit}</div>
            <div className="font-mono text-[0.6rem] text-muted">Licensed via Lineage · #{i + 1}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
