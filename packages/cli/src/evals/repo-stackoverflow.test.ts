import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { detectsSensitiveContent, parseArg, runRepoStackOverflowEval } from "./repo-stackoverflow";

describe("Repo StackOverflow reuse eval", () => {
  test("learns, syncs, and retrieves the Expo fixture in pass 2", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "clanker-repo-stackoverflow-workspace-"));
    try {
      const result = await runRepoStackOverflowEval({ workspaceRoot });

      expect(result.metrics.learnCapture).toBe(true);
      expect(result.metrics.repoNoteCreated).toBe(true);
      expect(result.metrics.syncImportSuccess).toBe(true);
      expect(result.metrics.pass2Retrieval).toBe(true);
      expect(result.metrics.unsafeCopying).toBe(false);
      expect(
        result.raw.pass2ReturnedIds.some((id) => result.raw.pass2ImportedIds.includes(id)),
      ).toBe(true);
      expect(existsSync(result.artifacts.jsonPath!)).toBe(true);
      expect(readFileSync(result.artifacts.markdownPath!, "utf8")).toContain(
        "ClankerOverflow Repo StackOverflow Reuse Eval",
      );
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });
});

describe("Repo StackOverflow eval arguments", () => {
  test("rejects a missing option value", () => {
    expect(() => parseArg(["--output-json", "--workspace-root", "/tmp"], "--output-json")).toThrow(
      "--output-json requires a value",
    );
  });

  test("detects quoted environment secrets", () => {
    expect(detectsSensitiveContent('API_KEY="secret"')).toBe(true);
    expect(detectsSensitiveContent("verification passed")).toBe(false);
  });
});
