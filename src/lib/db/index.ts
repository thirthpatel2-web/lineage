import path from "node:path";
import { drizzle as drizzlePostgres, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import { env } from "@/lib/env";
import * as schema from "./schema";

// Real Postgres when DATABASE_URL is set (production), otherwise an embedded PGlite database in
// ./.data so `npm run dev` works with no setup. Both speak the same SQL and the same Drizzle API.
export type Db = PostgresJsDatabase<typeof schema>;

const MIGRATIONS = path.join(process.cwd(), "drizzle");

const globalForDb = globalThis as unknown as { lineageDb?: Promise<Db> };

async function connect(): Promise<Db> {
  if (env.databaseUrl) {
    const { default: postgres } = await import("postgres");
    const client = postgres(env.databaseUrl, { max: 5, prepare: false });
    const db = drizzlePostgres(client, { schema });
    await migratePostgres(db, { migrationsFolder: MIGRATIONS });
    return db;
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dataDir = path.join(process.cwd(), ".data");
  (await import("node:fs")).mkdirSync(dataDir, { recursive: true });
  const client = new PGlite(path.join(dataDir, "pglite"));
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db as unknown as Db;
}

export function getDb(): Promise<Db> {
  globalForDb.lineageDb ??= connect().catch((error) => {
    globalForDb.lineageDb = undefined;
    throw error;
  });
  return globalForDb.lineageDb;
}

export { schema };
