import { describe, expect, it } from "bun:test";

describe("auth password helpers", () => {
  it("round-trips passwords with the worker-compatible hash format", async () => {
    const passwordModule = await import("./password").catch(() => null);

    expect(passwordModule).not.toBeNull();

    if (!passwordModule) {
      return;
    }

    const hash = await passwordModule.hashPassword("password123");

    expect(hash).toMatch(/^[a-f0-9]{32}:[a-f0-9]{128}$/);
    await expect(
      passwordModule.verifyPassword({
        password: "password123",
        hash,
      }),
    ).resolves.toBe(true);
    await expect(
      passwordModule.verifyPassword({
        password: "wrong-password",
        hash,
      }),
    ).resolves.toBe(false);
  });
});
