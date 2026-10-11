import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { pullTeam, pushTeam, type TeamRemote } from "./sync";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("team sync", () => {
  test("pulls a changed document and pushes a local edit", async () => {
    const root = mkdtempSync(join(tmpdir(), "clanker-sync-"));
    directories.push(root);
    const docs = new Map<string, { rev: number; markdown: string }>();
    const remote: TeamRemote = {
      async changes() {
        return [{ seq: 1, path: "backend/ports.md", rev: 1, op: "create" }];
      },
      async read(path) {
        return docs.get(path) ?? { rev: 1, markdown: "# Ports\n\nUse 5173.\n" };
      },
      async write(input) {
        const rev = (docs.get(input.path)?.rev ?? 0) + 1;
        docs.set(input.path, { rev, markdown: input.markdown });
        return { status: "written", rev };
      },
    };

    const pulled = await pullTeam(root, remote);
    expect(pulled.pulled).toBe(1);
    expect(readFileSync(join(root, "backend/ports.md"), "utf8")).toContain("5173");

    const pushed = await pushTeam(root, remote, [
      { path: "backend/ports.md", markdown: "# Ports\n\nUse 3000.\n" },
    ]);
    expect(pushed.pushed).toBe(1);
    expect(docs.get("backend/ports.md")?.markdown).toContain("3000");
  });

  test("writes a conflict file when the server rejects the base revision", async () => {
    const root = mkdtempSync(join(tmpdir(), "clanker-sync-conflict-"));
    directories.push(root);
    const remote: TeamRemote = {
      async changes() {
        return [];
      },
      async read() {
        return null;
      },
      async write() {
        return { status: "conflict", markdown: "# Server copy\n" };
      },
    };
    const result = await pushTeam(root, remote, [{ path: "notes.md", markdown: "# Local copy\n" }]);
    expect(result.conflicts).toEqual(["notes.md"]);
    expect(readFileSync(join(root, "notes.conflict.md"), "utf8")).toContain("Server copy");
  });
});
