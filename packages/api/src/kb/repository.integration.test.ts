import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, describe, expect, test } from "vitest";

import { user } from "@clankeroverflow/db/schema/auth";
import { DrizzleTeamRepository, dreamPersistedTeams, openTeamSession } from "./repository";

const connectionString = process.env.DATABASE_URL;
const describeLive = connectionString ? describe : describe.skip;

describeLive("Postgres team knowledge", () => {
  const pool = new Pool({ connectionString });
  const db = drizzle(pool);
  const repository = new DrizzleTeamRepository(db);
  const teamId = `user-${Date.now()}`;

  afterAll(async () => {
    await pool.end();
  });

  test("reloads a document after a new session and dreams only once", async () => {
    await db
      .insert(user)
      .values({
        id: teamId,
        name: "Proof",
        email: `${teamId}@example.com`,
      })
      .onConflictDoNothing();

    const first = await openTeamSession({ repository, teamId });
    const written = await first.team.write({
      path: "backend/ports.md",
      markdown: `---
id: "ports"
title: "Vite exits with EADDRINUSE"
type: fix
area: "backend"
tags: ["vite"]
aliases: []
error_signatures: ["EADDRINUSE"]
status: draft
confirmations: 0
authors: ["${teamId}"]
created: "2026-10-11"
updated: "2026-10-11"
---

## Problem
Vite exits with EADDRINUSE on port 5173

## Root Cause
Another process holds the port.

## Fix
Start Vite with --port on a free port.

## Verification
The dev server started.
`,
      baseRev: null,
      source: "api",
      author: teamId,
      force: true,
    });
    await first.commit();

    const second = await openTeamSession({ repository, teamId });
    const hits = second.team.search("EADDRINUSE");
    const dreamed = await dreamPersistedTeams({ repository, tokenBudget: 4000 });
    const again = await dreamPersistedTeams({ repository, tokenBudget: 4000 });

    expect(written.status).toBe("written");
    expect(hits[0]?.title).toContain("EADDRINUSE");
    expect(second.team.read("backend/ports.md")?.rev).toBeGreaterThan(0);
    expect(dreamed.find((run) => run.teamId === teamId)?.skipped).toBe(false);
    expect(again.find((run) => run.teamId === teamId)?.skipped).toBe(true);
  });
});
