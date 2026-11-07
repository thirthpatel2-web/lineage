// Node-only start-up work, kept out of instrumentation.ts so the edge build never sees it.
export async function seedIfEmpty() {
  const wantsSeed = process.env.SEED_DEMO === "1" || !process.env.DATABASE_URL;
  if (!wantsSeed) return;
  try {
    const { getDb, schema } = await import("@/lib/db");
    const db = await getDb();
    const existing = await db.select({ id: schema.designers.id }).from(schema.designers).limit(1);
    if (existing.length > 0) return;
    const { seedDemo } = await import("@/lib/seed");
    console.log("[lineage] empty database: loading demo data…");
    await seedDemo((line) => console.log(`[lineage] ${line}`));
  } catch (error) {
    console.error("[lineage] demo seed failed", error);
  }
}
