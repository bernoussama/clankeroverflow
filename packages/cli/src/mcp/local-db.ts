import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import Database from "better-sqlite3";

export type LocalDb = Database.Database;

export function openLocalDb(dbPath: string): LocalDb {
  mkdirSync(dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
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

  return db;
}
