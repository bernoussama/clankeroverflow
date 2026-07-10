import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
  DEFAULT_REPO_SOLUTIONS_DIR,
  exportLocalSolutions,
  learnSolution,
  parseLearnMarkdown,
  syncRepoSolutions,
  type LearnInput,
} from "./learn";
import { resolveConfig } from "./mcp/config";
import { LocalBackend } from "./mcp/local-backend";

function localConfig(dir: string, dbName = "solutions.sqlite") {
  return resolveConfig(
    {
      CLANKER_MODE: "local",
      CLANKER_LOCAL_DB: join(dir, dbName),
      CLANKER_LOCAL_SEMANTIC: "0",
    },
    { configPath: join(dir, `${dbName}.config.json`), home: dir },
  );
}

function createRepo(dir: string) {
  const repoRoot = join(dir, "repo");
  mkdirSync(join(repoRoot, ".git"), { recursive: true });
  return repoRoot;
}

const expoInput: LearnInput = {
  problem: "Expo Router reload keeps stale native bundle after SDK upgrade",
  rootCause: "Metro kept the old native module graph after the SDK changed.",
  solution: "Clear Metro and Expo caches, then rebuild the native runtime.",
  verification: "pnpm expo start --clear loaded the new native module graph.",
  tags: "expo,metro",
  fingerprints: "expo metro stale native bundle",
  framework: "Expo",
  packageManager: "pnpm",
  runtime: "React Native",
};

describe("learn workflow", () => {
  test("requires verification before learning", async () => {
    const dir = mkdtempSync(join(tmpdir(), "clanker-learn-required-"));
    try {
      await expect(
        learnSolution(
          { ...expoInput, verification: "" },
          { config: localConfig(dir), mirror: false },
        ),
      ).rejects.toThrow("verification is required");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("learns a structured Q/A, writes a repo note, redacts sensitive text, and retrieves it", async () => {
    const dir = mkdtempSync(join(tmpdir(), "clanker-learn-flow-"));
    const repoRoot = createRepo(dir);
    const config = localConfig(dir);

    try {
      const result = await learnSolution(
        {
          ...expoInput,
          solution:
            "Clear Metro cache with SECRET_TOKEN=super-private and remove sk_test_12345678901234567890 from logs.",
          repoNote: "Observed at /home/oussama/private/app and http://service.internal/debug.",
        },
        { config, repoRoot, dedupe: false },
      );

      expect(result.status).toBe("logged");
      expect(result.source).toBe("local");
      expect(result.repoNotePath).toBeDefined();
      expect(existsSync(result.repoNotePath!)).toBe(true);
      expect(result.warnings.join("\n")).toContain("Redacted");

      const note = readFileSync(result.repoNotePath!, "utf8");
      expect(note).toContain("# Problem");
      expect(note).toContain("Expo Router reload keeps stale native bundle");
      expect(note).not.toContain("super-private");
      expect(note).not.toContain("sk_test_12345678901234567890");
      expect(note).not.toContain("/home/oussama/private/app");
      expect(note).not.toContain("service.internal");

      const parsed = parseLearnMarkdown(note);
      expect(parsed.rootCause).toContain("Metro kept the old native module graph");
      expect(parsed.verification).toContain("pnpm expo start --clear");

      const backend = new LocalBackend(config.localDbPath);
      const results = await backend.search({
        query: "expo metro stale native bundle",
        limit: 1,
        mode: "keyword",
      });
      expect(results[0]?.id).toBe(result.id);
      expect(results[0]?.solution).toContain("## Root Cause");
      expect(results[0]?.solution).toContain("## Verification");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("deduplicates by searching before logging", async () => {
    const dir = mkdtempSync(join(tmpdir(), "clanker-learn-dedupe-"));
    const config = localConfig(dir);

    try {
      const first = await learnSolution(expoInput, { config, mirror: false, dedupe: false });
      const second = await learnSolution(expoInput, { config, mirror: false });

      expect(second.status).toBe("duplicate");
      expect(second.id).toBe(first.id);
      expect(second.duplicateIds).toEqual([first.id]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("sync imports repo notes into a fresh DB and export regenerates Markdown from DB", async () => {
    const dir = mkdtempSync(join(tmpdir(), "clanker-learn-sync-export-"));
    const repoRoot = createRepo(dir);
    const sourceConfig = localConfig(dir, "source.sqlite");
    const importedConfig = localConfig(dir, "imported.sqlite");
    const exportRepo = join(dir, "export-repo");
    mkdirSync(join(exportRepo, ".git"), { recursive: true });

    try {
      await learnSolution(expoInput, {
        config: sourceConfig,
        repoRoot,
        dedupe: false,
      });

      const synced = await syncRepoSolutions({
        config: importedConfig,
        repoRoot,
        mirror: false,
        dedupe: false,
      });
      expect(synced.files).toHaveLength(1);
      expect(synced.results[0]?.status).toBe("logged");

      const importedBackend = new LocalBackend(importedConfig.localDbPath);
      const importedResults = await importedBackend.search({
        query: "expo metro stale native bundle",
        limit: 1,
        mode: "keyword",
      });
      expect(importedResults[0]?.problem).toContain("Expo Router reload");

      const exported = exportLocalSolutions({ config: importedConfig, repoRoot: exportRepo });
      expect(exported.paths).toHaveLength(1);
      const exportedFiles = readdirSync(join(exportRepo, DEFAULT_REPO_SOLUTIONS_DIR));
      expect(exportedFiles[0]).toMatch(/expo-router-reload/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
