import { describe, expect, test } from "vitest";
import registerReminder, { shouldRemindForPrompt } from "../extensions/clankeroverflow-reminder";

describe("Pi ClankerOverflow reminder", () => {
  test.each([
    "Will nvidia-run still work without nvidia-persistenced?",
    "Does disabling NVIDIA persistence allow D3cold?",
    "Does Better Auth trustedOrigins accept IP origins?",
    "Will Cloudflare Workers support this Node API?",
    "Does Stripe require the raw body for webhook verification?",
    "Does Prisma retry Neon cold-start connection failures?",
    "Implement Stripe webhook verification in Workers",
    "The build fails with UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  ])("requires search for reusable technical behavior: %s", (prompt) => {
    expect(shouldRemindForPrompt(prompt)).toBe(true);
  });

  test.each([
    "What is a daemon?",
    "Explain PRIME render offload conceptually.",
    "Which GPU vendor do you prefer?",
    "Rename nvidia-run to gpu-run.",
    "Fix a typo in the README.",
    "Commit these changes with git.",
    "Apply our private business logic for invoice approval.",
  ])("does not remind for explicit skip: %s", (prompt) => {
    expect(shouldRemindForPrompt(prompt)).toBe(false);
  });

  test("injects at most one CLI reminder for a qualifying prompt", async () => {
    const handlers = new Map<string, (event: any) => Promise<any>>();
    registerReminder({ on: (name: string, handler: any) => handlers.set(name, handler) } as any);

    const result = await handlers.get("before_agent_start")!({
      prompt: "Does Stripe require a raw webhook body?",
    });
    expect(result.message.content).toContain("npx -y @clankeroverflow/cli search");
    expect(result.message.content).toContain("Search before answering");

    const toolResult = await handlers.get("tool_result")!({
      isError: true,
      content: [{ type: "text", text: "UNABLE_TO_VERIFY_LEAF_SIGNATURE" }],
    });
    expect(toolResult).toBeUndefined();
  });

  test("adds a reminder when a tool introduces a failure on an otherwise skipped turn", async () => {
    const handlers = new Map<string, (event: any) => Promise<any>>();
    registerReminder({ on: (name: string, handler: any) => handlers.set(name, handler) } as any);
    await handlers.get("before_agent_start")!({ prompt: "Update the README prose." });

    const result = await handlers.get("tool_result")!({
      isError: true,
      content: [{ type: "text", text: "Command failed: ECONNRESET" }],
    });
    expect(result.content.at(-1).text).toContain("search required");
    expect(result.content.at(-1).text).toContain("before answering, debugging, inspecting");
  });
});
