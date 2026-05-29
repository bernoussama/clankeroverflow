import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const workflowSource = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../../../.github/workflows/cd.yml"),
  "utf8",
);

describe("CD workflow", () => {
  it("deploys production after CI succeeds on master and supports manual dispatches", () => {
    expect(workflowSource).toContain("name: CD");
    expect(workflowSource).toContain("workflow_run:");
    expect(workflowSource).toContain("- CI");
    expect(workflowSource).toContain("- completed");
    expect(workflowSource).toContain("workflow_dispatch:");
    expect(workflowSource).toContain("branches:\n      - master");
    expect(workflowSource).toContain("environment: production");
    expect(workflowSource).toContain(
      "if: github.event_name == 'workflow_dispatch' || github.event.workflow_run.conclusion == 'success'",
    );
    expect(workflowSource).toContain("run: pnpm run deploy");
  });

  it("provides the environment required by Alchemy deploys", () => {
    for (const name of [
      "ALCHEMY_PASSWORD",
      "CLOUDFLARE_ACCOUNT_ID",
      "CLOUDFLARE_API_TOKEN",
      "DATABASE_URL",
      "BETTER_AUTH_SECRET",
      "BETTER_AUTH_URL",
      "GITHUB_CLIENT_ID",
      "GITHUB_CLIENT_SECRET",
      "NEXT_PUBLIC_SERVER_URL",
      "POSTHOG_API_KEY",
      "POSTHOG_HOST",
      "COMMIT_SHA",
      "SERVICE_VERSION",
    ]) {
      expect(workflowSource).toContain(`${name}:`);
    }
  });
});
