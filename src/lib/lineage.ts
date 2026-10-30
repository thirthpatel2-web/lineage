import { eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { ChainLink } from "@/lib/money";

export type Pattern = typeof schema.patterns.$inferSelect;
export type ChainNode = Pattern & { designer: typeof schema.designers.$inferSelect };

const MAX_DEPTH = 8;

/** The pattern and every ancestor up to the base pattern, nearest first. */
export async function getChain(patternId: string): Promise<ChainNode[]> {
  const db = await getDb();
  const chain: ChainNode[] = [];
  const seen = new Set<string>();
  let current: string | null = patternId;
  while (current && !seen.has(current) && chain.length < MAX_DEPTH) {
    seen.add(current);
    const [row] = await db
      .select()
      .from(schema.patterns)
      .innerJoin(schema.designers, eq(schema.designers.id, schema.patterns.designerId))
      .where(eq(schema.patterns.id, current));
    if (!row) break;
    chain.push({ ...row.patterns, designer: row.designers });
    current = row.patterns.parentId;
  }
  if (chain.length === 0) throw new Error(`Pattern ${patternId} not found`);
  return chain;
}

export const toLinks = (chain: ChainNode[]): ChainLink[] =>
  chain.map((p) => ({ patternId: p.id, designerId: p.designerId, parentShareBp: p.parentShareBp }));

/** Direct remixes of a pattern, for the lineage tree. */
export async function getChildren(patternIds: string[]) {
  if (patternIds.length === 0) return [];
  const db = await getDb();
  return db
    .select()
    .from(schema.patterns)
    .innerJoin(schema.designers, eq(schema.designers.id, schema.patterns.designerId))
    .where(inArray(schema.patterns.parentId, patternIds));
}

/** Would setting `parentId` on `patternId` create a loop? */
export async function wouldCycle(patternId: string, parentId: string) {
  if (patternId === parentId) return true;
  const chain = await getChain(parentId);
  return chain.some((p) => p.id === patternId);
}
