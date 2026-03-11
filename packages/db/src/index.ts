import { env } from "@clankeroverflow/env/server";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

const connectionString =
  env.HYPERDRIVE?.connectionString ?? process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL or Hyperdrive binding is required");
}

const pool = new Pool({
  connectionString,
});

export const db = drizzle(pool, { schema });
export { schema };
