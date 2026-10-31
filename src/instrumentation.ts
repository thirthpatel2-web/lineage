// Runs once when the server starts. On an empty database it loads the demo data, so a fresh
// `npm run dev` or a fresh Render deploy (SEED_DEMO=1) opens on a working demo.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
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
