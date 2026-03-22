import dotenv from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

import * as schema from "./schema";

// Load environment variables from apps/server/.env
dotenv.config({ path: "../../apps/server/.env" });

async function runMigrations() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required. Set it in apps/server/.env");
  }

  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema });

  const migrationsFolder = fileURLToPath(new URL("./migrations", import.meta.url));

  console.log("Running migrations from:", migrationsFolder);

  try {
    await migrate(db, { migrationsFolder });
    console.log("✅ Migrations completed successfully");
  } finally {
    await pool.end();
  }
}

runMigrations().catch((error) => {
  console.error("❌ Migration failed:", error);
  process.exit(1);
});
