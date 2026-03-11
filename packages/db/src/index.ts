import { env } from "@clankeroverflow/env/server";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

let dbInstance: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (dbInstance) return dbInstance;

  const connectionString =
    (env as any).DATABASE_URL ??
    env.HYPERDRIVE?.connectionString ??
    process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL or Hyperdrive binding is required");
  }

  const pool = new Pool({
    connectionString,
  });

  dbInstance = drizzle(pool, { schema });
  return dbInstance;
}

export { schema };
