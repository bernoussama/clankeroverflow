import dotenv from "dotenv";
import { Pool } from "pg";

dotenv.config({ path: "../../apps/server/.env" });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required. Set it in apps/server/.env");

const pool = new Pool({ connectionString });
try {
  await pool.query(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS "solution_search_vector_unicode_idx"
    ON "solution" USING gin (
      to_tsvector(
        'simple',
        lower(coalesce("problem", '') || ' ' || coalesce("solution", '') || ' ' || coalesce("tags", ''))
      )
    )
  `);
  await pool.query(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS "solution_search_trgm_unicode_idx"
    ON "solution" USING gin (
      (lower(coalesce("problem", '') || ' ' || coalesce("solution", '') || ' ' || coalesce("tags", ''))) gin_trgm_ops
    )
  `);
  await pool.query(`DROP INDEX CONCURRENTLY IF EXISTS "solution_search_vector_idx"`);
  await pool.query(`DROP INDEX CONCURRENTLY IF EXISTS "solution_search_trgm_idx"`);
  console.log("Unicode search indexes are ready");
} finally {
  await pool.end();
}
