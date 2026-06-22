import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const alchemyRunSource = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../alchemy.run.ts"),
  "utf8",
);
const serverWranglerSource = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../../../apps/server/wrangler.toml"),
  "utf8",
);
const retrievalBenchmarkSource = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../retrieval-benchmark.run.ts"),
  "utf8",
);

describe("infra worker config", () => {
  it("loads local TypeScript helpers without static .ts imports", () => {
    expect(alchemyRunSource).toContain('new URL("./src/env.ts", import.meta.url).href');
    expect(alchemyRunSource).not.toContain('from "./src/env"');
    expect(alchemyRunSource).not.toContain('from "./src/env.ts"');
  });

  it("persists deploy state in Cloudflare while keeping local dev state on disk", () => {
    expect(alchemyRunSource).toContain(
      'import { CloudflareStateStore, FileSystemStateStore } from "alchemy/state"',
    );
    expect(alchemyRunSource).toContain("scope.local");
    expect(alchemyRunSource).toContain("new FileSystemStateStore(scope)");
    expect(alchemyRunSource).toContain("new CloudflareStateStore(scope, {");
    expect(alchemyRunSource).toContain('createHash("sha256")');
    expect(alchemyRunSource).toContain("CLOUDFLARE_API_TOKEN");
  });

  it("adopts the existing web worker during deploys", () => {
    expect(alchemyRunSource).toContain('Nextjs("web", {');
    expect(alchemyRunSource).toContain("adopt: true");
  });

  it("binds production custom domains for web and server", () => {
    expect(alchemyRunSource).toContain('domainName: "www.clankeroverflow.com"');
    expect(alchemyRunSource).toContain('domainName: "api.clankeroverflow.com"');
    expect(alchemyRunSource).toContain("domains:");
  });

  it("disables Hyperdrive query caching for transactional API reads", () => {
    expect(alchemyRunSource).toContain('Hyperdrive("hyperdrive", {');
    expect(alchemyRunSource).toContain("caching: {");
    expect(alchemyRunSource).toContain("disabled: true");
  });

  it("passes GitHub OAuth credentials to the auth worker", () => {
    expect(alchemyRunSource).toContain("GITHUB_CLIENT_ID");
    expect(alchemyRunSource).toContain("GITHUB_CLIENT_SECRET");
  });

  it("enables production source maps for Sentry readable stack traces", () => {
    expect(alchemyRunSource).toContain("sourceMap: true");
    expect(serverWranglerSource).toContain("upload_source_maps = true");
  });

  it("binds Sentry runtime configuration to the server worker", () => {
    expect(alchemyRunSource).toContain("SENTRY_DSN");
    expect(alchemyRunSource).toContain("SENTRY_TEST_TOKEN");
    expect(alchemyRunSource).toContain("ENVIRONMENT: deploymentEnvironment");
    expect(alchemyRunSource).toContain("SERVICE_VERSION: serviceVersion");
    expect(alchemyRunSource).toContain("COMMIT_SHA: commitSha");
  });

  it("keeps remote semantic search bindings out of basic local Wrangler dev", () => {
    expect(alchemyRunSource).toContain("AI: workersAi");
    expect(alchemyRunSource).toContain("SOLUTION_VECTORS: solutionVectorIndex");
    expect(serverWranglerSource).not.toContain("[ai]");
    expect(serverWranglerSource).not.toContain("[[vectorize]]");
  });

  it("isolates disposable retrieval infrastructure from production resources", () => {
    expect(retrievalBenchmarkSource).toContain('alchemy("clankeroverflow-retrieval-benchmark"');
    expect(retrievalBenchmarkSource).toContain('VectorizeIndex("benchmark-vectors"');
    expect(retrievalBenchmarkSource).not.toContain("adopt:");
    expect(retrievalBenchmarkSource).not.toContain("domains:");
  });
});
