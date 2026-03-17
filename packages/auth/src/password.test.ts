import { describe, expect, it } from "bun:test";

import { hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("verifies a legacy Better Auth scrypt hash", async () => {
    await expect(
      verifyPassword({
        hash: "6b0bc6ecd8848b27c877b3aa39b2e1a6:df2ec987d254ed06f1d8feab23a4c9d8ba8fbf669caedd31cbab71abc7fd95c616de5efcc76e0d935ea03aa21a5904dd4749d8abeba0bac113093784d382a3fb",
        password: "password123",
      }),
    ).resolves.toBe(true);
  });

  it("rejects a mismatched legacy Better Auth scrypt hash", async () => {
    await expect(
      verifyPassword({
        hash: "6b0bc6ecd8848b27c877b3aa39b2e1a6:df2ec987d254ed06f1d8feab23a4c9d8ba8fbf669caedd31cbab71abc7fd95c616de5efcc76e0d935ea03aa21a5904dd4749d8abeba0bac113093784d382a3fb",
        password: "different-password",
      }),
    ).resolves.toBe(false);
  });

  it("verifies a password against its stored hash", async () => {
    const hash = await hashPassword("password123");

    await expect(
      verifyPassword({
        hash,
        password: "password123",
      }),
    ).resolves.toBe(true);
  });

  it("rejects a mismatched password", async () => {
    const hash = await hashPassword("password123");

    await expect(
      verifyPassword({
        hash,
        password: "different-password",
      }),
    ).resolves.toBe(false);
  });
});
