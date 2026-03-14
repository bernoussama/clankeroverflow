import { env } from "@clankeroverflow/env/server";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

type Database = NodePgDatabase<typeof schema>;
type DatabaseEnv = typeof env & {
  DATABASE_URL?: string;
  HYPERDRIVE?: {
    connectionString?: string;
  };
};

let dbInstance: Database | null = null;

export function getDb(): Database {
  if (dbInstance) return dbInstance;

  const databaseEnv = env as DatabaseEnv;
  const connectionString =
    databaseEnv.DATABASE_URL ??
    databaseEnv.HYPERDRIVE?.connectionString ??
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
