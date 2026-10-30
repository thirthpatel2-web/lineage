import { and, desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

export async function stats() {
  const db = await getDb();
  const [[patterns], [licenses], [royalties], [paid]] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(schema.patterns),
    db.select({ n: sql<number>`count(*)::int`, units: sql<number>`coalesce(sum(${schema.licenses.units}),0)::int` }).from(schema.licenses).where(eq(schema.licenses.status, "captured")),
    db.select({ cents: sql<number>`coalesce(sum(${schema.credits.amountCents}),0)::int` }).from(schema.credits).where(eq(schema.credits.payeeKind, "designer")),
    db.select({ cents: sql<number>`coalesce(sum(${schema.credits.amountCents}),0)::int` }).from(schema.credits).where(and(eq(schema.credits.payeeKind, "designer"), eq(schema.credits.status, "paid"))),
  ]);
  return { patterns: patterns.n, licenses: licenses.n, units: licenses.units, royaltiesCents: royalties.cents, paidCents: paid.cents };
}

/** Every pattern with its designer and first reference photo. */
export async function listPatterns() {
  const db = await getDb();
  const rows = await db
    .select({
      pattern: schema.patterns,
      designer: schema.designers,
      imageId: sql<string | null>`(select id from images where images.pattern_id = ${schema.patterns.id} and images.kind = 'pattern' order by created_at limit 1)`,
    })
    .from(schema.patterns)
    .innerJoin(schema.designers, eq(schema.designers.id, schema.patterns.designerId))
    .orderBy(desc(schema.patterns.createdAt));
  return rows;
}

export async function firstImageIds(patternIds: string[]) {
  if (patternIds.length === 0) return new Map<string, string>();
  const db = await getDb();
  const rows = await db.execute<{ pattern_id: string; id: string }>(
    sql`select distinct on (pattern_id) pattern_id, id from images where kind = 'pattern' and pattern_id in ${patternIds} order by pattern_id, created_at`,
  );
  const list = (Array.isArray(rows) ? rows : (rows as { rows: { pattern_id: string; id: string }[] }).rows) as { pattern_id: string; id: string }[];
  return new Map(list.map((r) => [r.pattern_id, r.id]));
}
