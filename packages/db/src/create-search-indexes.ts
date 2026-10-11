import dotenv from "dotenv";
import { Pool } from "pg";

dotenv.config({ path: "../../apps/server/.env" });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required. Set it in apps/server/.env");

const pool = new Pool({ connectionString });
try {
  await pool.query(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS "kb_document_search_idx"
    ON "kb_document" USING gin (to_tsvector('simple', lower("body")))
  `);
  console.log("Knowledge base search index is ready");
} finally {
  await pool.end();
}
