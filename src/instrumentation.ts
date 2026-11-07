// Runs once when the server starts. On an empty database it loads the demo data, so a fresh
// `npm run dev` or a fresh Render deploy (SEED_DEMO=1) opens on a working demo.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { seedIfEmpty } = await import("./instrumentation-node");
    await seedIfEmpty();
  }
}
