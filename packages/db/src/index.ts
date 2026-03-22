import { env } from "@clankeroverflow/env/server";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Client, Pool } from "pg";

import * as schema from "./schema";
import { getDatabaseRuntime, resolveConnectionString, type DatabaseEnv } from "./runtime";

export type Database = NodePgDatabase<typeof schema>;

type RequestDatabase = {
  close: () => Promise<void>;
  db: Database;
};

let dbInstance: Database | null = null;
let poolInstance: Pool | null = null;

function getDatabaseEnv(): DatabaseEnv {
  return {
    ...(env as DatabaseEnv),
    DATABASE_URL: (env as DatabaseEnv).DATABASE_URL ?? process.env.DATABASE_URL,
  };
}

export function getDb(): Database {
  if (dbInstance) return dbInstance;

  const databaseEnv = getDatabaseEnv();
  const connectionString = resolveConnectionString(databaseEnv);

  if (!connectionString) {
    throw new Error("DATABASE_URL or Hyperdrive binding is required");
  }

  if (getDatabaseRuntime(databaseEnv) === "request") {
    throw new Error("getDb cannot be used with Hyperdrive. Use createDb instead.");
  }

  if (!poolInstance) {
    poolInstance = new Pool({
      connectionString,
      connectionTimeoutMillis: 10000,
      max: 1,
      idleTimeoutMillis: 0,
    });
  }

  dbInstance = drizzle(poolInstance, { schema });
  return dbInstance;
}

export async function createDb(): Promise<RequestDatabase> {
  const databaseEnv = getDatabaseEnv();
  const connectionString = resolveConnectionString(databaseEnv);

  if (!connectionString) {
    throw new Error("DATABASE_URL or Hyperdrive binding is required");
  }

  if (getDatabaseRuntime(databaseEnv) === "pooled") {
    return {
      close: async () => {},
      db: getDb(),
    };
  }

  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 5000,
  });

  await client.connect();

  return {
    close: async () => {
      await client.end();
    },
    db: drizzle(client, { schema }),
  };
}

export { schema };
