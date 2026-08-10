import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { dirname } from "node:path";

import Database from "better-sqlite3";

export type LocalDb = Database.Database;

function initializeKeywordSchema(db: LocalDb) {
  db.pragma("foreign_keys = ON");
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS local_migration (
      id INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS solution (
      id TEXT PRIMARY KEY,
      problem TEXT NOT NULL,
      solution TEXT NOT NULL,
      tags TEXT,
      score INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS solution_vote (
      solution_id TEXT PRIMARY KEY NOT NULL,
      vote TEXT NOT NULL CHECK (vote IN ('up', 'down')),
      created_at TEXT NOT NULL,
      FOREIGN KEY (solution_id) REFERENCES solution(id) ON DELETE CASCADE
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS solution_fts USING fts5(
      problem,
      solution,
      tags,
      content='solution',
      content_rowid='rowid'
    );
  `);
}

function hasLegacySemanticSchema(db: LocalDb) {
  const names = db
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE name IN ('solution_vec', 'solution_embedding', 'local_config')`,
    )
    .all() as Array<{ name: string }>;
  return names.length > 0;
}

function validateMigratedDb(db: LocalDb, expectedSolutions: number, expectedVotes: number) {
  const solutionCount = (
    db.prepare("SELECT COUNT(*) AS count FROM solution").get() as { count: number }
  ).count;
  const voteCount = (
    db.prepare("SELECT COUNT(*) AS count FROM solution_vote").get() as { count: number }
  ).count;
  const ftsCount = (
    db.prepare("SELECT COUNT(*) AS count FROM solution_fts").get() as { count: number }
  ).count;
  const integrity = db.pragma("integrity_check", { simple: true });
  const foreignKeyErrors = db.pragma("foreign_key_check") as unknown[];
  if (
    solutionCount !== expectedSolutions ||
    voteCount !== expectedVotes ||
    ftsCount !== expectedSolutions ||
    integrity !== "ok" ||
    foreignKeyErrors.length > 0
  ) {
    throw new Error(
      `Keyword-only database migration validation failed (solutions ${solutionCount}/${expectedSolutions}, votes ${voteCount}/${expectedVotes}, FTS ${ftsCount}/${expectedSolutions}, integrity ${String(integrity)}, foreign keys ${foreignKeyErrors.length})`,
    );
  }
}

function withMigrationLock<T>(dbPath: string, migrate: () => T): T {
  const lockPath = `${dbPath}.keyword-v2-migration-lock.sqlite`;
  const lock = new Database(lockPath, { timeout: 120_000 });
  let completed = false;
  try {
    lock.pragma("journal_mode = DELETE");
    lock.exec(`
      CREATE TABLE IF NOT EXISTS migration_lock (
        id INTEGER PRIMARY KEY CHECK (id = 1)
      );
      BEGIN EXCLUSIVE;
    `);
    const result = migrate();
    completed = true;
    return result;
  } finally {
    if (lock.inTransaction) lock.exec(completed ? "COMMIT" : "ROLLBACK");
    lock.close();
  }
}

/**
 * sqlite-vec virtual tables cannot be dropped after the extension is removed:
 * SQLite reports `no such module: vec0`. Rebuild only the durable keyword data
 * into a fresh database and atomically swap it into place instead.
 */
function migrateLegacySemanticDbLocked(dbPath: string) {
  const temporaryPath = `${dbPath}.keyword-v2.tmp`;
  const backupPath = `${dbPath}.semantic-v1.backup`;

  if (!existsSync(dbPath) && existsSync(backupPath)) renameSync(backupPath, dbPath);
  if (!existsSync(dbPath)) return false;
  rmSync(temporaryPath, { force: true });
  rmSync(`${temporaryPath}-wal`, { force: true });
  rmSync(`${temporaryPath}-shm`, { force: true });

  const legacy = new Database(dbPath);
  if (!hasLegacySemanticSchema(legacy)) {
    const integrity = legacy.pragma("integrity_check", { simple: true });
    legacy.close();
    if (integrity === "ok") rmSync(backupPath, { force: true });
    return false;
  }
  legacy.pragma("wal_checkpoint(TRUNCATE)");
  const expectedSolutions = (
    legacy.prepare("SELECT COUNT(*) AS count FROM solution").get() as { count: number }
  ).count;
  const expectedVotes = (
    legacy.prepare("SELECT COUNT(*) AS count FROM solution_vote").get() as { count: number }
  ).count;
  legacy.close();

  const migrated = new Database(temporaryPath);
  try {
    initializeKeywordSchema(migrated);
    migrated.pragma("foreign_keys = OFF");
    migrated.prepare("ATTACH DATABASE ? AS legacy").run(dbPath);
    const copy = migrated.transaction(() => {
      migrated.exec(`
        INSERT INTO solution(rowid, id, problem, solution, tags, score, created_at, updated_at)
        SELECT rowid, id, problem, solution, tags, score, created_at, updated_at
        FROM legacy.solution;

        INSERT INTO solution_vote(solution_id, vote, created_at)
        SELECT solution_id, vote, created_at FROM legacy.solution_vote;

        INSERT OR IGNORE INTO local_migration(id, applied_at)
        SELECT id, applied_at FROM legacy.local_migration;

        INSERT OR REPLACE INTO local_migration(id, applied_at)
        VALUES (2, datetime('now'));

        INSERT INTO solution_fts(solution_fts) VALUES ('rebuild');
      `);
    });
    copy.immediate();
    migrated.exec("DETACH DATABASE legacy");
    migrated.pragma("foreign_keys = ON");
    validateMigratedDb(migrated, expectedSolutions, expectedVotes);
  } catch (error) {
    migrated.close();
    rmSync(temporaryPath, { force: true });
    rmSync(`${temporaryPath}-wal`, { force: true });
    rmSync(`${temporaryPath}-shm`, { force: true });
    throw error;
  }
  migrated.close();

  rmSync(backupPath, { force: true });
  renameSync(dbPath, backupPath);
  rmSync(`${dbPath}-wal`, { force: true });
  rmSync(`${dbPath}-shm`, { force: true });
  try {
    renameSync(temporaryPath, dbPath);
    rmSync(`${temporaryPath}-wal`, { force: true });
    rmSync(`${temporaryPath}-shm`, { force: true });
    const verification = new Database(dbPath);
    initializeKeywordSchema(verification);
    validateMigratedDb(verification, expectedSolutions, expectedVotes);
    verification.close();
    rmSync(backupPath, { force: true });
  } catch (error) {
    rmSync(dbPath, { force: true });
    if (existsSync(backupPath)) renameSync(backupPath, dbPath);
    throw error;
  }
  return true;
}

export function migrateLegacySemanticDb(dbPath: string) {
  if (dbPath === ":memory:") return false;
  const backupPath = `${dbPath}.semantic-v1.backup`;
  if (!existsSync(dbPath) && !existsSync(backupPath)) return false;

  // A separate SQLite database provides a crash-safe, cross-process lock. The
  // lock survives process failure as a small sidecar file, while SQLite itself
  // releases the exclusive transaction automatically when the owner exits.
  return withMigrationLock(dbPath, () => migrateLegacySemanticDbLocked(dbPath));
}

export function openLocalDb(dbPath: string): LocalDb {
  mkdirSync(dirname(dbPath), { recursive: true });
  migrateLegacySemanticDb(dbPath);

  const db = new Database(dbPath);
  initializeKeywordSchema(db);

  return db;
}
